import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DeclineEmailRequest {
  recipientEmail: string;
  recipientName: string;
  accountName: string;
  outcomeStatus: string;
  outcomeReason: string;
}

const buildDeclineEmailHtml = (recipientName: string, accountName: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #1a1a1a; margin: 0; padding: 0; background: #f4f4f5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 28px; text-align: center; }
    .header img { height: 28px; margin-bottom: 8px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; color: #fafafa; letter-spacing: -0.025em; }
    .body { padding: 32px 28px; }
    .body p { margin: 0 0 16px; font-size: 15px; color: #3f3f46; }
    .body p:last-child { margin-bottom: 0; }
    .body p strong { color: #18181b; }
    .divider { height: 1px; background: #e4e4e7; margin: 24px 0; }
    .closing { margin-top: 24px; }
    .closing p { font-size: 15px; color: #3f3f46; margin: 0 0 4px; }
    .footer { text-align: center; padding: 20px 28px; border-top: 1px solid #f4f4f5; }
    .footer p { margin: 0; font-size: 12px; color: #a1a1aa; }
    .footer a { color: #71717a; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <img src="https://ops-terminal.lovable.app/images/merchanthaus-logo.png" alt="Merchant Haus" style="height: 32px;" />
      </div>
      <div class="body">
        <p>Dear ${recipientName},</p>

        <p>Thank you for your interest in Merchant Haus and for taking the time to submit your application${accountName ? ` for <strong>${accountName}</strong>` : ''}.</p>

        <p>After careful review, we regret to inform you that we are unable to proceed with your application at this time. This decision was made based on our current underwriting criteria and does not reflect on the quality of your business.</p>

        <p>We understand this may not be the outcome you were hoping for, and we appreciate your patience throughout the review process.</p>

        <div class="divider"></div>

        <p>If you have any questions regarding this decision, or if your circumstances change in the future, please don't hesitate to reach out to us at <a href="mailto:sales@merchanthaus.io" style="color: #18181b; text-decoration: underline;">sales@merchanthaus.io</a>. We would be happy to revisit your application.</p>

        <div class="closing">
          <p>Kind regards,</p>
          <p><strong>The Merchant Haus Team</strong></p>
        </div>
      </div>
      <div class="footer">
        <p>Merchant Haus &bull; <a href="https://merchanthaus.io">merchanthaus.io</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recipientEmail, recipientName, accountName, outcomeStatus, outcomeReason }: DeclineEmailRequest = await req.json();

    if (!recipientEmail || !recipientName) {
      return new Response(
        JSON.stringify({ error: "recipientEmail and recipientName are required" }),
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

    console.log(`Sending application declined email to ${recipientEmail} for ${accountName} (${outcomeStatus}: ${outcomeReason})`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <applications@merchanthaus.io>",
        to: [recipientEmail],
        subject: `Application Update — ${accountName || "Your Application"}`,
        html: buildDeclineEmailHtml(recipientName, accountName),
        reply_to: "sales@merchanthaus.io",
      }),
    });

    const result = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend API error:", result);
      return new Response(
        JSON.stringify({ error: result.message || "Failed to send decline email" }),
        { status: emailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Decline email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-application-declined:", error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
