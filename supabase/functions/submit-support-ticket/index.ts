import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeCategory,
  isValidEmail,
  matchAccountByEmail,
} from "../_shared/support-intake.ts";
import { sendGmail } from "../_shared/gmail-send.ts";
import { escapeHtml, infoCard, renderBrandedEmail } from "../_shared/email-layout.ts";

const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX_EMAIL") || "support@merchanthaus.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sendEmail = async (to: string, subject: string, html: string, replyTo?: string) => {
  const result = await sendGmail({
    from: `Merchant Haus Support <${SUPPORT_INBOX}>`,
    to,
    subject,
    html,
    replyTo: replyTo || SUPPORT_INBOX,
  });
  if (!result.ok) console.error("Gmail send failed:", result.error);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const businessName = String(body.business_name ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const description = String(body.description ?? "").trim();
    const category = normalizeCategory(body.category);

    if (!name || !email || !subject || !description) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!isValidEmail(email)) {
      return json({ error: "Invalid email address" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { account_id, contact_id } = await matchAccountByEmail(supabase, email);

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({
        subject,
        description: businessName ? `[Business: ${businessName}]\n\n${description}` : description,
        category,
        priority: "normal",
        status: "open",
        source: "web_form",
        requester_name: name,
        requester_email: email,
        account_id,
        contact_id,
      })
      .select("id, ticket_number")
      .single();

    if (error) {
      console.error("Failed to insert support ticket:", error);
      return json({ error: "Could not create ticket" }, 500);
    }

    // Confirmation to the client — branded, on-message.
    const firstName = name.split(/\s+/)[0] || name;
    await sendEmail(
      email,
      `[${ticket.ticket_number}] We've received your support request`,
      renderBrandedEmail({
        eyebrow: "Support",
        preheader: `We've logged your request — your reference is ${ticket.ticket_number}.`,
        signOff: "The Merchant Haus Support Team",
        body: `
          <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin:0 0 16px;">Thanks for getting in touch. Your request has been logged and our support team will be on it shortly — we'll keep you posted at every step.</p>
          ${infoCard([
            { label: "Ticket reference", value: `<strong>${escapeHtml(ticket.ticket_number)}</strong>` },
            { label: "Subject", value: escapeHtml(subject) },
            {
              label: "Your message",
              value: `<span style="white-space:pre-wrap;color:#3f3f46;">${escapeHtml(description)}</span>`,
            },
          ])}
          <p style="margin:0 0 16px;">There's nothing more you need to do right now. If you'd like to add details or attachments, just <strong>reply to this email</strong> — everything you send stays attached to the same ticket.</p>
        `,
      }),
    );

    // Notify the support inbox so it also threads into the desk.
    await sendEmail(
      SUPPORT_INBOX,
      `[${ticket.ticket_number}] New ${category} request: ${subject}`,
      renderBrandedEmail({
        eyebrow: "New support ticket",
        preheader: `${category} request from ${name}: ${subject}`,
        signOff: "Merchant Haus Support Desk",
        body: `
          <p style="margin:0 0 16px;">A new support ticket has come in via the web form.</p>
          ${infoCard([
            { label: "Ticket", value: `<strong>${escapeHtml(ticket.ticket_number)}</strong>` },
            { label: "Category", value: escapeHtml(category) },
            { label: "From", value: `${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(email)}" style="color:#18181b;">${escapeHtml(email)}</a>&gt;` },
            ...(businessName ? [{ label: "Business", value: escapeHtml(businessName) }] : []),
            { label: "Subject", value: escapeHtml(subject) },
            {
              label: "Description",
              value: `<span style="white-space:pre-wrap;color:#3f3f46;">${escapeHtml(description)}</span>`,
            },
          ])}
        `,
      }),
      email,
    );

    return json({ success: true, ticket_number: ticket.ticket_number, ticket_id: ticket.id });
  } catch (err) {
    console.error("submit-support-ticket error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
