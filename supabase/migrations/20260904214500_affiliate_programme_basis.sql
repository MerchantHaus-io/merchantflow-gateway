-- Affiliate programme basis — bring the database in line with the one rule.
--
--     partner share = (gateway billed − gateway cost) ÷ 4,
--                     capped per merchant per month
--
-- Mirrors `src/lib/affiliatePayouts.ts` (PARTNER_SHARE_DIVISOR, GATEWAY_BASIS,
-- DEFAULT_MONTHLY_CAP). Three things had drifted from it:
--
--   1. `referrers.commission_rate` was 0.5000 — double the programme rate — so
--      every commission credit on the ledger was booked at twice its value.
--   2. `20260904203347_1f264424-36cc-4b38-a19f-cbb88f9bd739.sql` wrote the
--      gateway cost as $15.00/month. The real basis is $25.00/month + $0.15/txn.
--      That migration is already applied and is left untouched; this forward
--      migration supersedes it.
--   3. `build_referrer_ledger()` lost the "earnings run from the month of the
--      merchant's first gateway invoice" guard, so a month before that invoice
--      could accrue.
--
-- Billed / cost / net / margin figures below are INTERNAL. They are never
-- rendered to a merchant or to a partner — a partner sees only their own share.

-- --------------------------------------------------------------------------
-- 1. The basis itself, so it stops being retyped in every migration body.
--    IMMUTABLE and inlinable; these are the SQL mirror of GATEWAY_BASIS.
-- --------------------------------------------------------------------------

-- What the merchant is billed for the gateway in a month:
--   $59.00 monthly + $0.40 per transaction ($0.25 gateway + $0.15 extensions).
CREATE OR REPLACE FUNCTION public.gateway_billed(_txn_count numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(59.00 + (GREATEST(COALESCE(_txn_count, 0), 0) * 0.40), 2)
$$;

-- What that month costs us:
--   $25.00 monthly (TIER_PLATFORM_FEE.foundation.cost) + $0.15 per transaction.
--   NOT the $15.00 the superseded migration used — that over-states every net
--   by $10/month.
CREATE OR REPLACE FUNCTION public.gateway_cost(_txn_count numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(25.00 + (GREATEST(COALESCE(_txn_count, 0), 0) * 0.15), 2)
$$;

-- Gateway net for the month — billed less cost, never negative.
CREATE OR REPLACE FUNCTION public.gateway_net(_txn_count numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(public.gateway_billed(_txn_count) - public.gateway_cost(_txn_count), 0)
$$;

-- A quarter of the net (PARTNER_SHARE_DIVISOR = 4).
CREATE OR REPLACE FUNCTION public.partner_commission_rate()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 0.25::numeric
$$;

-- One merchant-month of partner earnings: net x rate, trimmed by the
-- per-merchant monthly cap. Pass cap = 0 for an uncapped partner.
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

-- --------------------------------------------------------------------------
-- 2. The rate itself. Both earning partners sat at 0.5000.
--    Attribution-only partners earn nothing and stay at 0.
-- --------------------------------------------------------------------------

UPDATE public.referrers
   SET commission_rate = public.partner_commission_rate()
 WHERE COALESCE(attribution_only, false) = false
   AND commission_rate > 0
   AND commission_rate <> public.partner_commission_rate();

ALTER TABLE public.referrers
  ALTER COLUMN commission_rate SET DEFAULT 0.25;

COMMENT ON COLUMN public.referrers.commission_rate IS
  'Share of the monthly gateway net this partner earns. Programme rate is 0.25 (a quarter) — see public.partner_commission_rate().';

-- --------------------------------------------------------------------------
-- 3. Re-assert the correct gateway figures on existing commission rows.
--    Production already holds the right values (13 txns -> billed 64.20,
--    margin 37.25), so this is a no-op there; it exists to repair any row the
--    superseded $15.00 migration filled in.
-- --------------------------------------------------------------------------

UPDATE public.commission_records cr
   SET gateway_invoiced = public.gateway_billed(cr.transaction_count),
       gateway_margin   = public.gateway_net(cr.transaction_count)
  FROM public.accounts a
 WHERE a.id = cr.account_id
   AND a.referrer_id IS NOT NULL
   AND (cr.gateway_invoiced IS DISTINCT FROM public.gateway_billed(cr.transaction_count)
     OR cr.gateway_margin   IS DISTINCT FROM public.gateway_net(cr.transaction_count));

-- --------------------------------------------------------------------------
-- 4. Restate the commission credits already on the ledger.
--
--    Every one of them was booked at the doubled rate. They are recomputed
--    from each credit's own gateway month rather than restated by a factor, so
--    a credit that was wrong for some other reason lands on the programme
--    figure too.
--
--    Only credits that are still ours to restate are touched: nothing paid,
--    voided, or attached to a payout run. At the time of writing no credit was
--    in any of those states, so all six restate.
--
--    The `referrer_ledger_defaults` trigger fires BEFORE UPDATE on these rows.
--    It only fills `payable_on` when NULL (all six already have one, so no
--    re-dating) and only promotes pending -> payable once `payable_on` has
--    arrived — which is the programme's own maturity rule, unchanged by a
--    restatement. The three August credits mature 2026-09-30 and stay pending.
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- 5. Rebuild the ledger builder on the basis functions, with the first-invoice
--    start month restored.
--
--    A merchant's earnings run from the month of their first gateway invoice.
--    Where a merchant has no invoice row yet, the accepted quote's month stands
--    in, as it did in 20260904184256, and failing that their first gateway month
--    on `commission_records` does.
--
--    That third fallback is deliberate. Two of the three referred merchants
--    (Exotic Car Trader, the masque skin) have neither a `billing_documents`
--    invoice nor an accepted quote, yet they carry real gateway months and are
--    accruing today. Restoring the guard as a bare "no start month, no earnings"
--    would silently stop paying their partner. Falling back to the first gateway
--    month keeps the rule — nothing accrues before the merchant's gateway
--    billing starts — without inventing a cut-off from missing paperwork.
-- --------------------------------------------------------------------------

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
      -- Earnings run from the month of the merchant's first gateway invoice.
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
