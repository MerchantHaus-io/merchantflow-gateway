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
