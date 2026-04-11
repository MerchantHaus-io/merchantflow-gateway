-- Commission periods (monthly snapshots)
CREATE TABLE public.commission_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_volume NUMERIC(15,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_commission NUMERIC(12,2) DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(period_start, period_end)
);

ALTER TABLE public.commission_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view commission periods"
  ON public.commission_periods FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage commission periods"
  ON public.commission_periods FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can manage commission periods"
  ON public.commission_periods FOR ALL
  TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

-- Per-merchant commission records
CREATE TABLE public.commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.commission_periods(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  nmi_gateway_id TEXT NOT NULL,
  company_name TEXT,
  transaction_count INTEGER DEFAULT 0,
  transaction_volume NUMERIC(15,2) DEFAULT 0,
  transaction_fees NUMERIC(10,2) DEFAULT 0,
  monthly_fees NUMERIC(10,2) DEFAULT 0,
  chargeback_fees NUMERIC(10,2) DEFAULT 0,
  residual_rate NUMERIC(5,4),
  residual_amount NUMERIC(10,2) DEFAULT 0,
  total_commission NUMERIC(10,2) DEFAULT 0,
  volume_change_pct NUMERIC(6,2),
  commission_change_pct NUMERIC(6,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(period_id, nmi_gateway_id)
);

ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view commission records"
  ON public.commission_records FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage commission records"
  ON public.commission_records FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can manage commission records"
  ON public.commission_records FOR ALL
  TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

-- Indexes for fast queries
CREATE INDEX idx_commission_records_period ON public.commission_records(period_id);
CREATE INDEX idx_commission_records_account ON public.commission_records(account_id);
CREATE INDEX idx_commission_records_gateway ON public.commission_records(nmi_gateway_id);
CREATE INDEX idx_commission_periods_dates ON public.commission_periods(period_start, period_end);

-- Trigger for updated_at on commission_periods
CREATE TRIGGER update_commission_periods_updated_at
  BEFORE UPDATE ON public.commission_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();