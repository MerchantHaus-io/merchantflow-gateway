
-- 1) Token cache (service-role only)
CREATE TABLE public.kurv_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL UNIQUE,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.kurv_api_tokens TO service_role;
ALTER TABLE public.kurv_api_tokens ENABLE ROW LEVEL SECURITY;
-- no policies: only service role accesses

-- 2) Merchant roster
CREATE TABLE public.kurv_merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mid text NOT NULL UNIQUE,
  dba_name text,
  legal_name text,
  status text,
  mcc text,
  processor text,
  boarded_at timestamptz,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kurv_merchants_status_idx ON public.kurv_merchants(status);
CREATE INDEX kurv_merchants_account_idx ON public.kurv_merchants(account_id);
GRANT SELECT ON public.kurv_merchants TO authenticated;
GRANT ALL ON public.kurv_merchants TO service_role;
ALTER TABLE public.kurv_merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read Kurv merchants"
  ON public.kurv_merchants FOR SELECT TO authenticated USING (true);

-- 3) Deal submissions
CREATE TABLE public.kurv_deal_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  deal_id text,
  deal_type text NOT NULL CHECK (deal_type IN ('signed','unsigned')),
  status text NOT NULL DEFAULT 'submitted',
  submitted_by text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  error text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kurv_deal_subs_opp_idx ON public.kurv_deal_submissions(opportunity_id);
CREATE INDEX kurv_deal_subs_status_idx ON public.kurv_deal_submissions(status);
GRANT SELECT ON public.kurv_deal_submissions TO authenticated;
GRANT ALL ON public.kurv_deal_submissions TO service_role;
ALTER TABLE public.kurv_deal_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read Kurv deal submissions"
  ON public.kurv_deal_submissions FOR SELECT TO authenticated USING (true);

-- 4) Transactions cache (daily)
CREATE TABLE public.kurv_transactions_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mid text NOT NULL,
  business_date date NOT NULL,
  sales_amount numeric(14,2) DEFAULT 0,
  sales_count int DEFAULT 0,
  refunds_amount numeric(14,2) DEFAULT 0,
  refunds_count int DEFAULT 0,
  deposit_amount numeric(14,2) DEFAULT 0,
  interchange_amount numeric(14,2) DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mid, business_date)
);
CREATE INDEX kurv_tx_daily_mid_date_idx ON public.kurv_transactions_daily(mid, business_date DESC);
GRANT SELECT ON public.kurv_transactions_daily TO authenticated;
GRANT ALL ON public.kurv_transactions_daily TO service_role;
ALTER TABLE public.kurv_transactions_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read Kurv daily transactions"
  ON public.kurv_transactions_daily FOR SELECT TO authenticated USING (true);

-- 5) Sync logs
CREATE TABLE public.kurv_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  status text NOT NULL,
  rows_processed int DEFAULT 0,
  duration_ms int,
  error text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kurv_sync_logs_job_idx ON public.kurv_sync_logs(job, created_at DESC);
GRANT SELECT ON public.kurv_sync_logs TO authenticated;
GRANT ALL ON public.kurv_sync_logs TO service_role;
ALTER TABLE public.kurv_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read Kurv sync logs"
  ON public.kurv_sync_logs FOR SELECT TO authenticated USING (true);

-- updated_at triggers
CREATE TRIGGER kurv_api_tokens_touch BEFORE UPDATE ON public.kurv_api_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER kurv_merchants_touch BEFORE UPDATE ON public.kurv_merchants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER kurv_deal_subs_touch BEFORE UPDATE ON public.kurv_deal_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
