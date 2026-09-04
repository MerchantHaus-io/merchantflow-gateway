-- 1. Partner earnings view: gateway margin only
DROP VIEW IF EXISTS public.referrer_commission_records;

CREATE VIEW public.referrer_commission_records
WITH (security_invoker = true) AS
SELECT
  cr.id AS record_id,
  cr.period_id,
  cp.period_start,
  cp.period_end,
  cr.account_id,
  cr.company_name,
  cr.transaction_volume,
  cr.transaction_count,
  cr.total_commission AS processing_residual,
  cr.gateway_invoiced,
  cr.gateway_margin,
  cr.gateway_margin AS company_commission,
  a.referrer_id,
  r.commission_rate,
  r.monthly_cap_per_merchant,
  (cr.gateway_margin * r.commission_rate) AS uncapped_payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0::numeric
      THEN LEAST(cr.gateway_margin * r.commission_rate, r.monthly_cap_per_merchant)
    ELSE cr.gateway_margin * r.commission_rate
  END AS payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0::numeric
     AND (cr.gateway_margin * r.commission_rate) > r.monthly_cap_per_merchant
      THEN true
    ELSE false
  END AS at_cap
FROM public.commission_records cr
JOIN public.accounts a ON a.id = cr.account_id
JOIN public.referrers r ON r.id = a.referrer_id
JOIN public.commission_periods cp ON cp.id = cr.period_id;

GRANT SELECT ON public.referrer_commission_records TO authenticated;
GRANT SELECT ON public.referrer_commission_records TO service_role;

COMMENT ON VIEW public.referrer_commission_records IS
  'Partner earnings basis. Payout = gateway margin x partner rate, capped per merchant per month. Processing residual is informational only and never paid to partners.';

-- 2. Backfill gateway figures on existing commission rows from accepted pricing
WITH latest_quote AS (
  SELECT DISTINCT ON (q.account_id)
    q.account_id, q.monthly_resale, q.monthly_margin
  FROM public.quotes q
  WHERE q.status = 'accepted' AND q.account_id IS NOT NULL
  ORDER BY q.account_id, q.accepted_at DESC NULLS LAST, q.created_at DESC
)
UPDATE public.commission_records cr
   SET gateway_invoiced = COALESCE(lq.monthly_resale, 0),
       gateway_margin   = COALESCE(lq.monthly_margin, 0)
  FROM latest_quote lq
 WHERE lq.account_id = cr.account_id
   AND cr.gateway_margin = 0;

-- 3. Idempotency guard for month-based commission entries
CREATE UNIQUE INDEX IF NOT EXISTS referrer_ledger_month_uniq
  ON public.referrer_ledger_entries (referrer_id, account_id, period_start)
  WHERE entry_type = 'commission' AND account_id IS NOT NULL;

-- 4. Monthly earnings schedule builder (backdating)
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

  WITH base AS (
    SELECT
      a.id                AS account_id,
      a.name              AS company_name,
      a.referrer_id,
      r.commission_rate,
      r.monthly_cap_per_merchant,
      COALESCE(lq.monthly_margin, 0)::numeric AS monthly_margin,
      COALESCE(
        (SELECT date_trunc('month', MIN(bd.issued_date))::date
           FROM public.billing_documents bd
          WHERE bd.account_id = a.id AND bd.doc_type = 'invoice'),
        date_trunc('month', lq.accepted_at)::date
      ) AS start_month
    FROM public.accounts a
    JOIN public.referrers r ON r.id = a.referrer_id
    LEFT JOIN LATERAL (
      SELECT q.monthly_margin, COALESCE(q.accepted_at, q.created_at) AS accepted_at
        FROM public.quotes q
       WHERE q.account_id = a.id AND q.status = 'accepted'
       ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC
       LIMIT 1
    ) lq ON true
    WHERE a.referrer_id IS NOT NULL
      AND r.active
      AND COALESCE(r.attribution_only, false) = false
      AND r.commission_rate > 0
  ), months AS (
    SELECT
      b.*,
      m::date AS period_start,
      (m + interval '1 month - 1 day')::date AS period_end
    FROM base b
    CROSS JOIN LATERAL generate_series(
      b.start_month,
      (date_trunc('month', CURRENT_DATE) - interval '1 month')::date,
      interval '1 month'
    ) AS m
    WHERE b.start_month IS NOT NULL
      AND b.monthly_margin > 0
  ), priced AS (
    SELECT
      m.*,
      ROUND(
        CASE
          WHEN m.monthly_cap_per_merchant > 0
            THEN LEAST(m.monthly_margin * m.commission_rate, m.monthly_cap_per_merchant)
          ELSE m.monthly_margin * m.commission_rate
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
  'Builds/backdates monthly gateway-only partner commission entries and promotes matured entries to payable. Idempotent.';