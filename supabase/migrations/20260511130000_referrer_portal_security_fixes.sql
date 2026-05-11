-- Referrer Portal: security hardening follow-up.
--
-- The initial portal migration (20260511120000) added referrer-scoped SELECT policies
-- on opportunities/accounts/applications/merchants. However, the pre-existing policies
-- granted *any* authenticated user `USING (auth.uid() IS NOT NULL)`. Postgres RLS
-- combines policies with OR, so the broad policy still let referrers read every row.
--
-- This migration:
--   1. Tightens SELECT/INSERT/UPDATE/DELETE on opportunities, accounts, applications,
--      merchants — restricting CRM operations to internal staff (@merchanthaus.io).
--      Existing referrer-scoped policies remain in place (OR'd into the SELECT layer).
--   2. Lets the public application form keep working (anon INSERTs with no referrer_id).
--   3. Lets referrers INSERT applications only when tagged with their own referrer_id
--      (closes the spoof window from before).
--   4. Re-creates `referrer_commission_records` view with security_invoker = on so RLS
--      on the underlying tables is enforced under the view consumer's identity.
--   5. Removes the unused (and overly permissive) `link_opportunity_to_referrer`
--      SECURITY DEFINER function.
--
-- Edge functions using the service role key bypass RLS entirely and remain unaffected.

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared helper: is the caller an internal staff member?
-- (SECURITY DEFINER so the auth.users lookup works inside policies.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users
     WHERE id = auth.uid()
       AND email ILIKE '%@merchanthaus.io'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- opportunities
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view opportunities"   ON public.opportunities;
DROP POLICY IF EXISTS "Anyone can create opportunities"              ON public.opportunities;
DROP POLICY IF EXISTS "Authenticated users can update opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Authenticated users can delete opportunities" ON public.opportunities;

CREATE POLICY "Internal staff can view opportunities"
  ON public.opportunities FOR SELECT
  USING (public.is_internal_staff());

CREATE POLICY "Internal staff can create opportunities"
  ON public.opportunities FOR INSERT
  WITH CHECK (public.is_internal_staff());

CREATE POLICY "Internal staff can update opportunities"
  ON public.opportunities FOR UPDATE
  USING (public.is_internal_staff());

CREATE POLICY "Internal staff can delete opportunities"
  ON public.opportunities FOR DELETE
  USING (public.is_internal_staff());

-- (The "Referrers can view their own opportunities" policy from 20260511120000
--  remains in place and is OR'd with the staff SELECT above.)

-- ─────────────────────────────────────────────────────────────────────────────
-- accounts
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view accounts"   ON public.accounts;
DROP POLICY IF EXISTS "Authenticated users can create accounts" ON public.accounts;
DROP POLICY IF EXISTS "Authenticated users can update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Authenticated users can delete accounts" ON public.accounts;

CREATE POLICY "Internal staff can view accounts"
  ON public.accounts FOR SELECT
  USING (public.is_internal_staff());

CREATE POLICY "Internal staff can create accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (public.is_internal_staff());

CREATE POLICY "Internal staff can update accounts"
  ON public.accounts FOR UPDATE
  USING (public.is_internal_staff());

CREATE POLICY "Internal staff can delete accounts"
  ON public.accounts FOR DELETE
  USING (public.is_internal_staff());

-- ─────────────────────────────────────────────────────────────────────────────
-- applications — special-cased because the public /apply form needs anon INSERT
-- and referrers must be allowed to submit with their own referrer_id.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit applications"              ON public.applications;
DROP POLICY IF EXISTS "Authenticated users can view applications"   ON public.applications;
DROP POLICY IF EXISTS "Authenticated users can update applications" ON public.applications;
DROP POLICY IF EXISTS "Authenticated users can delete applications" ON public.applications;
DROP POLICY IF EXISTS "Referrers can submit applications"           ON public.applications;
-- Also drop the legacy-named policies from the older migration just in case
DROP POLICY IF EXISTS "Allow public to insert applications"         ON public.applications;
DROP POLICY IF EXISTS "Allow authenticated users to view applications"   ON public.applications;
DROP POLICY IF EXISTS "Allow authenticated users to update applications" ON public.applications;

-- Public form: anon users can submit, but cannot attribute to a referrer
CREATE POLICY "Public can submit anonymous applications"
  ON public.applications FOR INSERT
  WITH CHECK (auth.uid() IS NULL AND referrer_id IS NULL);

-- Authenticated submission: internal staff OR referrer with their own id
CREATE POLICY "Authenticated submission with valid attribution"
  ON public.applications FOR INSERT
  WITH CHECK (
    public.is_internal_staff()
    OR (
      public.is_referrer()
      AND referrer_id = public.current_referrer_id()
    )
  );

CREATE POLICY "Internal staff can view applications"
  ON public.applications FOR SELECT
  USING (public.is_internal_staff());

-- (Existing "Referrers can view their own applications" from 20260511120000 stays.)

CREATE POLICY "Internal staff can update applications"
  ON public.applications FOR UPDATE
  USING (public.is_internal_staff());

CREATE POLICY "Internal staff can delete applications"
  ON public.applications FOR DELETE
  USING (public.is_internal_staff());

-- ─────────────────────────────────────────────────────────────────────────────
-- merchants (table exists in newer schema 20260215014909)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchants') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view merchants"                      ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can create merchants"                    ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can update merchants"                    ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can delete merchants"                    ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can insert merchants"                    ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view all merchants"     ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view merchants"         ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can create merchants"       ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can update merchants"       ON public.merchants';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can delete merchants"       ON public.merchants';

    -- Re-create using helper. Note: keep INSERT open for service-role webhook flows;
    -- service role bypasses RLS so this is only about authenticated browser clients.
    EXECUTE $POL$
      CREATE POLICY "Internal staff can view merchants"
        ON public.merchants FOR SELECT
        USING (public.is_internal_staff())
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "Internal staff can create merchants"
        ON public.merchants FOR INSERT
        WITH CHECK (public.is_internal_staff())
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "Internal staff can update merchants"
        ON public.merchants FOR UPDATE
        USING (public.is_internal_staff())
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "Internal staff can delete merchants"
        ON public.merchants FOR DELETE
        USING (public.is_internal_staff())
    $POL$;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Re-create referrer_commission_records with security_invoker = on so RLS on the
-- underlying tables (commission_records, accounts, referrers) is enforced when a
-- referrer queries the view.
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.referrer_commission_records;

CREATE VIEW public.referrer_commission_records
WITH (security_invoker = on) AS
SELECT
  cr.id                        AS record_id,
  cr.period_id,
  cp.period_start,
  cp.period_end,
  cr.account_id,
  cr.company_name,
  cr.transaction_volume,
  cr.transaction_count,
  cr.total_commission          AS company_commission,
  a.referrer_id,
  r.commission_rate,
  r.monthly_cap_per_merchant,
  (cr.total_commission * r.commission_rate)                                    AS uncapped_payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0
      THEN LEAST(cr.total_commission * r.commission_rate, r.monthly_cap_per_merchant)
    ELSE cr.total_commission * r.commission_rate
  END                                                                          AS payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0
     AND (cr.total_commission * r.commission_rate) > r.monthly_cap_per_merchant
      THEN true
    ELSE false
  END                                                                          AS at_cap
FROM public.commission_records cr
JOIN public.accounts        a  ON a.id = cr.account_id
JOIN public.referrers       r  ON r.id = a.referrer_id
JOIN public.commission_periods cp ON cp.id = cr.period_id;

COMMENT ON VIEW public.referrer_commission_records IS 'Per-merchant per-period referrer payout with monthly cap applied. security_invoker = on so referrer RLS scopes results correctly.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the unused link_opportunity_to_referrer function. It was added as future-
-- proofing but was never wired up, and its SECURITY DEFINER nature means any
-- caller could re-attribute opportunities given a valid opportunity_id.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.link_opportunity_to_referrer(uuid, text);
