-- Two-stream commission model: Gateway (invoiced) + Processing (Kurv residual).
--
-- Background: MerchantHaus earns from two separate streams that must not be
-- conflated:
--   * Gateway   — driven by the merchant's ACCEPTED QUOTE. We calculate and
--                 invoice this directly (quote monthly_resale), and our profit
--                 is the quote monthly_margin. Independent of card volume.
--   * Processing — a residual we receive on processing volume, computed from the
--                 monthly transaction report using each merchant's agreed Kurv
--                 metrics and our residual split (EMS Schedule A: 85% retail).
--
-- This migration adds the config + storage for both, and activates Improv (the
-- only merchant with confirmed processor metrics at this stage).

-- ── 1) Per-account Kurv processing metrics ─────────────────────────────────
-- Replaces the old NMI processing model (merchant_rate / interchange / rev_share)
-- for residual computation. Those columns are left in place but are no longer
-- used by the nmi-commissions function.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS kurv_volume_rate_pct numeric(6,4),            -- e.g. 0.5  (% of volume)
  ADD COLUMN IF NOT EXISTS kurv_per_txn_fee     numeric(10,4),           -- e.g. 0.25 ($/txn)
  ADD COLUMN IF NOT EXISTS kurv_residual_split  numeric(5,4) DEFAULT 0.85; -- our share of the markup

COMMENT ON COLUMN public.accounts.kurv_volume_rate_pct IS 'Kurv processing markup as a percent of settled volume (e.g. 0.5 = 0.5%).';
COMMENT ON COLUMN public.accounts.kurv_per_txn_fee     IS 'Kurv processing markup per settled transaction in dollars (e.g. 0.25).';
COMMENT ON COLUMN public.accounts.kurv_residual_split  IS 'Our residual share of the Kurv markup (EMS Schedule A retail = 0.85).';

-- ── 2) Gateway figures on each monthly commission record ───────────────────
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS gateway_invoiced numeric(10,2) NOT NULL DEFAULT 0, -- quote monthly_resale (what we invoice)
  ADD COLUMN IF NOT EXISTS gateway_margin   numeric(10,2) NOT NULL DEFAULT 0; -- quote monthly_margin (our profit)

COMMENT ON COLUMN public.commission_records.gateway_invoiced IS 'Gateway amount invoiced to the merchant this period (accepted quote monthly_resale).';
COMMENT ON COLUMN public.commission_records.gateway_margin   IS 'Our gateway profit this period (accepted quote monthly_margin).';

-- ── 3) Activate Improv under the Kurv model (0.5% / $0.25 / 85%) ───────────
UPDATE public.accounts
   SET commission_model     = 'processing',
       kurv_volume_rate_pct = 0.5,
       kurv_per_txn_fee     = 0.25,
       kurv_residual_split  = 0.85,
       updated_at           = now()
 WHERE name ILIKE '%Improv%';

-- ── 4) Backfill May 2026 Improv gateway figures from its accepted quote ────
-- Uses the most recently accepted quote linked to Improv's account.
UPDATE public.commission_records cr
   SET gateway_invoiced = COALESCE(q.monthly_resale, 0),
       gateway_margin   = COALESCE(q.monthly_margin, 0)
  FROM (
    SELECT qa.account_id, qa.monthly_resale, qa.monthly_margin
      FROM public.quotes qa
      JOIN public.accounts a ON a.id = qa.account_id
     WHERE a.name ILIKE '%Improv%'
       AND qa.status = 'accepted'
     ORDER BY qa.accepted_at DESC NULLS LAST
     LIMIT 1
  ) q
 WHERE cr.account_id = q.account_id
   AND cr.period_id = (
     SELECT id FROM public.commission_periods
      WHERE period_start = '2026-05-01' AND period_end = '2026-05-31'
   );
