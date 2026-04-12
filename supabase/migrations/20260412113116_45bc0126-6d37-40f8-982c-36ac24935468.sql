
CREATE TABLE public.commission_sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  merchant_count integer NOT NULL DEFAULT 0,
  raw_response jsonb,
  source_api text NOT NULL DEFAULT 'v3_boarding',
  triggered_by text,
  duration_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync logs"
  ON public.commission_sync_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage sync logs"
  ON public.commission_sync_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_sync_logs_period ON public.commission_sync_logs (period_year, period_month, created_at DESC);
