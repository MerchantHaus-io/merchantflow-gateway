// Inbound-email webhook → support ticket.
//
// Point a support inbox's inbound/parse webhook at this function. It accepts
// the common payload shapes (Resend inbound `inbound.email.received`, Postmark,
// SendGrid Inbound Parse, Mailgun, or a plain `{ from, subject, text }` POST).
//
// Behaviour:
//   * If the subject/body references an existing ticket (MH-####), the message
//     is appended to that ticket as a customer reply (reopening it if closed).
//   * Otherwise a new ticket is created, auto-classified by keyword.
//
// Optional spam guard: set SUPPORT_INBOUND_SECRET and pass it as the
// `x-webhook-secret` header or `?secret=` query param.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyCategory,
  extractDisplayName,
  extractEmailAddress,
  findTicketNumber,
  matchAccountByEmail,
  sanitizeInboundBody,
} from "../_shared/support-intake.ts";
import { sendGmail } from "../_shared/gmail-send.ts";

const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX_EMAIL") || "support@merchanthaus.io";
const INBOUND_SECRET = Deno.env.get("SUPPORT_INBOUND_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (str: string): string =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pick = (obj: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
};

interface ParsedEmail {
  fromRaw: string;
  subject: string;
  text: string;
  html: string;
}

const parseInbound = async (req: Request): Promise<ParsedEmail> => {
  const contentType = req.headers.get("content-type") || "";
  let payload: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) payload[k] = typeof v === "string" ? v : "";
  } else {
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
  }

  // Unwrap provider envelopes: Resend uses { type, data: {...} }.
  const data: Record<string, unknown> =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  // Postmark exposes FromFull: { Email, Name }.
  let fromRaw = pick(data, ["from", "From", "sender", "Sender"]);
  if (!fromRaw && data.FromFull && typeof data.FromFull === "object") {
    const ff = data.FromFull as Record<string, unknown>;
    fromRaw = [ff.Name, ff.Email].filter(Boolean).join(" ");
  }

  const subject = pick(data, ["subject", "Subject"]) || "(no subject)";

  const text = pick(data, ["text", "TextBody", "plain", "body-plain", "body", "stripped-text"]);
  const html = pick(data, ["html", "HtmlBody", "body-html"]);

  return { fromRaw, subject, text, html };
};

const sendEmail = async (to: string, subject: string, html: string) => {
  if (!to) return;
  const result = await sendGmail({
    from: `Merchant Haus Support <${SUPPORT_INBOX}>`,
    to,
    subject,
    html,
    replyTo: SUPPORT_INBOX,
  });
  if (!result.ok) console.error("Gmail send failed:", result.error);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (INBOUND_SECRET) {
      const headerSecret = req.headers.get("x-webhook-secret");
      const querySecret = new URL(req.url).searchParams.get("secret");
      if (headerSecret !== INBOUND_SECRET && querySecret !== INBOUND_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const { fromRaw, subject, text, html } = await parseInbound(req);
    const email = extractEmailAddress(fromRaw);
    const name = extractDisplayName(fromRaw) || email;

    if (!email) {
      console.warn("Inbound email had no usable From address:", fromRaw);
      return json({ ok: true, skipped: "no sender" });
    }

    const cleanBody = sanitizeInboundBody(text, html);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Thread onto an existing ticket if the message references one. ──
    const ref = findTicketNumber(subject) || findTicketNumber((text || html || "").slice(0, 800));
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

        if (existing.status === "closed") {
          await supabase.from("support_tickets").update({ status: "open" }).eq("id", existing.id);
        }

        return json({ ok: true, threaded: existing.ticket_number });
      }
    }

    // ── Otherwise create a new ticket. ──
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
      console.error("Failed to create ticket from inbound email:", error);
      return json({ error: "Could not create ticket" }, 500);
    }

    await sendEmail(
      email,
      `[${ticket.ticket_number}] We've received your message`,
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
        <h2 style="font-size:18px">Thanks for contacting Merchant Haus Support</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>We've logged your message as ticket
          <strong>${escapeHtml(ticket.ticket_number)}</strong> and a member of our team will be in touch.</p>
        <p style="color:#71717a;font-size:13px">Please keep <strong>${escapeHtml(ticket.ticket_number)}</strong>
          in the subject line when replying so we can keep everything on one thread.</p>
        <p style="color:#71717a;font-size:13px">— Merchant Haus Support</p>
      </div>`,
    );

    return json({ ok: true, created: ticket.ticket_number, category });
  } catch (err) {
    console.error("support-inbound-email error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
