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
