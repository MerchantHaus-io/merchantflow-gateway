// Zod schema for the `quotes.lines_snapshot` jsonb column.
//
// The public quote-acceptance page (and the internal AcceptedQuotesPanel)
// iterate `lines_snapshot` directly via `.filter`/`.map`. Postgres jsonb
// accepts any JSON shape, so a previous writer regression that stored an
// object (`{ lines, ancillary, ... }`) instead of an array landed in
// production and crashed the public render. This schema enforces shape at
// every write path so we never persist a non-array again.
//
// Import + validate in EVERY code path that inserts/updates `quotes`.

import { z } from "zod";

export const quoteLineSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
  cost: z.number().finite(),
  resale: z.number().finite(),
  perEvent: z
    .object({
      label: z.string(),
      cost: z.number().finite().optional(),
      resale: z.number().finite(),
    })
    .partial({ cost: true })
    .optional(),
  enabled: z.boolean(),
  bundled: z.boolean(),
});

export type QuoteLine = z.infer<typeof quoteLineSchema>;

/**
 * `lines_snapshot` MUST be a non-empty array of line items.
 * Reject anything else (object, null, string, []) at the write boundary.
 */
export const linesSnapshotSchema = z
  .array(quoteLineSchema)
  .min(1, "lines_snapshot must contain at least one line item");

/**
 * Validate the subset of a quote row that we care about shape-wise.
 * Other quote columns (totals, client info, etc.) are validated elsewhere.
 */
export const quoteWritePayloadSchema = z
  .object({
    lines_snapshot: linesSnapshotSchema,
  })
  .passthrough();

export type QuoteWritePayload = z.infer<typeof quoteWritePayloadSchema>;

/**
 * Throws a descriptive Error if the row is malformed. Use right before any
 * supabase.from('quotes').insert/update/upsert call.
 */
export function assertValidQuoteWrite(row: unknown): asserts row is QuoteWritePayload {
  const result = quoteWritePayloadSchema.safeParse(row);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid quote payload — ${issues}`);
  }
}

// ─── Quote status + void ─────────────────────────────────────────────────
// `void` is the terminal "withdrawn" state from migration
// 20261104120000_quote_void_and_support_spam.sql. A quote is voided with a
// plain `update quotes set status = 'void'`; the DB trigger stamps
// voided_at / voided_by / voided_by_email, keeps it terminal, refuses an
// acceptance against it, and stops downstream partner earnings. None of that
// is reimplemented client-side — these helpers only classify and word it.

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "void"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Postgres check_violation — what every void guard raises. */
export const CHECK_VIOLATION = "23514";

export const isQuoteVoid = (status: string | null | undefined): boolean => status === "void";

/** Every known status except `void` itself can be voided (owner decision). */
export const canVoidQuote = (status: string | null | undefined): boolean =>
  !!status && status !== "void" && (QUOTE_STATUSES as readonly string[]).includes(status);

/** Void quotes are withdrawn — they do not count as quotes in totals. */
export const countsAsLiveQuote = (status: string | null | undefined): boolean =>
  !isQuoteVoid(status);

/**
 * True when a Supabase/PostgREST error is one of the DB void guards
 * (`quote_void`, `quote_void_terminal`, `quote_void_on_insert`).
 */
export const isQuoteVoidRefusal = (
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean =>
  !!err && err.code === CHECK_VIOLATION && /\bquote_void/.test(err.message ?? "");

/** Shown to a rep whose save/send hits a quote that was voided meanwhile. */
export const QUOTE_VOIDED_MESSAGE =
  "This quote has been voided, so it can no longer be changed or sent. Start a new quote instead.";

/** Merchant-facing copy for a withdrawn quote (public /q/:token page). */
export const QUOTE_WITHDRAWN_MESSAGE = "This quote has been withdrawn";

/** The accept-quote edge function flags a void quote with `withdrawn: true`. */
export const isWithdrawnPayload = (body: unknown): boolean =>
  !!body && typeof body === "object" && (body as { withdrawn?: unknown }).withdrawn === true;

/** Body text of the "Void quote" confirm dialog. No reason is collected. */
export const voidConfirmDescription = (q: {
  quoteNumber: string;
  businessName?: string | null;
  status: string;
}): string => {
  const who = q.businessName?.trim() || "this merchant";
  const base =
    `${q.quoteNumber} for ${who} will be marked void. Its acceptance link stops working ` +
    `immediately and the quote is kept for the record. Void is final and can't be undone.`;
  if (q.status === "accepted") {
    return (
      `${base} The merchant's signed acceptance is kept, but no contract can be generated ` +
      `from it, and partner earnings for this merchant stop from this month ` +
        `(unless another of their quotes is accepted).`
    );
  }
  return base;
};
