// Shared helpers for support-ticket intake (public web form + inbound email).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TicketCategory = "support" | "billing" | "integration" | "technical";

const VALID_CATEGORIES: TicketCategory[] = ["support", "billing", "integration", "technical"];

export const normalizeCategory = (value: unknown): TicketCategory =>
  VALID_CATEGORIES.includes(value as TicketCategory) ? (value as TicketCategory) : "support";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** Pull a bare email address out of a raw `From`-style header value. */
export const extractEmailAddress = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  const angle = s.match(/<([^>]+)>/);
  const candidate = angle ? angle[1] : s;
  const m = candidate.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : "";
};

/** Pull a human display name out of a raw `From`-style header value. */
export const extractDisplayName = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  const angle = s.match(/^"?([^"<]+)"?\s*</);
  if (angle && angle[1].trim()) return angle[1].trim();
  if (s.includes("@") && !s.includes(" ")) {
    return s
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return s;
};

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(String(email ?? "").trim());

/** Best-effort auto-classification of an inbound message from its text. */
export const classifyCategory = (text: string): TicketCategory => {
  const t = (text || "").toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  if (
    has([
      "invoice",
      "billing",
      "refund",
      "charge",
      "statement",
      "payment failed",
      "overcharge",
      "subscription",
      "pricing",
    ])
  ) {
    return "billing";
  }
  if (has(["api", "webhook", "integration", "plugin", "sdk", "endpoint", "shopify", "woocommerce", "magento"])) {
    return "integration";
  }
  if (has(["error", "bug", "broken", "not working", "crash", "outage", "timeout", "declined", "503", "500"])) {
    return "technical";
  }
  return "support";
};

/** Find an existing MH-#### ticket reference inside a subject/body (for email threading). */
export const findTicketNumber = (text: string): string | null => {
  const m = (text || "").match(/MH-(\d{3,})/i);
  return m ? `MH-${m[1]}` : null;
};

/** Strip HTML down to readable plain text. */
export const stripHtml = (html: string): string =>
  String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Trim a quoted reply chain off the bottom of an inbound email body. */
export const stripQuotedReply = (text: string): string => {
  const lines = String(text || "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .+ wrote:\s*$/.test(line)) break;
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && out.length > 0) break;
    out.push(line);
  }
  return out.join("\n").trim() || String(text || "").trim();
};

/** Decode quoted-printable soft breaks + escaped chars that sometimes survive. */
const decodeQuotedPrintable = (s: string): string =>
  s
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _m;
      }
    });

/**
 * Marketing-ish placeholder names only. `${...}` and `{{...}}` are also valid
 * code a developer customer might paste when reporting an API problem, so the
 * strip is limited to the merge fields newsletter platforms leave unfilled.
 */
const MARKETING_TOKEN_NAME =
  /^(?:[a-z0-9_.-]*(?:btn|button|link|url|href|unsubscribe|preference|webversion|web_version|view|mirror|forward|footer|address|company|firstname|first_name|lastname|last_name|fullname|recipient|subscriber|list|campaign|utm|tracking|pixel|logo|banner|social)[a-z0-9_.-]*)$/i;

/** Remove unfilled marketing template tokens like ${btn_link}, {{view_url}}, [[foo]], <[[…]]>. */
const stripTemplateTokens = (s: string): string =>
  s
    .replace(/<\[\[[\s\S]*?\]\]>/g, "")
    .replace(/\[\[[\s\S]*?\]\]/g, "")
    .replace(/\$\{([^}\n]{0,120})\}/g, (m, name: string) =>
      MARKETING_TOKEN_NAME.test(name.trim()) ? "" : m,
    )
    .replace(/\{\{([^}\n]{0,120})\}\}/g, (m, name: string) =>
      MARKETING_TOKEN_NAME.test(name.trim()) ? "" : m,
    );

/**
 * Shorten obvious tracking / redirect URLs so they don't dominate the body.
 *
 * Only known redirect wrappers are collapsed. A generic "any long URL" rule
 * used to live here and it destroyed legitimate links customers paste —
 * Drive shares, signed S3/screenshot URLs, deep dashboard links — with no way
 * to recover them.
 */
const shortenTrackingUrls = (s: string): string => {
  const TRACKERS = [
    /https?:\/\/[^\s<>()]*\/e3t\/[^\s<>()]+/gi,          // HubSpot
    /https?:\/\/[^\s<>()]*list-manage\.com\/[^\s<>()]+/gi, // Mailchimp
    /https?:\/\/[^\s<>()]*sendgrid\.net\/ls\/click[^\s<>()]*/gi,
    /https?:\/\/[^\s<>()]*hubspotlinks\.com\/[^\s<>()]+/gi,
    /https?:\/\/[^\s<>()]*mandrillapp\.com\/track[^\s<>()]*/gi,
    /https?:\/\/click\.[^\s<>()]+/gi,
    /https?:\/\/[^\s<>()]*\/wf\/click\?[^\s<>()]+/gi,
  ];
  let out = s;
  for (const re of TRACKERS) out = out.replace(re, "[link]");
  return out;
};

/** Drop common newsletter chrome lines (view in browser / unsubscribe / © footer / address). */
const stripMarketingChrome = (s: string): string => {
  const CHROME = [
    /^\s*view (in|as) (browser|webpage|a webpage)\b.*$/i,
    /^\s*view online\b.*$/i,
    /^\s*unsubscribe\b.*$/i,
    /^\s*manage (your )?preferences\b.*$/i,
    /^\s*update (your )?preferences\b.*$/i,
    /^\s*you (are|'re) receiving this\b.*$/i,
    /^\s*©\s*20\d{2}[\s\S]{0,200}$/i,
    /^\s*copyright\s*©?\s*20\d{2}\b.*$/i,
    /^\s*forward to a friend\b.*$/i,
    /^\s*add us to your address book\b.*$/i,
    /^\s*privacy policy\b.*$/i,
    /^\s*sent (to|by)\b.*$/i,
  ];
  return s
    .split("\n")
    .filter((line) => !CHROME.some((re) => re.test(line)))
    .join("\n");
};

/** Collapse invisible/zero-width chars and blank-line runs. */
const normalizeWhitespace = (s: string): string =>
  s
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");

const MAX_DESCRIPTION_CHARS = 8000;

/**
 * Full sanitisation pass for inbound email bodies. Prefer plain text; fall
 * back to HTML → text. Removes template tokens, tracking URLs, marketing
 * chrome, quoted replies and normalises whitespace. Caps to 8 KB.
 */
export const sanitizeInboundBody = (rawText: string, rawHtml: string): string => {
  let body = rawText && rawText.trim() ? rawText : (rawHtml ? stripHtml(rawHtml) : "");
  body = decodeQuotedPrintable(body);
  body = stripTemplateTokens(body);
  body = shortenTrackingUrls(body);
  body = stripMarketingChrome(body);
  body = stripQuotedReply(body);
  body = normalizeWhitespace(body);
  if (body.length > MAX_DESCRIPTION_CHARS) {
    body = body.slice(0, MAX_DESCRIPTION_CHARS).trimEnd() + "\n\n[…truncated]";
  }
  return body || "(no message body)";
};

/**
 * Match an inbound requester email to an existing CRM account + contact.
 * Returns ids when a contact with that email exists.
 */
export const matchAccountByEmail = async (
  supabase: SupabaseClient,
  email: string,
): Promise<{ account_id: string | null; contact_id: string | null }> => {
  if (!email) return { account_id: null, contact_id: null };
  const { data } = await supabase
    .from("contacts")
    .select("id, account_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  const row = (data ?? null) as { id?: string | null; account_id?: string | null } | null;
  return {
    account_id: row?.account_id ?? null,
    contact_id: row?.id ?? null,
  };
};
