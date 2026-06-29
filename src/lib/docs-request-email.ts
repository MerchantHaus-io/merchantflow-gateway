// Client-side mirror of the email template used by send-qualified-docs-request
// Keep in sync with supabase/functions/send-qualified-docs-request/index.ts

const MERCHANT_APPLY_BASE = "https://ops-terminal.lovable.app/merchant-apply";

export interface DocsRequestEmailInput {
  firstName: string;
  accountName: string;
  opportunityId?: string;
  missingDocs?: string[];
  websiteChanges?: string[];
  recommendedActions?: string[];
}

export const buildDocsRequestSubject = (
  accountName: string,
  missingDocs?: string[],
  websiteChanges?: string[],
  recommendedActions?: string[],
): string => {
  const hasDocs = !!(missingDocs && missingDocs.length > 0);
  const hasWebsite = !!(websiteChanges && websiteChanges.length > 0);
  const hasActions = !!(recommendedActions && recommendedActions.length > 0);
  const websiteOnly = hasWebsite && !hasDocs && !hasActions;
  if (websiteOnly) return `A few quick website updates for a smooth approval — ${accountName}`;
  if (hasDocs && (hasWebsite || hasActions)) return `Next steps for your application — ${accountName}`;
  if (!hasDocs && hasActions) return `Next steps for your application — ${accountName}`;
  return `Action Required — Complete Your Merchant Application — ${accountName}`;
};

export const buildDocsRequestHtml = ({
  firstName,
  accountName,
  opportunityId,
  missingDocs,
  websiteChanges,
  recommendedActions,
}: DocsRequestEmailInput): string => {
  const applyUrl = opportunityId
    ? `${MERCHANT_APPLY_BASE}?opp_id=${encodeURIComponent(opportunityId)}&utm_source=email&utm_medium=docs_request&utm_campaign=qualified`
    : MERCHANT_APPLY_BASE;

  const hasDocs = !!(missingDocs && missingDocs.length > 0);
  const hasWebsite = !!(websiteChanges && websiteChanges.length > 0);
  const hasActions = !!(recommendedActions && recommendedActions.length > 0);
  const websiteOnly = hasWebsite && !hasDocs && !hasActions;

  const docListHtml = hasDocs
    ? missingDocs!.map((d) => `<li>${d}</li>`).join("\n")
    : `<li>3 months of recent bank statements</li>
        <li>Voided check or bank letter</li>
        <li>Government-issued photo ID (driver's license or passport)</li>
        <li>Business license or articles of incorporation</li>`;

  const websiteListHtml = hasWebsite
    ? websiteChanges!.map((w) => `<li>${w}</li>`).join("\n")
    : "";

  const actionListHtml = hasActions
    ? recommendedActions!.map((a) => `<li>${a}</li>`).join("\n")
    : "";

  let introText: string;
  if (websiteOnly) {
    introText = `Thank you for choosing us to process payments for <strong>${accountName}</strong>. Your documents are looking great — we're almost there. As part of our standard pre-approval check, we noticed a few small adjustments to your website that, once in place, would help us move you to a smooth, fast approval (typically within about a month).`;
  } else if (hasDocs && (hasWebsite || hasActions)) {
    introText = `We're progressing with your merchant application for <strong>${accountName}</strong>. To wrap things up, we still need a few outstanding items below — along with a couple of small adjustments that will help your approval go through smoothly.`;
  } else if (hasDocs) {
    introText = `We're progressing with your merchant application for <strong>${accountName}</strong>. To continue, we still require the following outstanding documents:`;
  } else if (hasActions && !hasWebsite) {
    introText = `Thanks for your patience with the application for <strong>${accountName}</strong>. Our underwriting team has reviewed your file and outlined a few next steps below that will help us move to final approval.`;
  } else {
    introText = `Great news — we've reviewed your inquiry for <strong>${accountName}</strong> and we'd love to move forward. To proceed with your merchant application, we'll need the following documents:`;
  }

  const docsBlock = hasDocs || (!hasWebsite && !hasActions)
    ? `
      <p><strong>Documents we still need:</strong></p>
      <ul class="doc-list">
        ${docListHtml}
      </ul>`
    : "";

  const websiteBlock = hasWebsite
    ? `
      <div class="website-block">
        <p style="margin-top:0;"><strong>Recommended website updates</strong></p>
        <p style="margin: 6px 0 10px; font-size: 14px; color:#3f3f46;">
          These are common items our acquiring bank looks for during card-not-present underwriting. Putting them in place upfront avoids back-and-forth and typically results in approval inside a month:
        </p>
        <ul class="doc-list">
          ${websiteListHtml}
        </ul>
        <p style="font-size: 13px; color:#52525b; margin-bottom: 0;">
          If anything here is unclear or you'd like a second pair of eyes on the wording, just reply to this email — we're happy to help draft policy text or point to good examples.
        </p>
      </div>`
    : "";

  const actionsBlock = hasActions
    ? `
      <div class="website-block">
        <p style="margin-top:0;"><strong>Recommended next steps from underwriting</strong></p>
        <p style="margin: 6px 0 10px; font-size: 14px; color:#3f3f46;">
          A few items our underwriting team highlighted while reviewing your file. Addressing these helps us move to approval without further back-and-forth:
        </p>
        <ul class="doc-list">
          ${actionListHtml}
        </ul>
      </div>`
    : "";

  const ctaLabel = websiteOnly ? "Open Application Portal" : "Complete Merchant Application";

  return `
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
    .doc-list { background: #f4f4f5; border-radius: 8px; padding: 16px 24px; margin: 12px 0 20px; }
    .doc-list li { margin-bottom: 6px; font-size: 14px; color: #3f3f46; }
    .website-block { background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 10px; padding: 16px 20px; margin: 8px 0 20px; }
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
      <p>${introText}</p>
      ${docsBlock}
      ${websiteBlock}
      ${actionsBlock}
      <p>${websiteOnly ? "Once those updates are live, just reply and we'll move straight to final approval." : "Please complete our secure merchant application form to upload your documents and provide the required business details:"}</p>
      <p style="text-align: center;">
        <a href="${applyUrl}" class="cta">${ctaLabel}</a>
      </p>
      <p>Any questions about the items above or the application process — just reach out at <a href="mailto:support@merchanthaus.io">support@merchanthaus.io</a>. We're here to help.</p>
      <p style="margin-top: 24px;">Kind regards,<br><strong>The Merchant Haus Team</strong></p>
    </div>
    <div class="footer">
      <p>Merchant Haus &bull; <a href="https://merchanthaus.io">merchanthaus.io</a></p>
    </div>
  </div>
</body>
</html>`;
};
