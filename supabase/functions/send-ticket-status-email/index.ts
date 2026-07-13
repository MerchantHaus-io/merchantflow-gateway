// Sends an automated status-change notification to the ticket requester, reusing
// the original Gmail thread so it appears as a reply in the same conversation.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail } from "../_shared/gmail-send.ts";
import { isBlockedRecipient } from "../_shared/blocked-emails.ts";
import {
  type BadgeTone,
  escapeHtml,
  infoCard,
  renderBrandedEmail,
  statusBadge,
} from "../_shared/email-layout.ts";

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

// Friendly labels for the three lifecycle states.
const STATUS_COPY: Record<string, { label: string; intro: string; tone: BadgeTone }> = {
  open: {
    label: "Open",
    intro: "We've reopened your support ticket and a team member will be in touch shortly.",
    tone: "info",
  },
  in_progress: {
    label: "In progress",
    intro: "Your ticket is now being worked on. We'll follow up as soon as we have an update.",
    tone: "pending",
  },
  closed: {
    label: "Resolved",
    intro:
      "Your ticket has been marked as resolved. If anything is still outstanding, simply reply to this email and we'll reopen it.",
    tone: "success",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticket_id, new_status, changed_by_name, note } = await req.json();
    if (!ticket_id || !new_status) return json({ error: "ticket_id and new_status are required" }, 400);

    const copy = STATUS_COPY[String(new_status)];
    if (!copy) return json({ error: `Unsupported status: ${new_status}` }, 400);

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

    const cleanSubject = String(ticket.subject || "Support request").replace(/^\s*(re|fwd?):\s*/i, "").trim();
    const subject = `Re: [${ticket.ticket_number}] ${cleanSubject}`;

    const firstName = String(ticket.requester_name || "there").split(/\s+/)[0] || "there";
    const html = renderBrandedEmail({
      eyebrow: "Ticket update",
      preheader: `${ticket.ticket_number}: ${copy.label} — ${cleanSubject}`,
      signOff: changed_by_name || "The Merchant Haus Support Team",
      body: `
        <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px;">${escapeHtml(copy.intro)}</p>
        ${infoCard([
          { label: "Ticket reference", value: `<strong>${escapeHtml(ticket.ticket_number)}</strong>` },
          { label: "Status", value: statusBadge(copy.label, copy.tone) },
          { label: "Subject", value: escapeHtml(cleanSubject) },
        ])}
        ${note ? `<p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(String(note))}</p>` : ""}
        <p style="margin:0 0 16px;">Reply to this email to add a note — it will be attached to your existing ticket automatically.</p>
      `,
    });

    const result = await sendGmail({
      from: `Merchant Haus Support <${SUPPORT_INBOX}>`,
      to: ticket.requester_email,
      subject,
      html,
      replyTo: SUPPORT_INBOX,
      // BCC the shared support alias so every team member with access to
      // support@ sees the outbound update in the shared Gmail inbox.
      bcc: SUPPORT_INBOX,
      threadId: ticket.gmail_thread_id ?? undefined,
      inReplyTo: ticket.gmail_message_id ?? undefined,
      references: ticket.gmail_message_id ?? undefined,
    });

    if (!result.ok) return json({ error: result.error || "Gmail send failed" }, 502);

    // Log a system comment so the conversation timeline reflects the email.
    await supabase.from("support_ticket_comments").insert({
      ticket_id: ticket.id,
      body: `Status update email sent to ${ticket.requester_email} — ${copy.label}`,
      is_internal: true,
      author_type: "system",
      author_name: changed_by_name || "System",
    });

    // If this is the first outbound message and the thread wasn't known, capture
    // the new threadId so future replies stay in the same conversation.
    if (!ticket.gmail_thread_id && result.threadId) {
      await supabase
        .from("support_tickets")
        .update({ gmail_thread_id: result.threadId })
        .eq("id", ticket.id);
    }

    return json({ ok: true, id: result.id, threadId: result.threadId });
  } catch (err) {
    console.error("send-ticket-status-email error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
