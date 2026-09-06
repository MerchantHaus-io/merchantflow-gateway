CREATE OR REPLACE FUNCTION public.gateway_billed(_txn_count numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(59.00 + (GREATEST(COALESCE(_txn_count, 0), 0) * 0.40), 2)
$$;

CREATE OR REPLACE FUNCTION public.gateway_cost(_txn_count numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(25.00 + (GREATEST(COALESCE(_txn_count, 0), 0) * 0.15), 2)
$$;

CREATE OR REPLACE FUNCTION public.gateway_net(_txn_count numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(public.gateway_billed(_txn_count) - public.gateway_cost(_txn_count), 0)
$$;

CREATE OR REPLACE FUNCTION public.partner_commission_rate()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 0.25::numeric
$$;

CREATE OR REPLACE FUNCTION public.partner_share(
  _net numeric,
  _rate numeric DEFAULT NULL,
  _cap numeric DEFAULT 1000
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(
    CASE
      WHEN COALESCE(_cap, 0) > 0
        THEN LEAST(GREATEST(COALESCE(_net, 0), 0) * COALESCE(_rate, public.partner_commission_rate()),
                   _cap)
      ELSE GREATEST(COALESCE(_net, 0), 0) * COALESCE(_rate, public.partner_commission_rate())
    END, 2)
$$;

COMMENT ON FUNCTION public.gateway_billed(numeric) IS
  'Internal. Monthly gateway amount billed to a merchant: $59.00 + $0.40/txn. Mirrors GATEWAY_BASIS in src/lib/affiliatePayouts.ts.';
COMMENT ON FUNCTION public.gateway_cost(numeric) IS
  'Internal. Our monthly gateway cost: $25.00 + $0.15/txn. Never surfaced to a merchant or a partner.';
COMMENT ON FUNCTION public.gateway_net(numeric) IS
  'Internal. Gateway billed less gateway cost for one merchant-month, floored at zero.';
COMMENT ON FUNCTION public.partner_commission_rate() IS
  'Programme rate: a partner earns a quarter of the gateway net (PARTNER_SHARE_DIVISOR = 4).';
COMMENT ON FUNCTION public.partner_share(numeric, numeric, numeric) IS
  'Partner earnings for one merchant-month: gateway net x rate, capped per merchant per month.';

GRANT EXECUTE ON FUNCTION public.gateway_billed(numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gateway_cost(numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gateway_net(numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_commission_rate() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_share(numeric, numeric, numeric) TO authenticated, service_role;

UPDATE public.referrers
   SET commission_rate = public.partner_commission_rate()
 WHERE COALESCE(attribution_only, false) = false
   AND commission_rate > 0
   AND commission_rate <> public.partner_commission_rate();

ALTER TABLE public.referrers
  ALTER COLUMN commission_rate SET DEFAULT 0.25;

COMMENT ON COLUMN public.referrers.commission_rate IS
  'Share of the monthly gateway net this partner earns. Programme rate is 0.25 (a quarter) — see public.partner_commission_rate().';

UPDATE public.commission_records cr
   SET gateway_invoiced = public.gateway_billed(cr.transaction_count),
       gateway_margin   = public.gateway_net(cr.transaction_count)
  FROM public.accounts a
 WHERE a.id = cr.account_id
   AND a.referrer_id IS NOT NULL
   AND (cr.gateway_invoiced IS DISTINCT FROM public.gateway_billed(cr.transaction_count)
     OR cr.gateway_margin   IS DISTINCT FROM public.gateway_net(cr.transaction_count));

UPDATE public.referrer_ledger_entries e
   SET amount = public.partner_share(
                  public.gateway_net(cr.transaction_count),
                  r.commission_rate,
                  r.monthly_cap_per_merchant)
  FROM public.commission_records cr
  JOIN public.commission_periods cp ON cp.id = cr.period_id
  JOIN public.accounts a ON a.id = cr.account_id
  JOIN public.referrers r ON r.id = a.referrer_id
 WHERE e.entry_type = 'commission'
   AND e.account_id = cr.account_id
   AND e.referrer_id = r.id
   AND e.period_start = cp.period_start
   AND e.status IN ('pending', 'payable')
   AND e.payout_run_id IS NULL
   AND e.paid_at IS NULL
   AND e.amount IS DISTINCT FROM public.partner_share(
                                  public.gateway_net(cr.transaction_count),
                                  r.commission_rate,
                                  r.monthly_cap_per_merchant);

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

  WITH start_months AS (
    SELECT
      a.id AS account_id,
      COALESCE(
        (SELECT date_trunc('month', MIN(bd.issued_date))::date
           FROM public.billing_documents bd
          WHERE bd.account_id = a.id
            AND bd.doc_type = 'invoice'),
        (SELECT date_trunc('month', COALESCE(q.accepted_at, q.created_at))::date
           FROM public.quotes q
          WHERE q.account_id = a.id
            AND q.status = 'accepted'
          ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC
          LIMIT 1),
        (SELECT MIN(cp.period_start)
           FROM public.commission_records cr2
           JOIN public.commission_periods cp ON cp.id = cr2.period_id
          WHERE cr2.account_id = a.id)
      ) AS start_month
    FROM public.accounts a
    WHERE a.referrer_id IS NOT NULL
  ), months AS (
    SELECT
      a.id                       AS account_id,
      a.name                     AS company_name,
      a.referrer_id,
      r.commission_rate,
      r.monthly_cap_per_merchant,
      cp.period_start,
      cp.period_end,
      public.gateway_net(cr.transaction_count) AS net_margin
    FROM public.commission_records cr
    JOIN public.commission_periods cp ON cp.id = cr.period_id
    JOIN public.accounts a ON a.id = cr.account_id
    JOIN public.referrers r ON r.id = a.referrer_id
    JOIN start_months sm ON sm.account_id = a.id
    WHERE a.referrer_id IS NOT NULL
      AND r.active
      AND COALESCE(r.attribution_only, false) = false
      AND r.commission_rate > 0
      AND cp.period_start < date_trunc('month', CURRENT_DATE)::date
      AND sm.start_month IS NOT NULL
      AND cp.period_start >= sm.start_month
  ), priced AS (
    SELECT
      m.*,
      public.partner_share(m.net_margin, m.commission_rate, m.monthly_cap_per_merchant) AS amount
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
  'Builds/backdates monthly gateway-only partner commission entries: each month gateway net (billed less our cost, via public.gateway_net) times the partner rate, capped per merchant per month, from the month of the merchant first gateway invoice onwards. Promotes matured entries to payable. Idempotent.';