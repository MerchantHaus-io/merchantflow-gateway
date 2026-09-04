-- Affiliate payout programme: ACH details, credit ledger, payout runs, balances view

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS payout_method text NOT NULL DEFAULT 'ach',
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_routing_last4 text,
  ADD COLUMN IF NOT EXISTS bank_account_last4 text,
  ADD COLUMN IF NOT EXISTS payout_notes text,
  ADD COLUMN IF NOT EXISTS minimum_payout numeric NOT NULL DEFAULT 50;

-- ---------------------------------------------------------------- payout runs
CREATE TABLE IF NOT EXISTS public.referrer_payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  minimum_payout numeric NOT NULL DEFAULT 50,
  total_amount numeric NOT NULL DEFAULT 0,
  partner_count integer NOT NULL DEFAULT 0,
  reference text,
  notes text,
  approved_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrer_payout_runs_status_chk CHECK (status IN ('draft','approved','paid','void')),
  CONSTRAINT referrer_payout_runs_period_chk CHECK (period_end >= period_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrer_payout_runs TO authenticated;
GRANT ALL ON public.referrer_payout_runs TO service_role;
ALTER TABLE public.referrer_payout_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage payout runs"
  ON public.referrer_payout_runs FOR ALL TO authenticated
  USING (public.is_internal_staff())
  WITH CHECK (public.is_internal_staff());

-- ------------------------------------------------------------- credit ledger
CREATE TABLE IF NOT EXISTS public.referrer_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  period_start date,
  period_end date,
  payable_on date,
  status text NOT NULL DEFAULT 'pending',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  commission_record_id uuid REFERENCES public.commission_records(id) ON DELETE SET NULL,
  payout_run_id uuid REFERENCES public.referrer_payout_runs(id) ON DELETE SET NULL,
  description text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrer_ledger_entry_type_chk
    CHECK (entry_type IN ('commission','bonus','clawback','adjustment','payout')),
  CONSTRAINT referrer_ledger_status_chk
    CHECK (status IN ('pending','payable','paid','void'))
);

CREATE INDEX IF NOT EXISTS referrer_ledger_referrer_idx ON public.referrer_ledger_entries (referrer_id, period_start DESC);
CREATE INDEX IF NOT EXISTS referrer_ledger_status_idx ON public.referrer_ledger_entries (status);
CREATE INDEX IF NOT EXISTS referrer_ledger_run_idx ON public.referrer_ledger_entries (payout_run_id);
-- One commission credit per referrer per commission record.
CREATE UNIQUE INDEX IF NOT EXISTS referrer_ledger_commission_uniq
  ON public.referrer_ledger_entries (referrer_id, commission_record_id)
  WHERE commission_record_id IS NOT NULL AND entry_type = 'commission';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrer_ledger_entries TO authenticated;
GRANT ALL ON public.referrer_ledger_entries TO service_role;
ALTER TABLE public.referrer_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage affiliate ledger"
  ON public.referrer_ledger_entries FOR ALL TO authenticated
  USING (public.is_internal_staff())
  WITH CHECK (public.is_internal_staff());

CREATE POLICY "Affiliates read own ledger"
  ON public.referrer_ledger_entries FOR SELECT TO authenticated
  USING (public.referrer_owns(referrer_id));

-- --------------------------------------------------- schedule helper + trigger
-- Credits earned in a month become payable 30 days after that month ends.
CREATE OR REPLACE FUNCTION public.referrer_payable_on(_period_end date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (_period_end + INTERVAL '30 days')::date
$$;

CREATE OR REPLACE FUNCTION public.referrer_ledger_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.period_end IS NOT NULL AND NEW.payable_on IS NULL THEN
    NEW.payable_on := public.referrer_payable_on(NEW.period_end);
  END IF;

  -- A credit whose payable date has arrived is payable; paid/void stay put.
  IF NEW.status = 'pending' AND NEW.payable_on IS NOT NULL AND NEW.payable_on <= CURRENT_DATE THEN
    NEW.status := 'payable';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referrer_ledger_defaults_trg ON public.referrer_ledger_entries;
CREATE TRIGGER referrer_ledger_defaults_trg
  BEFORE INSERT OR UPDATE ON public.referrer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.referrer_ledger_defaults();

DROP TRIGGER IF EXISTS referrer_payout_runs_touch_trg ON public.referrer_payout_runs;
CREATE TRIGGER referrer_payout_runs_touch_trg
  BEFORE UPDATE ON public.referrer_payout_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------- balances view
-- security_invoker: staff see every partner, a partner sees only their own row.
CREATE OR REPLACE VIEW public.referrer_balances
WITH (security_invoker = on) AS
  SELECT
    r.id                                                                   AS referrer_id,
    r.full_name,
    r.email,
    r.active,
    r.attribution_only,
    COALESCE(r.minimum_payout, 50)                                         AS minimum_payout,
    COALESCE(SUM(CASE WHEN l.status = 'pending'  THEN l.amount END), 0)    AS pending_amount,
    COALESCE(SUM(CASE WHEN l.status = 'payable'  THEN l.amount END), 0)    AS payable_amount,
    COALESCE(SUM(CASE WHEN l.status = 'paid'     THEN l.amount END), 0)    AS paid_amount,
    COALESCE(SUM(CASE WHEN l.status IN ('pending','payable') THEN l.amount END), 0) AS balance_amount,
    COALESCE(SUM(CASE WHEN l.status <> 'void' THEN l.amount END), 0)       AS lifetime_amount,
    MAX(l.paid_at)                                                         AS last_paid_at,
    MAX(l.period_end)                                                      AS last_period_end,
    COUNT(l.id) FILTER (WHERE l.entry_type = 'commission')                 AS commission_entries
  FROM public.referrers r
  LEFT JOIN public.referrer_ledger_entries l ON l.referrer_id = r.id
  GROUP BY r.id, r.full_name, r.email, r.active, r.attribution_only, r.minimum_payout;

GRANT SELECT ON public.referrer_balances TO authenticated;