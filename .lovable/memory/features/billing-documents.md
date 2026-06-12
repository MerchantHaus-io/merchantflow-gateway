---
name: Billing documents (invoices & receipts)
description: Per-merchant invoices and receipts on Live & Billing, priced from the gateway pricing schedule used by Quote Builder
type: feature
---

Invoices and receipts are generated per merchant on the Live & Billing page.

- **Table:** `billing_documents` (one row per doc; line items as JSONB).
- **Numbering:** `next_billing_doc_number(doc_type, year)` allocates INV-YYYY-##### / RCT-YYYY-##### from `billing_doc_sequences`.
- **Pricing source:** `src/lib/billingDocSchedule.ts` reuses `TIER_PLATFORM_FEE`, `QUOTE_LINES`, `GATEWAY_FEE_DEFAULTS`, `ANCILLARY_FEE_DEFAULTS` from the quote schedule so invoices mirror the active quote.
- **PDF:** `src/lib/billingDocPdf.ts` (jsPDF + autotable) renders the same editorial layout as quotePdf — brand red eyebrow, Times serif headline, hairline rule, Bill-to/From two-column, totals block; receipts include a green PAID stamp.
- **Email:** edge function `send-billing-doc` sends via Resend with the same dark gradient header / no-emoji styling as `send-quote-email`. PDF attached. CCs sender by default.
- **Storage:** PDFs uploaded to `opportunity-documents` bucket at `billing/{account_id}/{doc_number}.pdf`.
- **Entry points:**
  - Row icon on `LiveBilling.tsx` (Receipt icon next to Close).
  - `BillingDocsPanel` on `LiveAccountDetail.tsx` (history list + New Invoice / New Receipt buttons).
- Dates rendered in America/Chicago per project timezone standard.
