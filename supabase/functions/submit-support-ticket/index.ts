import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeCategory,
  isValidEmail,
  matchAccountByEmail,
} from "../_shared/support-intake.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
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

const escapeHtml = (str: string): string =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendEmail = async (to: string, subject: string, html: string, replyTo?: string) => {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email to", to);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Merchant Haus Support <${SUPPORT_INBOX}>`,
        to: [to],
        subject,
        html,
        reply_to: replyTo || SUPPORT_INBOX,
      }),
    });
    if (!res.ok) console.error("Resend send failed:", await res.text());
  } catch (err) {
    console.error("Resend send error:", err);
  }
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

    // Confirmation to the client.
    await sendEmail(
      email,
      `[${ticket.ticket_number}] We've received your support request`,
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
        <h2 style="font-size:18px">Your support request has been logged</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Thanks for getting in touch. Your ticket reference is
          <strong>${escapeHtml(ticket.ticket_number)}</strong>. Our team will pick it up shortly.</p>
        <p style="background:#f4f4f5;border-radius:8px;padding:12px 14px">
          <strong>${escapeHtml(subject)}</strong><br>
          <span style="white-space:pre-wrap;color:#3f3f46">${escapeHtml(description)}</span>
        </p>
        <p style="color:#71717a;font-size:13px">Reply to this email to add more information to your ticket.</p>
        <p style="color:#71717a;font-size:13px">— Merchant Haus Support</p>
      </div>`,
    );

    // Notify the support inbox so it also threads into the desk.
    await sendEmail(
      SUPPORT_INBOX,
      `[${ticket.ticket_number}] New ${category} request: ${subject}`,
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
        <h2 style="font-size:16px">New support ticket via web form</h2>
        <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticket_number)}<br>
           <strong>Category:</strong> ${escapeHtml(category)}<br>
           <strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br>
           ${businessName ? `<strong>Business:</strong> ${escapeHtml(businessName)}<br>` : ""}
           <strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p style="white-space:pre-wrap;color:#3f3f46">${escapeHtml(description)}</p>
      </div>`,
      email,
    );

    return json({ success: true, ticket_number: ticket.ticket_number, ticket_id: ticket.id });
  } catch (err) {
    console.error("submit-support-ticket error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
