-- Clean up stale records
DELETE FROM commission_records WHERE nmi_gateway_id = 'unknown';

-- Add unique constraints if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_periods_period_start_period_end_key'
  ) THEN
    ALTER TABLE commission_periods ADD CONSTRAINT commission_periods_period_start_period_end_key UNIQUE (period_start, period_end);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_records_period_id_nmi_gateway_id_key'
  ) THEN
    ALTER TABLE commission_records ADD CONSTRAINT commission_records_period_id_nmi_gateway_id_key UNIQUE (period_id, nmi_gateway_id);
  END IF;
END $$;