// Sends an agent's public reply on a support ticket to the requester as a real
// email, threaded onto the original Gmail conversation so it lands as a reply.
// The ticket comment itself is written by the caller (the dashboard); this
// function is purely the outbound-email side of a public reply.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail } from "../_shared/gmail-send.ts";
import { escapeHtml, infoCard, renderBrandedEmail } from "../_shared/email-layout.ts";

const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX_EMAIL") || "support@merchanthaus.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticket_id, body, agent_name } = await req.json();
    if (!ticket_id) return json({ error: "ticket_id is required" }, 400);
    const message = String(body ?? "").trim();
    if (!message) return json({ error: "body is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, requester_email, requester_name, gmail_thread_id, gmail_message_id",
      )
      .eq("id", ticket_id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!ticket) return json({ error: "Ticket not found" }, 404);
    if (!ticket.requester_email) return json({ error: "Ticket has no requester email" }, 400);

    const cleanSubject = String(ticket.subject || "Support request")
      .replace(/^\s*(re|fwd?):\s*/i, "")
      .trim();
    const subject = `Re: [${ticket.ticket_number}] ${cleanSubject}`;
    const firstName = String(ticket.requester_name || "there").split(/\s+/)[0] || "there";
    const signOff = agent_name || "The Merchant Haus Support Team";

    const html = renderBrandedEmail({
      eyebrow: "Support",
      preheader: `${signOff} replied to ${ticket.ticket_number} — ${cleanSubject}`,
      signOff,
      body: `
        <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(message)}</p>
        ${infoCard([
          { label: "Ticket reference", value: `<strong>${escapeHtml(ticket.ticket_number)}</strong>` },
          { label: "Subject", value: escapeHtml(cleanSubject) },
        ])}
        <p style="margin:0 0 16px;">Just reply to this email to continue the conversation — your response stays attached to the same ticket.</p>
      `,
    });

    const result = await sendGmail({
      from: `Merchant Haus Support <${SUPPORT_INBOX}>`,
      to: ticket.requester_email,
      subject,
      html,
      replyTo: SUPPORT_INBOX,
      // BCC the shared support alias so the whole team sees the outbound reply
      // in the shared Gmail inbox.
      bcc: SUPPORT_INBOX,
      threadId: ticket.gmail_thread_id ?? undefined,
      inReplyTo: ticket.gmail_message_id ?? undefined,
      references: ticket.gmail_message_id ?? undefined,
    });

    if (!result.ok) return json({ error: result.error || "Gmail send failed" }, 502);

    // If this is the first outbound message and the thread wasn't known, capture
    // the new threadId so future messages stay in the same conversation.
    if (!ticket.gmail_thread_id && result.threadId) {
      await supabase
        .from("support_tickets")
        .update({ gmail_thread_id: result.threadId })
        .eq("id", ticket.id);
    }

    return json({ ok: true, id: result.id, threadId: result.threadId });
  } catch (err) {
    console.error("send-ticket-reply error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
