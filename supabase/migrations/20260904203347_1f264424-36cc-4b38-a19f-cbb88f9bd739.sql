-- Gateway billing/cost basis (internal only):
--   billed  = $59.00 monthly + $0.40 per transaction ($0.25 gateway + $0.15 extensions)
--   cost    = $15.00 monthly ($10 gateway access + $5 fraud tools) + $0.15 per transaction
--   net     = billed - cost      → partner earns net * commission_rate (50%)

-- 1. Fill monthly gateway billed/net figures on existing commission rows.
UPDATE public.commission_records cr
   SET gateway_invoiced = ROUND(59.00 + (COALESCE(cr.transaction_count, 0) * 0.40), 2),
       gateway_margin   = GREATEST(
         ROUND(
           (59.00 + (COALESCE(cr.transaction_count, 0) * 0.40))
           - (15.00 + (COALESCE(cr.transaction_count, 0) * 0.15)), 2),
         0)
  FROM public.accounts a
 WHERE a.id = cr.account_id
   AND a.referrer_id IS NOT NULL
   AND COALESCE(cr.gateway_margin, 0) = 0;

-- 2. Monthly partner earnings builder, driven by the real monthly net figure.
CREATE OR REPLACE FUNCTION public.build_referrer_ledger()
RETURNS TABLE (inserted integer, promoted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_promoted integer := 0;
BEGIN
  IF NOT (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH months AS (
    SELECT
      a.id                                  AS account_id,
      a.name                                AS company_name,
      a.referrer_id,
      r.commission_rate,
      r.monthly_cap_per_merchant,
      cp.period_start,
      cp.period_end,
      GREATEST(COALESCE(cr.gateway_margin, 0), 0)::numeric AS net_margin
    FROM public.commission_records cr
    JOIN public.commission_periods cp ON cp.id = cr.period_id
    JOIN public.accounts a ON a.id = cr.account_id
    JOIN public.referrers r ON r.id = a.referrer_id
    WHERE a.referrer_id IS NOT NULL
      AND r.active
      AND COALESCE(r.attribution_only, false) = false
      AND r.commission_rate > 0
      AND cp.period_start < date_trunc('month', CURRENT_DATE)::date
  ), priced AS (
    SELECT
      m.*,
      ROUND(
        CASE
          WHEN m.monthly_cap_per_merchant > 0
            THEN LEAST(m.net_margin * m.commission_rate, m.monthly_cap_per_merchant)
          ELSE m.net_margin * m.commission_rate
        END, 2) AS amount
    FROM months m
  ), ins AS (
    INSERT INTO public.referrer_ledger_entries
      (referrer_id, entry_type, amount, period_start, period_end, account_id, description)
    SELECT p.referrer_id, 'commission', p.amount, p.period_start, p.period_end, p.account_id,
           'Gateway referral commission — ' || COALESCE(p.company_name, 'merchant')
      FROM priced p
     WHERE p.amount > 0
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  WITH promo AS (
    UPDATE public.referrer_ledger_entries
       SET status = 'payable'
     WHERE status = 'pending'
       AND payable_on IS NOT NULL
       AND payable_on <= CURRENT_DATE
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_promoted FROM promo;

  RETURN QUERY SELECT v_inserted, v_promoted;
END;
$$;

REVOKE ALL ON FUNCTION public.build_referrer_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_referrer_ledger() TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_referrer_ledger() TO service_role;

COMMENT ON FUNCTION public.build_referrer_ledger() IS
  'Builds/backdates monthly gateway-only partner commission entries from each month net gateway figure (billed less our cost) times the partner rate, capped per merchant per month. Idempotent.';