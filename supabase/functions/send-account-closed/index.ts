import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AccountClosedRequest {
  recipientEmail: string;
  recipientName: string;
  accountName: string;
  outcomeStatus: string;
  outcomeReason: string;
  closedBy: string;
}

const buildMerchantClosureHtml = (recipientName: string, accountName: string): string => `
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

        <p>We are writing to inform you that the merchant account${accountName ? ` for <strong>${accountName}</strong>` : ''} has been closed, effective immediately.</p>

        <p>All associated services, including payment processing and gateway access, have been discontinued. Any pending transactions will be handled in accordance with our standard settlement procedures.</p>

        <div class="divider"></div>

        <p>If you believe this action was taken in error, or if you have any questions regarding the closure of your account, please contact us at <a href="mailto:onboarding@merchanthaus.io" style="color: #18181b; text-decoration: underline;">onboarding@merchanthaus.io</a>.</p>

        <div class="closing">
          <p>Regards,</p>
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

const buildTeamClosureHtml = (
  accountName: string,
  recipientName: string,
  recipientEmail: string,
  outcomeStatus: string,
  outcomeReason: string,
  closedBy: string,
): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f4f4f5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 16px; font-weight: 600; color: #fafafa; }
    .body { padding: 24px; }
    .body p { margin: 0 0 12px; font-size: 14px; color: #3f3f46; }
    .detail { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #fee2e2; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #71717a; font-weight: 500; }
    .detail-value { color: #18181b; font-weight: 600; }
    .footer { text-align: center; padding: 16px 24px; border-top: 1px solid #f4f4f5; }
    .footer p { margin: 0; font-size: 11px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>🚫 Account Closed — ${accountName || 'Unknown'}</h1>
      </div>
      <div class="body">
        <p>A live merchant account has been closed. The merchant has been notified via email.</p>
        <div class="detail">
          <div class="detail-row"><span class="detail-label">Account</span><span class="detail-value">${accountName || 'N/A'}</span></div>
          <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">${recipientName}</span></div>
          <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${recipientEmail}</span></div>
          <div class="detail-row"><span class="detail-label">Outcome</span><span class="detail-value">${outcomeStatus}</span></div>
          <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value">${outcomeReason}</span></div>
          <div class="detail-row"><span class="detail-label">Closed By</span><span class="detail-value">${closedBy}</span></div>
        </div>
        <p style="font-size: 12px; color: #71717a;">This is an automated notification from the Ops Terminal.</p>
      </div>
      <div class="footer">
        <p>Merchant Haus Ops Terminal</p>
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
    const { recipientEmail, recipientName, accountName, outcomeStatus, outcomeReason, closedBy }: AccountClosedRequest = await req.json();

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

    console.log(`Sending account closure email to ${recipientEmail} for ${accountName}`);

    // 1. Send closure confirmation to merchant
    const merchantRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <noreply@merchanthaus.io>",
        to: [recipientEmail],
        subject: `Account Closure Confirmation — ${accountName || "Your Account"}`,
        html: buildMerchantClosureHtml(recipientName, accountName),
        reply_to: "onboarding@merchanthaus.io",
      }),
    });

    const merchantResult = await merchantRes.json();
    if (!merchantRes.ok) {
      console.error("Merchant closure email error:", merchantResult);
      return new Response(
        JSON.stringify({ error: merchantResult.message || "Failed to send closure email" }),
        { status: merchantRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Merchant closure email sent:", merchantResult);

    // 2. Send internal team notification
    const teamRecipients = [
      "support@merchanthaus.io",
      "admin@merchanthaus.io",
      "sales@merchanthaus.io",
      "darryn@merchanthaus.io",
      "dylan@merchanthaus.io",
      "taryn@merchanthaus.io",
    ];

    const teamRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <noreply@merchanthaus.io>",
        to: teamRecipients,
        subject: `🚫 Account Closed — ${accountName || recipientName}`,
        html: buildTeamClosureHtml(
          accountName,
          recipientName,
          recipientEmail,
          outcomeStatus,
          outcomeReason,
          closedBy,
        ),
      }),
    });

    const teamResult = await teamRes.json();
    if (!teamRes.ok) {
      console.error("Team closure notification error:", teamResult);
    } else {
      console.log("Team closure notification sent:", teamResult);
    }

    // Log as activity on matching opportunity
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      if (accountName) {
        const { data: accounts } = await sb.from("accounts").select("id").eq("name", accountName).limit(1);
        if (accounts && accounts.length > 0) {
          const { data: opps } = await sb.from("opportunities").select("id").eq("account_id", accounts[0].id).limit(1);
          if (opps && opps.length > 0) {
            await sb.from("activities").insert({
              opportunity_id: opps[0].id,
              type: "email_account_closed",
              description: `📧 Account closure email sent to ${recipientName} (${recipientEmail}). Reason: ${outcomeReason}`,
              user_email: closedBy || "system@ops.internal",
            });
          }
        }
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
    console.error("Error in send-account-closed:", error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
