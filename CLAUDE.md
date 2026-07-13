# MerchantHaus Gateway — Project Memory

## RULE: Never expose partner cost or markup in merchant-facing output

**MerchantHaus quotes, contracts, and any document we generate or send to a
merchant must show only the merchant's *resale* price.** They must never
reveal:

- NMI (or any other supplier's) **partner / wholesale / underlying cost**
- Our **markup / margin** (the spread between cost and resale)
- Anything from which the merchant could back out our cost or margin
  (e.g. showing partner cost *and* resale side by side)

This applies to every merchant-facing surface: the Quote Generator preview,
the quote PDF (`src/lib/quotePdf.ts`), the Merchant Services Agreement /
Exhibit A, line-item **descriptions**, disclaimers, and email bodies.

### Where cost/margin are allowed
Cost and margin are **internal only**. They may live in:
- Structured config fields used for internal math — `cost`, `resale`,
  `margin`/`monthlyMargin` in `src/config/quoteSchedule.ts` and
  `src/config/pricing.ts`.
- The internal Quote Generator UI columns (rep-facing cost/margin editors).
- Internal reference material such as `NMI_GATEWAY_FEATURES.partnerCost`,
  `NMI_SCHEDULE_A_RATES`, and the NMI Guide.

Those internal fields must **never** be piped verbatim into a rendered,
merchant-facing string. In particular, **line-item `description` text is
merchant-facing** — keep it a plain feature description with no cost figures.

### When adding or editing quote lines
- Put the underlying cost in the `cost` field only.
- Keep `description` free of partner-cost / "NMI partner cost $…" language.
- If you need the wholesale figure for reference, use the internal NMI
  reference tables — do not embed it in a quote/contract string.

### Enforcement — applies to contracts and re-rendered documents too
Cleaning the source strings only protects *new* data. Accepted quotes and
drafts persist a **snapshot** of their line descriptions (`lines_snapshot` /
`extras_snapshot`), and the **Merchant Services Agreement / Exhibit A** and any
re-rendered quote or invoice are built from that snapshot. A quote captured
before a source string was cleaned still carries the old cost text.

So every merchant-facing PDF generator scrubs descriptions through
`stripInternalCostRefs()` (`src/lib/redactCost.ts`) at render time — the last
line of defense. It is wired into `src/lib/quotePdf.ts` (quote **and** MSA
Exhibit A) and `src/lib/billingDocPdf.ts` (invoices/receipts). Any new
merchant-facing document generator MUST run line descriptions through this
helper. It only cleans the rendered string; internal `cost`/`margin` fields are
untouched.

> Note: `src/lib/statementProposalPdf.ts` legitimately shows a **markup over
> cost** figure — that is the *merchant's current processor's* markup (a
> savings talking point), not MerchantHaus's. That is fine and not covered by
> this rule.
