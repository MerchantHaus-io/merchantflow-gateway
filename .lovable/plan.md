## Goal

Add invoice + receipt generation to Live & Billing, per merchant, using the exact same gateway pricing schedule, brand styling, PDF layout, and email pipeline as the existing Quote Builder. Staff can preview, download, and email the document; a history is kept on each account.

## What gets built

### 1. Data model (one new table)

`billing_documents` — one row per invoice or receipt, with line items stored as JSONB (no extra child table needed; mirrors how draft quotes are stored).

Columns (domain-specific):
- `account_id` (FK → accounts)
- `opportunity_id` (nullable, FK → opportunities, when scoped to a single deal)
- `doc_type` — `'invoice' | 'receipt'`
- `doc_number` — human readable, e.g. `INV-2026-00042` / `RCT-2026-00042`
- `status` — `'draft' | 'issued' | 'sent' | 'paid' | 'void'`
- `issued_date`, `due_date`, `paid_date`, `period_start`, `period_end`
- `currency`, `subtotal`, `tax`, `total`, `amount_paid`
- `gateway_tier` — `foundation | growth | scale | enterprise` (drives schedule defaults)
- `billing_cycle` — `monthly | annual`
- `line_items` (jsonb) — array of `{ id, label, description, qty, unit_price, amount, cadence, bundled, perEvent? }`
- `ancillary_fees` (jsonb) — same shape as the quote ancillary block
- `notes`, `merchant_name`, `merchant_email`, `merchant_phone`
- `sender` (jsonb) — name/title/company/email/phone (matches quote sender block)
- `pdf_path` (storage path inside `opportunity-documents`), `sent_at`, `sent_to[]`
- `created_by`, `created_at`, `updated_at`

RLS: authenticated team can read/insert/update; service_role full. Standard public-schema GRANTs.

### 2. Shared PDF builder

`src/lib/billingDocPdf.ts` — new module that reuses every brand constant from `quotePdf.ts` (INK, MUTED, HAIRLINE, BRAND_RED, CALLOUT_BG, page geometry, Times display headings, MerchantHaus shield, hairline rules, autotable styling). Same 3-section editorial flow as the quote PDF, repurposed:

- **Cover band**: logo + `INVOICE` / `RECEIPT` eyebrow, document number, issued date, due/paid date, period covered.
- **Bill-to / From** two-column block (identical to the quote client/sender layout).
- **Line items table** (jspdf-autotable) — pulls defaults from `TIER_PLATFORM_FEE`, `QUOTE_LINES`, `GATEWAY_FEE_DEFAULTS`, `ANCILLARY_FEE_DEFAULTS` based on the merchant's `gateway_tier` so invoices and receipts mirror the quote schedule exactly.
- **Totals block** with subtotal / tax / total; for receipts, an `Amount Paid` row and `PAID` stamp.
- **Footer**: standard quote disclaimers (reused subset) + terms-version line.

### 3. Email pipeline

New edge function `supabase/functions/send-billing-doc/index.ts`:
- Auth-required (JWT validated in code).
- Accepts `{ docId, recipients[], message? }`.
- Loads the row, regenerates the PDF server-side via a shared template (or downloads `pdf_path` from storage when present), and sends via Resend using the existing enterprise email template (dark gradient header, no emojis, sanitized subject) — same brand styling as `send-quote-email`.
- Stamps `sent_at`, appends to `sent_to`, logs to `client_interactions` for the timeline.

Registered in `supabase/config.toml`.

### 4. Dialog component

`src/components/live-billing/BillingDocDialog.tsx` — single dialog that handles both invoice and receipt creation (toggle at the top). Mirrors the editorial styling of `QuoteGeneratorDialog`.

Auto-fill flow:
1. Reads `accounts.nmi_merchant_id` + the account's latest opportunity for `gateway_tier`, `pricing_plan`, `billing_cycle`.
2. Pulls last-period NMI transaction summary already cached in the project for that MID to set `period_start/end`, txn count, and volume.
3. Builds the line-item list from `TIER_PLATFORM_FEE[tier]`, opportunity-selected add-ons (when known) and applicable `GATEWAY_FEE_DEFAULTS` (gateway auth monthly + per-transaction × txn count).
4. Adds disclosed ancillary fees (chargeback, PCI, setup, return-payment) flagged waived when not used.
5. Staff can edit any line, qty, unit price; totals recalculate live.

Actions: **Save draft**, **Download PDF**, **Send email** (opens preview confirm per existing email workflow), **Mark paid** (receipts).

### 5. Entry points on Live & Billing

- **Row action** on `LiveBilling.tsx` (desktop table + mobile card): new `Invoice` icon button next to `Close Account`, opens `BillingDocDialog` for that account.
- **Account detail** (`LiveAccountDetail.tsx`): new **Billing Docs** tab/section showing history (date, number, type, status, total, recipient) with `New Invoice` / `New Receipt` buttons and per-row actions (view PDF, resend, mark paid, void).

### 6. History list component

`src/components/live-billing/BillingDocsList.tsx` — used by the detail page. Columns: number, type chip, period, total, status badge, sent-to, actions.

## Technical notes

- PDF lib: existing `jspdf` + `jspdf-autotable` (already bundled for quotes) — no new deps.
- All PDFs uploaded to existing `opportunity-documents` bucket under `billing/{account_id}/{doc_number}.pdf`.
- Doc-number sequence: per-year sequence via Postgres function `next_billing_doc_number(doc_type, year)` backed by a small `billing_doc_sequence` table or `pg_sequences`.
- Timezone: all displayed dates rendered in `America/Chicago` with the `CT` suffix (project standard).
- Currency: USD by default; Canadian-track accounts auto-flip to CAD via the existing locale flag.
- No marketing content in emails; transactional only, branded enterprise template.

## Out of scope (for this pass)

- Recurring/auto-generated invoices on a cron (can be added once the manual flow ships).
- Card-on-file collection of the invoice amount.
- Stripe/Paddle payment links.
- Pulling actual NMI transaction breakdowns (`per-tx`, `voice auth`, etc.) — initial cut uses the cached monthly summary already in the CRM, then we can deepen to event-level fees in a follow-up.

## Approval

Confirm the plan and I'll ship the migration, edge function, dialog, history view, entry points, and styling in one pass.
