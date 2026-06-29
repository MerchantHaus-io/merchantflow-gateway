// Shared, brand-consistent HTML email shell for Merchant Haus outbound mail.
//
// Codifies the look used across the platform (dark gradient header, zinc
// palette, white content card, "merchanthaus.io" footer) so every automated
// message — support, sales, onboarding — lands in the inbox on-brand and on
// message. Inline styles only, kept email-client safe.

const BRAND = {
  wordmark: "Merchant Haus",
  site: "merchanthaus.io",
  siteUrl: "https://merchanthaus.io",
  support: "support@merchanthaus.io",
  // Core positioning line — what we do, in one breath.
  tagline: "Merchant services & payment solutions",
};

export const escapeHtml = (str: string): string =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type BadgeTone = "neutral" | "info" | "pending" | "success";

const BADGE_COLORS: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "#f4f4f5", fg: "#3f3f46", border: "#e4e4e7" },
  info: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  pending: { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" },
  success: { bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" },
};

/** A small coloured status pill, e.g. for ticket lifecycle states. */
export const statusBadge = (label: string, tone: BadgeTone = "neutral"): string => {
  const c = BADGE_COLORS[tone];
  return `<span style="display:inline-block;background:${c.bg};color:${c.fg};border:1px solid ${c.border};border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600;line-height:1;">${escapeHtml(label)}</span>`;
};

export interface InfoRow {
  label: string;
  /** Pre-rendered, trusted HTML for the value (escape upstream as needed). */
  value: string;
}

/** A bordered "summary" card — used for ticket reference / status blocks. */
export const infoCard = (rows: InfoRow[]): string => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:10px;background:#fafafa;margin:20px 0;">
    <tr><td style="padding:18px 20px;">
      ${rows
        .map(
          (r, i) => `<div style="${i === rows.length - 1 ? "" : "margin:0 0 14px;"}">
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#71717a;margin-bottom:3px;">${escapeHtml(r.label)}</div>
            <div style="font-size:15px;color:#18181b;">${r.value}</div>
          </div>`,
        )
        .join("")}
    </td></tr>
  </table>`;

export interface EmailLayoutOptions {
  /** Small uppercase label under the wordmark, e.g. "Support". */
  eyebrow?: string;
  /** Inbox preview text — hidden in the rendered body. */
  preheader?: string;
  /** Main body HTML (paragraphs, cards, etc.). */
  body: string;
  /** Sign-off name. Defaults to the team line. */
  signOff?: string;
}

/**
 * Wraps body content in the Merchant Haus branded shell.
 * Pass already-composed, trusted HTML in `body`.
 */
export const renderBrandedEmail = ({
  eyebrow,
  preheader,
  body,
  signOff = "The Merchant Haus Team",
}: EmailLayoutOptions): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(preheader)}</div>`
      : ""
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#18181b;background:linear-gradient(135deg,#18181b 0%,#27272a 100%);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.01em;color:#fafafa;">${BRAND.wordmark}</div>
          <div style="font-size:12px;color:#a1a1aa;margin-top:4px;letter-spacing:.02em;">${escapeHtml(BRAND.tagline)}</div>
          ${
            eyebrow
              ? `<div style="margin-top:14px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#d4d4d8;">${escapeHtml(eyebrow)}</div>`
              : ""
          }
        </td></tr>
        <!-- Content -->
        <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-top:0;border-radius:0 0 12px 12px;padding:32px;">
          <div style="font-size:15px;line-height:1.6;color:#3f3f46;">
            ${body}
          </div>
          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f1;font-size:15px;color:#3f3f46;">
            Kind regards,<br><strong style="color:#18181b;">${escapeHtml(signOff)}</strong>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 16px;text-align:center;">
          <div style="font-size:12px;color:#a1a1aa;line-height:1.6;">
            <strong style="color:#71717a;">${BRAND.wordmark}</strong> &bull; <a href="${BRAND.siteUrl}" style="color:#71717a;text-decoration:none;">${BRAND.site}</a><br>
            Need a hand? Email <a href="mailto:${BRAND.support}" style="color:#71717a;text-decoration:underline;">${BRAND.support}</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export { BRAND };
