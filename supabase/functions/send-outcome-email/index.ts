import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-crm-secret',
};

const ADVERSE_ACTION_REASON_MAP: Record<string, string> = {
  match_excessive_chargebacks: "Unsatisfactory processing history as reported by industry monitoring databases",
  match_fraud: "Information received from industry monitoring databases",
  match_other: "Information received from industry monitoring databases",
  principal_credit_below_threshold: "Insufficient credit history or credit rating",
  excessive_chargeback_ratio_current: "Unsatisfactory processing history based on statements provided",
  unverifiable_business_kyc: "Unable to verify business information as provided",
  aml_red_flags: "Application did not meet our program requirements",
  financial_instability_bankruptcy: "Unfavorable financial or credit history",
  mcc_reclassification: "Nature of business activity",
  website_marketing_noncompliance: "Business website did not meet required disclosure requirements",
  volume_ticket_inconsistency: "Processing volume or transaction profile inconsistent with business type",
  incomplete_docs_uw_timeout: "Application incomplete — required documentation was not received within the required timeframe",
  prohibited_product_discovered: "Business activity outside our current program guidelines",
  reserve_requirement_rejected: "Inability to meet reserve or collateral requirements",
  third_party_processing: "Business model is outside our current program guidelines",
};

function buildDisqualifiedEmail(
  contact: { first_name: string; email: string },
  _account: { name: string },
  _outcome_reason: string
): { subject: string; html: string } {
  return {
    subject: "Your Merchant Services Application — Merchant Haus",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Dear ${contact.first_name || 'Valued Applicant'},</p>
<p>Thank you for your interest in Merchant Haus payment processing services. After reviewing your application, we are unable to offer merchant services at this time based on our current program eligibility requirements.</p>
<p>If you have any questions about this decision, please contact us at <a href="mailto:onboarding@merchanthaus.io">onboarding@merchanthaus.io</a> and we will be happy to assist you.</p>
<p>Sincerely,<br>The Merchant Haus Team</p>
<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px;">
<p style="font-size: 11px; color: #888;">Merchant Haus | 1100 Poydras St, Suite 2900, New Orleans, LA 70163</p>
<p style="font-size: 11px; color: #888;">Merchant Haus is a registered ISO/MSP of Esquire Bank, Garden City, NY.</p>
<p style="font-size: 11px; color: #888;">This email was sent to ${contact.email} in connection with your application for merchant payment processing services.</p>
</body></html>`,
  };
}

function buildUwDeclinedEmail(
  contact: { first_name: string; email: string },
  _account: { name: string },
  outcome_reason: string
): { subject: string; html: string } {
  const mappedReason = ADVERSE_ACTION_REASON_MAP[outcome_reason];
  if (!mappedReason) {
    throw new Error(`UNMAPPED_REASON: ${outcome_reason} — cannot generate compliant adverse action notice`);
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return {
    subject: "Notice of Application Decision — Merchant Haus",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Dear ${contact.first_name || 'Valued Applicant'},</p>

<p>Thank you for your application for merchant payment processing services with Merchant Haus. After careful review, we are unable to approve your application at this time.</p>

<p><strong>The principal reason for this decision:</strong> ${mappedReason}</p>

<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

<p style="font-size: 12px;">The federal Equal Credit Opportunity Act prohibits creditors from discriminating against credit applicants on the basis of race, color, religion, national origin, sex, marital status, age (provided the applicant has the capacity to enter into a binding contract); because all or part of the applicant's income derives from any public assistance program; or because the applicant has in good faith exercised any right under the Consumer Credit Protection Act. The federal agency that administers compliance with this law concerning this creditor is: Consumer Financial Protection Bureau, 1700 G Street NW, Washington, DC 20552. You may submit a complaint at consumerfinance.gov/complaint.</p>

<p style="font-size: 12px;">If a consumer credit report was obtained in connection with this application, it was obtained from: Experian, P.O. Box 4500, Allen, TX 75013, 1-888-397-3742. That agency did not make this decision and cannot explain why it was made. You have the right to obtain a free copy of your consumer report from that agency within 60 days of receiving this notice, and to dispute the accuracy or completeness of any information in your report.</p>

<p>If you believe this decision was made in error, or if your circumstances have changed, you are welcome to contact us at <a href="mailto:onboarding@merchanthaus.io">onboarding@merchanthaus.io</a>.</p>

<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px;">
<p style="font-size: 11px; color: #888;">Merchant Haus | 1100 Poydras St, Suite 2900, New Orleans, LA 70163</p>
<p style="font-size: 11px; color: #888;">Merchant Haus is a registered ISO/MSP of Esquire Bank, Garden City, NY.</p>
<p style="font-size: 11px; color: #888;">This notice was sent to ${contact.email} on ${today}.</p>
</body></html>`,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check — accept either x-crm-secret or standard auth
    const crmSecret = req.headers.get('x-crm-secret');
    const expectedSecret = Deno.env.get('CRM_INTERNAL_SECRET');

    // If CRM_INTERNAL_SECRET is configured, validate it
    if (expectedSecret && crmSecret !== expectedSecret) {
      // Also accept standard supabase auth as fallback
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { opportunity_id, outcome_status, outcome_reason } = await req.json();

    if (!opportunity_id || !outcome_status || !outcome_reason) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Idempotency check
    const { data: existingEmail } = await supabase
      .from('activities')
      .select('id')
      .eq('opportunity_id', opportunity_id)
      .eq('type', 'email_sent')
      .limit(1);

    if (existingEmail && existingEmail.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'already_sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch required data
    const { data: opp } = await supabase
      .from('opportunities')
      .select('outcome_reason, contact_id, account_id')
      .eq('id', opportunity_id)
      .single();

    if (!opp) {
      return new Response(JSON.stringify({ error: 'opportunity_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('id', opp.contact_id)
      .single();

    const { data: account } = await supabase
      .from('accounts')
      .select('name')
      .eq('id', opp.account_id)
      .single();

    if (!contact?.email || !account?.name) {
      await supabase.from('activities').insert({
        opportunity_id,
        type: 'email_failed',
        description: 'COMPLIANCE EMAIL FAILED — missing contact email or account name. Manual follow-up required.',
        user_email: 'system',
        created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'missing_required_data' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build email
    let emailContent: { subject: string; html: string };
    try {
      if (outcome_status === 'disqualified') {
        emailContent = buildDisqualifiedEmail(contact, account, outcome_reason);
      } else if (outcome_status === 'underwriting_declined') {
        emailContent = buildUwDeclinedEmail(contact, account, outcome_reason);
      } else {
        return new Response(JSON.stringify({ error: 'invalid_outcome_for_email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (templateErr: any) {
      await supabase.from('activities').insert({
        opportunity_id,
        type: 'email_failed',
        description: `COMPLIANCE EMAIL FAILED — ${templateErr.message}. Manual follow-up required.`,
        user_email: 'system',
        created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'template_error', detail: templateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      await supabase.from('activities').insert({
        opportunity_id,
        type: 'email_failed',
        description: 'COMPLIANCE EMAIL FAILED — RESEND_API_KEY not configured. Manual follow-up required.',
        user_email: 'system',
        created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'resend_not_configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Merchant Haus <onboarding@merchanthaus.io>',
        to: [contact.email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (resendResponse.ok) {
      await supabase.from('activities').insert({
        opportunity_id,
        type: 'email_sent',
        description: `Compliance notification sent to ${contact.email} — Outcome: ${outcome_status}`,
        user_email: 'system',
        created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const errorDetail = await resendResponse.text();
      await supabase.from('activities').insert({
        opportunity_id,
        type: 'email_failed',
        description: `COMPLIANCE EMAIL FAILED — Outcome: ${outcome_status} — Error: ${errorDetail.slice(0, 200)}. Manual follow-up required.`,
        user_email: 'system',
        created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: 'email_send_failed', detail: errorDetail }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
