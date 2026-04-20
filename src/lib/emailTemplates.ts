/**
 * Client-side email template builders for rep-triggered customer emails.
 *
 * These mirror the server-side defaults in Supabase Edge Functions. They
 * are used to render the initial content of the EmailPreviewDialog so reps
 * see (and can edit) what will be sent before it goes out.
 *
 * When a rep sends from the dialog, the edited subject/html is passed to
 * the Edge Function as custom_subject/custom_html and used in place of
 * the server template. If these builders drift from the server defaults,
 * the preview and the fallback-when-not-edited will look slightly
 * different — keep them in sync with the Edge Function source of truth.
 */

// ─── Outcome Email ───

/**
 * Adverse Action Notice reason map — mirrors send-outcome-email.
 * Used for outcome_status = 'underwriting_declined'.
 * The template body is LOCKED in the preview dialog (compliance).
 */
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

interface OutcomeEmailInput {
  contactFirstName: string;
  contactEmail: string;
  outcomeReason: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
}

/** Soft decline — used when outcome_status = 'disqualified'. Fully editable in preview. */
export function buildDisqualifiedEmailTemplate({ contactFirstName, contactEmail }: OutcomeEmailInput): EmailTemplate {
  return {
    subject: "Your Merchant Services Application — Merchant Haus",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Dear ${contactFirstName || 'Valued Applicant'},</p>
<p>Thank you for your interest in Merchant Haus payment processing services. After reviewing your application, we are unable to offer merchant services at this time based on our current program eligibility requirements.</p>
<p>If you have any questions about this decision, please contact us at <a href="mailto:onboarding@merchanthaus.io">onboarding@merchanthaus.io</a> and we will be happy to assist you.</p>
<p>Sincerely,<br>The Merchant Haus Team</p>
<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px;">
<p style="font-size: 11px; color: #888;">Merchant Haus | 1100 Poydras St, Suite 2900, New Orleans, LA 70163</p>
<p style="font-size: 11px; color: #888;">Merchant Haus is a registered ISO/MSP of Esquire Bank, Garden City, NY.</p>
<p style="font-size: 11px; color: #888;">This email was sent to ${contactEmail} in connection with your application for merchant payment processing services.</p>
</body></html>`,
  };
}

/**
 * Adverse Action Notice — used when outcome_status = 'underwriting_declined'.
 * Body is LOCKED in the preview dialog because the disclosures are federally
 * required. Only the subject line is editable.
 */
export function buildUwDeclinedEmailTemplate({ contactFirstName, contactEmail, outcomeReason }: OutcomeEmailInput): EmailTemplate {
  const mappedReason = ADVERSE_ACTION_REASON_MAP[outcomeReason] || outcomeReason;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return {
    subject: "Notice of Application Decision — Merchant Haus",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Dear ${contactFirstName || 'Valued Applicant'},</p>

<p>Thank you for your application for merchant payment processing services with Merchant Haus. After careful review, we are unable to approve your application at this time.</p>

<p><strong>The principal reason for this decision:</strong> ${mappedReason}</p>

<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

<p style="font-size: 12px;">The federal Equal Credit Opportunity Act prohibits creditors from discriminating against credit applicants on the basis of race, color, religion, national origin, sex, marital status, age (provided the applicant has the capacity to enter into a binding contract); because all or part of the applicant's income derives from any public assistance program; or because the applicant has in good faith exercised any right under the Consumer Credit Protection Act. The federal agency that administers compliance with this law concerning this creditor is: Consumer Financial Protection Bureau, 1700 G Street NW, Washington, DC 20552. You may submit a complaint at consumerfinance.gov/complaint.</p>

<p style="font-size: 12px;">If a consumer credit report was obtained in connection with this application, it was obtained from: Experian, P.O. Box 4500, Allen, TX 75013, 1-888-397-3742. That agency did not make this decision and cannot explain why it was made. You have the right to obtain a free copy of your consumer report from that agency within 60 days of receiving this notice, and to dispute the accuracy or completeness of any information in your report.</p>

<p>If you believe this decision was made in error, or if your circumstances have changed, you are welcome to contact us at <a href="mailto:onboarding@merchanthaus.io">onboarding@merchanthaus.io</a>.</p>

<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px;">
<p style="font-size: 11px; color: #888;">Merchant Haus | 1100 Poydras St, Suite 2900, New Orleans, LA 70163</p>
<p style="font-size: 11px; color: #888;">Merchant Haus is a registered ISO/MSP of Esquire Bank, Garden City, NY.</p>
<p style="font-size: 11px; color: #888;">This notice was sent to ${contactEmail} on ${today}.</p>
</body></html>`,
  };
}

// ─── Account Closed Email (merchant-facing) ───

interface AccountClosureInput {
  recipientName: string;
  recipientEmail: string;
  accountName: string;
  outcomeStatus: string;
  outcomeReason: string;
  closedBy: string;
}

/** Merchant-facing account-closure email. Fully editable. */
export function buildAccountClosureTemplate({
  recipientName,
  accountName,
  outcomeStatus,
  outcomeReason,
}: AccountClosureInput): EmailTemplate {
  const statusLabel = outcomeStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    subject: `Account Closure Confirmation — ${accountName}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Dear ${recipientName || 'Valued Customer'},</p>
<p>This email confirms that the merchant processing account for <strong>${accountName}</strong> has been closed.</p>
<p><strong>Reason:</strong> ${statusLabel}${outcomeReason ? ` — ${outcomeReason}` : ''}</p>
<p>If you have any questions or need additional information, please reach out to us at <a href="mailto:onboarding@merchanthaus.io">onboarding@merchanthaus.io</a>.</p>
<p>Thank you for having been a Merchant Haus customer.</p>
<p>Sincerely,<br>The Merchant Haus Team</p>
<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px;">
<p style="font-size: 11px; color: #888;">Merchant Haus | 1100 Poydras St, Suite 2900, New Orleans, LA 70163</p>
<p style="font-size: 11px; color: #888;">Merchant Haus is a registered ISO/MSP of Esquire Bank, Garden City, NY.</p>
</body></html>`,
  };
}

/** Convenience — does the outcome email for this status have a locked body? */
export function isOutcomeBodyLocked(outcomeStatus: string): boolean {
  return outcomeStatus === 'underwriting_declined';
}
