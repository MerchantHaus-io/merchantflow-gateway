ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS commission_model text NOT NULL DEFAULT 'gateway_only',
  ADD COLUMN IF NOT EXISTS kurv_volume_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS kurv_per_txn_fee numeric,
  ADD COLUMN IF NOT EXISTS kurv_residual_split numeric;