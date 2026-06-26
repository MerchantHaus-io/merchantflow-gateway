// Sends an automated status-change notification to the ticket requester, reusing
// the original Gmail thread so it appears as a reply in the same conversation.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail } from "../_shared/gmail-send.ts";

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

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Friendly labels for the three lifecycle states.
const STATUS_COPY: Record<string, { label: string; intro: string }> = {
  open: {
    label: "Open",
    intro: "We've reopened your support ticket and a team member will be in touch shortly.",
  },
  in_progress: {
    label: "Pending",
    intro: "Your ticket is now being worked on. We'll follow up as soon as we have an update.",
  },
  closed: {
    label: "Resolved",
    intro:
      "Your ticket has been marked as resolved. If anything is still outstanding, simply reply to this email and we'll reopen it.",
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

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#111;">
        <p style="margin:0 0 12px;">Hi ${escapeHtml(ticket.requester_name || "there")},</p>
        <p style="margin:0 0 16px; font-size:15px; line-height:1.55;">${escapeHtml(copy.intro)}</p>
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:14px 16px; background:#f9fafb; margin:16px 0;">
          <div style="font-size:12px; color:#6b7280; letter-spacing:.04em; text-transform:uppercase;">Ticket ${escapeHtml(ticket.ticket_number)}</div>
          <div style="font-size:15px; margin-top:4px;"><strong>Status:</strong> ${escapeHtml(copy.label)}</div>
          <div style="font-size:13px; margin-top:4px; color:#374151;">Subject: ${escapeHtml(cleanSubject)}</div>
        </div>
        ${note ? `<p style="margin:0 0 16px; font-size:14px; line-height:1.55; white-space:pre-wrap;">${escapeHtml(String(note))}</p>` : ""}
        <p style="margin:16px 0 0; font-size:13px; color:#6b7280;">Reply to this email to add a note — it will be attached to your existing ticket automatically.</p>
        <p style="margin:24px 0 0; font-size:13px; color:#6b7280;">— ${escapeHtml(changed_by_name || "Merchant Haus Support")}</p>
      </div>
    `;

    const result = await sendGmail({
      from: `Merchant Haus Support <${SUPPORT_INBOX}>`,
      to: ticket.requester_email,
      subject,
      html,
      replyTo: SUPPORT_INBOX,
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
