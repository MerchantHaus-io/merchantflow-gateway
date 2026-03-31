import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  outcomeNotes?: string;
}

const getEmailContent = (outcomeStatus: string, recipientName: string, accountName: string) => {
  const accountRef = accountName ? ` for <strong>${accountName}</strong>` : '';

  if (outcomeStatus === 'underwriting_declined') {
    return {
      subject: `Application Update — ${accountName || "Your Application"}`,
      heading: 'Application Update',
      body: `
        <p>Dear ${recipientName},</p>
        <p>Thank you for your interest in Merchant Haus and for taking the time to submit your application${accountRef}.</p>
        <p>After a thorough review by our underwriting team, we regret to inform you that we are unable to approve your application at this time. This decision was made based on our current underwriting criteria and does not reflect on the quality of your business.</p>
        <p>We understand this may be disappointing, and we appreciate your patience throughout the review process.</p>
        <div class="divider"></div>
        <p>If you have any questions about this decision, or if your circumstances change in the future, please don't hesitate to reach out to us at <a href="mailto:onboarding@merchanthaus.io" style="color: #18181b; text-decoration: underline;">onboarding@merchanthaus.io</a>. We would be happy to revisit your application.</p>
      `,
      teamSubject: `⛔ Underwriting Declined — ${accountName || recipientName}`,
      teamHeading: '⛔ Underwriting Declined — Account Update',
      teamBody: 'The following application has been declined by underwriting and a notification has been sent to the applicant.',
    };
  }

  if (outcomeStatus === 'disqualified') {
    return {
      subject: `Application Update — ${accountName || "Your Application"}`,
      heading: 'Application Update',
      body: `
        <p>Dear ${recipientName},</p>
        <p>Thank you for your interest in Merchant Haus and for submitting your application${accountRef}.</p>
        <p>After reviewing your application, we have determined that we are unfortunately unable to support your business at this time. This may be due to factors such as the nature of your business, geographic requirements, or other eligibility criteria.</p>
        <p>We appreciate the time you invested in the application process.</p>
        <div class="divider"></div>
        <p>If you believe there has been an error or would like further clarification, please feel free to contact us at <a href="mailto:onboarding@merchanthaus.io" style="color: #18181b; text-decoration: underline;">onboarding@merchanthaus.io</a>.</p>
      `,
      teamSubject: `🚫 Disqualified — ${accountName || recipientName}`,
      teamHeading: '🚫 Disqualified — Account Update',
      teamBody: 'The following application has been disqualified and a notification has been sent to the applicant.',
    };
  }

  // Fallback (should not be reached given frontend filtering)
  return {
    subject: `Application Update — ${accountName || "Your Application"}`,
    heading: 'Application Update',
    body: `
      <p>Dear ${recipientName},</p>
      <p>Thank you for your interest in Merchant Haus and for your application${accountRef}.</p>
      <p>We wanted to let you know that after review, we are unable to proceed at this time.</p>
      <div class="divider"></div>
      <p>For any questions, please contact us at <a href="mailto:onboarding@merchanthaus.io" style="color: #18181b; text-decoration: underline;">onboarding@merchanthaus.io</a>.</p>
    `,
    teamSubject: `Application Update — ${accountName || recipientName}`,
    teamHeading: 'Application Update — Account Notification',
    teamBody: 'The following application outcome has been set and the applicant has been notified.',
  };
};

const buildClientEmailHtml = (body: string): string => `
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
        ${body}
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

const buildTeamNotificationHtml = (
  heading: string,
  teamBody: string,
  recipientName: string,
  accountName: string,
  outcomeStatus: string,
  outcomeReason: string,
  outcomeNotes: string,
  applicantEmail: string,
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
    .header { background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 16px; font-weight: 600; color: #fafafa; }
    .body { padding: 24px; }
    .body p { margin: 0 0 12px; font-size: 14px; color: #3f3f46; }
    .detail { background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
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
        <h1>${heading}</h1>
      </div>
      <div class="body">
        <p>${teamBody}</p>
        <div class="detail">
          <div class="detail-row"><span class="detail-label">Account</span><span class="detail-value">${accountName || 'N/A'}</span></div>
          <div class="detail-row"><span class="detail-label">Applicant</span><span class="detail-value">${recipientName}</span></div>
          <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${applicantEmail}</span></div>
          <div class="detail-row"><span class="detail-label">Outcome</span><span class="detail-value">${outcomeStatus}</span></div>
          <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value">${outcomeReason}</span></div>
          ${outcomeNotes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${outcomeNotes}</span></div>` : ''}
        </div>
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
    const { recipientEmail, recipientName, accountName, outcomeStatus, outcomeReason, outcomeNotes }: DeclineEmailRequest = await req.json();

    if (!recipientEmail || !recipientName) {
      return new Response(
        JSON.stringify({ error: "recipientEmail and recipientName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only send client emails for formal declines
    const allowedOutcomes = ['underwriting_declined', 'disqualified'];
    if (!allowedOutcomes.includes(outcomeStatus)) {
      console.log(`Skipping client email — outcome "${outcomeStatus}" does not warrant client notification`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Outcome does not require client notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = getEmailContent(outcomeStatus, recipientName, accountName);

    console.log(`Sending application notification email to ${recipientEmail} for ${accountName} (${outcomeStatus}: ${outcomeReason})`);

    // 1. Send notification email to applicant
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <noreply@merchanthaus.io>",
        to: [recipientEmail],
        subject: content.subject,
        html: buildClientEmailHtml(content.body),
        reply_to: "onboarding@merchanthaus.io",
      }),
    });

    const result = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend API error:", result);
      return new Response(
        JSON.stringify({ error: result.message || "Failed to send notification email" }),
        { status: emailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Notification email sent successfully:", result);

    // 2. Send team notification email
    const teamRecipients = [
      "support@merchanthaus.io",
      "admin@merchanthaus.io",
      "sales@merchanthaus.io",
    ];

    const teamEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <noreply@merchanthaus.io>",
        to: teamRecipients,
        subject: content.teamSubject,
        html: buildTeamNotificationHtml(
          content.teamHeading,
          content.teamBody,
          recipientName,
          accountName,
          outcomeStatus,
          outcomeReason,
          outcomeNotes || '',
          recipientEmail,
        ),
        reply_to: "onboarding@merchanthaus.io",
      }),
    });

    const teamResult = await teamEmailResponse.json();
    if (!teamEmailResponse.ok) {
      console.error("Team notification email error:", teamResult);
    } else {
      console.log("Team notification email sent:", teamResult);
    }

    // Log as activity
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
              type: "email_notification_sent",
              description: `📧 ${content.teamHeading.replace(/[⛔🚫] /, '')} notification sent to ${recipientName} (${recipientEmail}). Reason: ${outcomeReason}`,
              user_email: "system@ops.internal",
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
    console.error("Error in send-application-declined:", error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
