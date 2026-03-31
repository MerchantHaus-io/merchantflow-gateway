import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface QualifiedRequest {
  opportunity_id: string;
  account_name: string;
  contact_email: string;
  contact_first_name: string;
}

const MERCHANT_APPLY_URL = "https://ops-terminal.lovable.app/merchant-apply";

const buildDocsRequestHtml = (firstName: string, accountName: string): string => `
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
    .cta { display: inline-block; background: #18181b; color: #ffffff !important; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 8px 0 24px; }
    .doc-list { background: #f4f4f5; border-radius: 8px; padding: 16px 24px; margin: 16px 0; }
    .doc-list li { margin-bottom: 6px; font-size: 14px; color: #3f3f46; }
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
      <p>Great news — we've reviewed your inquiry for <strong>${accountName}</strong> and we'd love to move forward. To proceed with your merchant application, we'll need the following documents:</p>
      <ul class="doc-list">
        <li>3 months of recent bank statements</li>
        <li>3 months of processing/transaction history (if applicable)</li>
        <li>Voided check or bank letter</li>
        <li>Government-issued photo ID (driver's license or passport)</li>
        <li>Business license or articles of incorporation</li>
      </ul>
      <p>Please complete our secure merchant application form to upload your documents and provide the required business details:</p>
      <p style="text-align: center;">
        <a href="${MERCHANT_APPLY_URL}" class="cta">Complete Merchant Application</a>
      </p>
      <p>If you have any questions about the required documents or the application process, don't hesitate to reach out to us at <a href="mailto:sales@merchanthaus.io">sales@merchanthaus.io</a>.</p>
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
    const { opportunity_id, account_name, contact_email, contact_first_name }: QualifiedRequest = await req.json();

    if (!contact_email || !account_name) {
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

    console.log(`Sending docs request email to ${contact_email} for opportunity ${opportunity_id}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <onboarding@merchanthaus.io>",
        to: [contact_email],
        subject: `Action Required: Complete Your Merchant Application — ${account_name}`,
        html: buildDocsRequestHtml(contact_first_name || "there", account_name),
        reply_to: "sales@merchanthaus.io",
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend error:", emailResult);
      return new Response(
        JSON.stringify({ error: emailResult.message || "Failed to send email" }),
        { status: emailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Docs request email sent successfully:", emailResult);

    // Log as activity on the opportunity
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      if (opportunity_id) {
        await sb.from("activities").insert({
          opportunity_id,
          type: "email_docs_request",
          description: `📧 Document request email sent to ${contact_first_name || ''} (${contact_email}) for ${account_name}`,
          user_email: "system@ops.internal",
        });
      }
    } catch (logErr) {
      console.error("Failed to log email activity:", logErr);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-qualified-docs-request:", error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
