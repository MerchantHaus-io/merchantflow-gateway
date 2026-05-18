import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ContactFormRequest {
  first_name: string;
  last_name: string;
  phone: string;
  website: string;
  email: string;
  business_requirements: string;
}

const escapeHtml = (str: string): string =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeHttpUrl = (url: string): string | null => {
  const trimmed = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  // Block javascript: smuggling via embedded whitespace and only allow http(s)
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

const buildSalesNotificationHtml = (data: ContactFormRequest): string => {
  const first = escapeHtml(data.first_name);
  const last = escapeHtml(data.last_name);
  const email = escapeHtml(data.email);
  const phone = escapeHtml(data.phone);
  const requirements = escapeHtml(data.business_requirements);
  const websiteUrl = safeHttpUrl(data.website);
  const websiteBlock = websiteUrl
    ? `<div class="field"><div class="field-label">Website</div><div class="field-value"><a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a></div></div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { background: linear-gradient(135deg, #18181b 0%, #27272a 100%); color: #fafafa; padding: 24px; border-radius: 12px 12px 0 0; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .content { background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e4e4e7; border-top: 0; }
    .field { margin-bottom: 16px; }
    .field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a; margin-bottom: 4px; }
    .field-value { font-size: 15px; color: #18181b; }
    .requirements { background: #f4f4f5; border-radius: 8px; padding: 16px; margin-top: 8px; white-space: pre-wrap; font-size: 14px; line-height: 1.7; }
    .footer { text-align: center; padding: 16px; font-size: 12px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Contact Inquiry</h1>
    </div>
    <div class="content">
      <div class="field">
        <div class="field-label">Name</div>
        <div class="field-value">${first} ${last}</div>
      </div>
      <div class="field">
        <div class="field-label">Email</div>
        <div class="field-value"><a href="mailto:${email}">${email}</a></div>
      </div>
      <div class="field">
        <div class="field-label">Phone</div>
        <div class="field-value">${phone}</div>
      </div>
      ${websiteBlock}
      <div class="field">
        <div class="field-label">Business Requirements</div>
        <div class="requirements">${requirements}</div>
      </div>
    </div>
    <div class="footer">Submitted via Merchant Haus Contact Form</div>
  </div>
</body>
</html>`;
};

const buildClientConfirmationHtml = (firstName: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { background: linear-gradient(135deg, #18181b 0%, #27272a 100%); color: #fafafa; padding: 24px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .content { background: #ffffff; padding: 32px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e4e4e7; border-top: 0; }
    .content p { margin: 0 0 16px; font-size: 15px; color: #3f3f46; }
    .footer { text-align: center; padding: 16px; font-size: 12px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Merchant Haus</h1>
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      <p>Thank you for reaching out to Merchant Haus. We've received your inquiry and a member of our sales team will be in touch with you shortly.</p>
      <p>In the meantime, if you have any additional questions, feel free to reply to this email or contact us at <a href="mailto:sales@merchanthaus.io">sales@merchanthaus.io</a>.</p>
      <p style="margin-top: 24px;">Kind regards,<br><strong>The Merchant Haus Team</strong></p>
    </div>
    <div class="footer">
      <p>Merchant Haus &bull; <a href="https://merchanthaus.io">merchanthaus.io</a></p>
    </div>
  </div>
</body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: ContactFormRequest = await req.json();

    if (!data.first_name || !data.last_name || !data.email || !data.phone || !data.business_requirements) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Send notification to sales team
    const salesResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <sales@merchanthaus.io>",
        to: ["sales@merchanthaus.io"],
        subject: `New Inquiry: ${data.first_name} ${data.last_name} — ${data.email}`,
        html: buildSalesNotificationHtml(data),
        reply_to: data.email,
      }),
    });

    const salesResult = await salesResponse.json();
    if (!salesResponse.ok) {
      console.error("Failed to send sales notification:", salesResult);
    }

    // 2. Send confirmation to client
    const clientResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <sales@merchanthaus.io>",
        to: [data.email],
        subject: "Thank you for contacting Merchant Haus",
        html: buildClientConfirmationHtml(data.first_name),
        reply_to: "sales@merchanthaus.io",
      }),
    });

    const clientResult = await clientResponse.json();
    if (!clientResponse.ok) {
      console.error("Failed to send client confirmation:", clientResult);
    }

    console.log("Contact form emails sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-contact-form-email:", error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
