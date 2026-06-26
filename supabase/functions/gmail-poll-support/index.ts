// Polls the support@merchanthaus.io Gmail inbox via the Lovable connector
// gateway and turns unread messages into support tickets (creating new ones or
// threading replies onto existing MH-#### tickets). Runs on a 5-minute cron.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyCategory,
  extractDisplayName,
  extractEmailAddress,
  findTicketNumber,
  matchAccountByEmail,
  stripHtml,
  stripQuotedReply,
} from "../_shared/support-intake.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const b64urlDecode = (s: string): string => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    const bin = atob(b);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
};

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
}

const extractBody = (payload: GmailPart): { text: string; html: string } => {
  let text = "";
  let html = "";
  const walk = (p: GmailPart) => {
    if (p.body?.data) {
      const decoded = b64urlDecode(p.body.data);
      if (p.mimeType === "text/plain" && !text) text = decoded;
      else if (p.mimeType === "text/html" && !html) html = decoded;
    }
    p.parts?.forEach(walk);
  };
  walk(payload);
  return { text, html };
};

const headerVal = (payload: GmailPart, name: string): string => {
  const h = payload.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
};

async function gmailFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY")!;
  return await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
      return json({ error: "Gmail connector not configured" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // List unread messages addressed to the support alias, last 2 days.
    const q = encodeURIComponent("to:support@merchanthaus.io is:unread newer_than:2d");
    const listRes = await gmailFetch(`/users/me/messages?maxResults=25&q=${q}`);
    if (!listRes.ok) {
      const t = await listRes.text();
      return json({ error: "list failed", detail: t }, 502);
    }
    const list = await listRes.json();
    const messages: Array<{ id: string; threadId: string }> = list.messages ?? [];

    const results: Array<Record<string, unknown>> = [];

    for (const m of messages) {
      const msgRes = await gmailFetch(`/users/me/messages/${m.id}?format=full`);
      if (!msgRes.ok) {
        results.push({ id: m.id, skipped: "fetch failed" });
        continue;
      }
      const msg = await msgRes.json();
      const payload: GmailPart = msg.payload ?? {};

      const fromRaw = headerVal(payload, "From");
      const subject = headerVal(payload, "Subject") || "(no subject)";
      const messageId = headerVal(payload, "Message-ID");
      const email = extractEmailAddress(fromRaw);
      const name = extractDisplayName(fromRaw) || email;

      // Skip mail we sent ourselves and obvious bounces/auto-replies.
      if (!email || email.endsWith("@merchanthaus.io")) {
        await gmailFetch(`/users/me/messages/${m.id}/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        });
        results.push({ id: m.id, skipped: "internal sender" });
        continue;
      }

      const { text, html } = extractBody(payload);
      const body = text || (html ? stripHtml(html) : "");
      const cleanBody = stripQuotedReply(body) || "(no message body)";

      const ref = findTicketNumber(subject) || findTicketNumber(body.slice(0, 800));

      if (ref) {
        const { data: existing } = await supabase
          .from("support_tickets")
          .select("id, ticket_number, status")
          .eq("ticket_number", ref)
          .maybeSingle();

        if (existing) {
          await supabase.from("support_ticket_comments").insert({
            ticket_id: existing.id,
            body: cleanBody,
            is_internal: false,
            author_type: "customer",
            author_name: name,
          });
          const patch: Record<string, unknown> = {
            gmail_thread_id: m.threadId,
            gmail_message_id: messageId || null,
          };
          if (existing.status === "closed") patch.status = "open";
          await supabase.from("support_tickets").update(patch).eq("id", existing.id);
          results.push({ id: m.id, threaded: existing.ticket_number });
        }
      } else {
        const category = classifyCategory(`${subject} ${cleanBody}`);
        const { account_id, contact_id } = await matchAccountByEmail(supabase, email);
        const { data: ticket, error } = await supabase
          .from("support_tickets")
          .insert({
            subject: subject.replace(/^\s*(re|fwd?):\s*/i, "").trim() || "(no subject)",
            description: cleanBody,
            category,
            priority: "normal",
            status: "open",
            source: "email",
            requester_name: name,
            requester_email: email,
            account_id,
            contact_id,
          })
          .select("id, ticket_number")
          .single();
        if (error) {
          results.push({ id: m.id, error: error.message });
          continue;
        }
        results.push({ id: m.id, created: ticket.ticket_number, messageId });
      }

      // Mark processed: remove UNREAD label so we don't re-poll.
      await gmailFetch(`/users/me/messages/${m.id}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      });
    }

    return json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error("gmail-poll-support error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
