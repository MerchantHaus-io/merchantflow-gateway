
-- 1. Referrers: switch to $500/account/month recurring, drop lifetime cap & account ceiling
ALTER TABLE public.referrers
  ALTER COLUMN monthly_cap_per_merchant SET DEFAULT 500.00;

UPDATE public.referrers
   SET monthly_cap_per_merchant = 500.00
 WHERE monthly_cap_per_merchant IS DISTINCT FROM 500.00;

ALTER TABLE public.referrers
  DROP COLUMN IF EXISTS lifetime_cap_per_merchant,
  DROP COLUMN IF EXISTS account_ceiling;

-- 2. Commission records: add capped referrer_payout
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS referrer_payout numeric(10,2) NOT NULL DEFAULT 0;

-- 3. Trigger: compute payout = LEAST(total_commission * rev_share, monthly_cap)
CREATE OR REPLACE FUNCTION public.compute_referrer_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate    numeric := 0.50;   -- 50% rev share
  v_cap     numeric := 500.00; -- $500/account/month default
  v_ref_id  uuid;
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    SELECT a.referrer_id INTO v_ref_id
      FROM public.accounts a WHERE a.id = NEW.account_id;

    IF v_ref_id IS NOT NULL THEN
      SELECT COALESCE(r.commission_rate, v_rate),
             COALESCE(r.monthly_cap_per_merchant, v_cap)
        INTO v_rate, v_cap
        FROM public.referrers r WHERE r.id = v_ref_id;

      -- commission_rate historically stored as fraction (e.g. 0.50)
      IF v_rate > 1 THEN v_rate := v_rate / 100.0; END IF;
    END IF;
  END IF;

  NEW.referrer_payout := LEAST(
    ROUND(COALESCE(NEW.total_commission, 0) * v_rate, 2),
    v_cap
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_records_payout ON public.commission_records;
CREATE TRIGGER trg_commission_records_payout
BEFORE INSERT OR UPDATE OF total_commission, account_id
ON public.commission_records
FOR EACH ROW EXECUTE FUNCTION public.compute_referrer_payout();

-- 4. Backfill existing records
UPDATE public.commission_records cr
   SET referrer_payout = LEAST(
        ROUND(COALESCE(cr.total_commission,0) *
              CASE WHEN COALESCE(r.commission_rate, 0.50) > 1
                   THEN COALESCE(r.commission_rate, 0.50) / 100.0
                   ELSE COALESCE(r.commission_rate, 0.50) END, 2),
        COALESCE(r.monthly_cap_per_merchant, 500.00)
      )
  FROM public.accounts a
  LEFT JOIN public.referrers r ON r.id = a.referrer_id
 WHERE cr.account_id = a.id;
