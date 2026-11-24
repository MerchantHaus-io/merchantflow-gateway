// CAN-SPAM footer for commercial outreach email (FTC "CAN-SPAM Act: A Compliance
// Guide for Business"): a valid physical postal address and a clear, working way
// to opt out. The opt-out is a reply / mailto to the sender; a reply already stops
// a 12-touch cadence (outreach-execute detectReply). Opt-outs must be honoured
// within 10 business days and the mechanism must work for 30 days after sending.
//
// Pure TypeScript (no npm:/jsr:/Deno imports) so vitest can import it.
// The footer is appended at send time and is NOT counted in the 90-word limit.

/** Same address used on quotes and invoices (src/config/quoteSchedule.ts MH_ADDRESS). */
export const MH_LEGAL_NAME = 'MerchantHaus LLC';
export const MH_POSTAL_ADDRESS = '1209 Mountain Road Pl NE Ste N, Albuquerque, NM 87110, USA';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export function complianceFooterText(): string {
  return `${MH_LEGAL_NAME} · ${MH_POSTAL_ADDRESS}\nTo stop these emails, reply "unsubscribe" and we won't email you again.`;
}

export function complianceFooterHtml(): string {
  return `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6e747c;">${escapeHtml(MH_LEGAL_NAME)} &middot; ${escapeHtml(MH_POSTAL_ADDRESS)}<br>To stop these emails, reply &ldquo;unsubscribe&rdquo; and we won&#39;t email you again.</p>`;
}

/** RFC 2369 List-Unsubscribe value: a mailto back to the address that receives replies. */
export function listUnsubscribe(replyAddress: string): string {
  const address = replyAddress.trim().replace(/^.*<([^>]+)>.*$/, '$1');
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) throw new Error('List-Unsubscribe needs a plain reply email address');
  return `<mailto:${address}?subject=unsubscribe>`;
}

/** Appends the footer inside </body> when present, otherwise at the end. */
export function withComplianceFooterHtml(html: string): string {
  const footer = complianceFooterHtml();
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : `${html}${footer}`;
}
