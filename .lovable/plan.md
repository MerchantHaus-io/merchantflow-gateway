## Goal

Right now `nmi-commissions` **computes** commissions locally by taking each merchant's transaction volume/count and multiplying by rates we stored on the account (`kurv_volume_rate_pct`, `kurv_per_txn_fee`, `kurv_residual_split`). That's an estimate — not what NMI actually paid us.

You want the same treatment as transactions: hit NMI's Partner API, pull the **actual commission / residual report NMI issues to us**, store it, and surface it in the terminal.

## What I'll build

### 1. New edge function: `nmi-partner-residuals`
- Auth against Partner v4 with `NMI_API_KEY` (same key used by `nmi-transactions`).
- Call NMI's partner residual/commission report endpoint (v4 `/residuals` / `/reports/residuals`, with fallback to v3 `/affiliate/reports` if v4 returns empty — same pattern we already use for the merchant roster).
- Accept `?month=YYYY-MM` (default = previous complete month, since NMI publishes residuals ~mid-following-month).
- Return one row per merchant per month: `nmi_merchant_id`, `company_name`, `gross_volume`, `transaction_count`, `interchange`, `assessments`, `processor_fees`, `gateway_fees`, `partner_residual` (what NMI paid us), plus the raw JSON for audit.

### 2. New table: `nmi_partner_residuals`
Columns: `id`, `period_month` (date, first-of-month), `nmi_merchant_id`, `account_id` (nullable FK, resolved by MID lookup), `company_name`, `gross_volume`, `transaction_count`, `interchange_cost`, `assessments`, `processor_fees`, `gateway_fees`, `partner_residual`, `raw` (jsonb), `synced_at`. Unique on `(period_month, nmi_merchant_id)` for idempotent upserts. RLS: read = authenticated; write = service_role only.

### 3. Sync scheduling
- Add a `pg_cron` job that runs `nmi-partner-residuals` daily at ~08:00 CT — cheap, idempotent, and catches NMI's mid-month publish without us babysitting it.
- Keep the existing on-demand "Sync" button behavior — the Commissions page will also trigger a fetch for the currently viewed month.

### 4. UI wiring on the Commissions page
- Add a **"NMI Actuals"** column next to today's computed "Estimated Commission" so we can see estimate vs. actual side-by-side and spot drift.
- Show a small badge on each row: `Matched` (MID → account resolved), `Unmatched` (residual came in for a MID not in our accounts — needs mapping).
- Month picker at the top; defaults to last published month.

### 5. Account detail
- On `LiveAccountDetail`, add a compact "NMI Residuals (last 6 months)" strip pulled from `nmi_partner_residuals` for that account's MID.

## What I'm NOT changing

- The existing `commission_records` / `commission_periods` estimate flow stays — that's still useful for in-month forecasting before NMI publishes.
- The referrer payout logic (`compute_referrer_payout`) is untouched — this is NMI→us, not us→referrers.
- Commission-model settings on accounts (gateway_only vs processing) stay.

## Open question before I build

NMI's partner residual endpoint name/path varies by portal generation. Two quick options:

**A.** I ship it assuming Partner v4 `/residuals` with a v3 `/affiliate/residuals` fallback, log both responses, and we correct once we see live data. Fastest path.

**B.** You paste the exact residual/commission report endpoint from your NMI partner portal docs (or a sample response), and I map fields precisely on the first pass.

I'd recommend **A** unless you already have the endpoint handy — the fallback + raw-JSON persistence means we won't lose data even if the first mapping is off.
