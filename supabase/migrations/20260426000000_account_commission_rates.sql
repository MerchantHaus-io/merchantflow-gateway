-- Per-account commission rate config used by the nmi-commissions edge function.
--
-- commission_model:
--   'gateway_only' (default) — we don't earn residuals on processing volume; commission = 0
--   'processing'             — we earn a share of (merchant_rate − interchange) × volume
--
-- For 'processing' accounts, the formula applied per period is:
--   gross_fees      = volume × merchant_rate_pct  / 100
--   gross_margin    = volume × (merchant_rate_pct − interchange_rate_pct) / 100
--   total_commission = gross_margin × revenue_share_pct / 100

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS commission_model      text          DEFAULT 'gateway_only',
  ADD COLUMN IF NOT EXISTS merchant_rate_pct     numeric(6,4),
  ADD COLUMN IF NOT EXISTS interchange_rate_pct  numeric(6,4),
  ADD COLUMN IF NOT EXISTS revenue_share_pct     numeric(5,2);

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_commission_model_check
  CHECK (commission_model IN ('gateway_only', 'processing'));

-- Backfill: any account with a closed_won "processing" opportunity gets the processing model.
UPDATE public.accounts a
SET commission_model = 'processing'
WHERE EXISTS (
  SELECT 1 FROM public.opportunities o
  WHERE o.account_id = a.id
    AND o.outcome_status = 'closed_won'
    AND (
      o.service_type = 'processing'
      OR (o.processing_services IS NOT NULL AND array_length(o.processing_services, 1) > 0)
    )
);

-- Apply standard NMI Payments pricing as default for processing accounts:
--   2.92% sell, ~1.80% interchange estimate, 30% rev share.
UPDATE public.accounts
SET
  merchant_rate_pct    = COALESCE(merchant_rate_pct,    2.92),
  interchange_rate_pct = COALESCE(interchange_rate_pct, 1.80),
  revenue_share_pct    = COALESCE(revenue_share_pct,    30.00)
WHERE commission_model = 'processing';
