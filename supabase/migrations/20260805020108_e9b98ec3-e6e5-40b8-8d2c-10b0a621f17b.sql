-- ============================================================
-- 1. Shared tenancy helpers
-- ============================================================

-- Signed-in internal staff member (i.e. not an external referral partner).
CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_referrer();
$$;

-- True when the given referrer_id belongs to the signed-in referral partner.
-- NULL-safe: a NULL column or a NULL current referrer never matches.
CREATE OR REPLACE FUNCTION public.referrer_owns(_referrer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _referrer_id IS NOT NULL
     AND _referrer_id = public.current_referrer_id();
$$;

-- True when the parent account of the given id belongs to the signed-in referrer.
CREATE OR REPLACE FUNCTION public.referrer_owns_account(_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _account_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.accounts a
        WHERE a.id = _account_id
          AND public.referrer_owns(a.referrer_id)
     );
$$;

REVOKE EXECUTE ON FUNCTION public.is_internal_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.referrer_owns(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.referrer_owns_account(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.referrer_owns(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.referrer_owns_account(uuid) TO authenticated, service_role;

-- ============================================================
-- 2. Staff policies -> is_internal_staff()
-- ============================================================
ALTER POLICY "Staff can view accounts"        ON public.accounts USING (public.is_internal_staff());
ALTER POLICY "Staff can create accounts"      ON public.accounts WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can update accounts"      ON public.accounts USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can delete accounts"      ON public.accounts USING (public.is_internal_staff());

ALTER POLICY "Staff can view merchants"       ON public.merchants USING (public.is_internal_staff());
ALTER POLICY "Staff can insert merchants"     ON public.merchants WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can update merchants"     ON public.merchants USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can delete merchants"     ON public.merchants USING (public.is_internal_staff());

ALTER POLICY "Staff can view opportunities"   ON public.opportunities USING (public.is_internal_staff());
ALTER POLICY "Staff can insert opportunities" ON public.opportunities WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can update opportunities" ON public.opportunities USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can delete opportunities" ON public.opportunities USING (public.is_internal_staff());

ALTER POLICY "Staff can view applications"    ON public.applications USING (public.is_internal_staff());
ALTER POLICY "Staff can delete applications"  ON public.applications USING (public.is_internal_staff());

ALTER POLICY "Staff can view principals"      ON public.principals USING (public.is_internal_staff());
ALTER POLICY "Staff can insert principals"    ON public.principals WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can update principals"    ON public.principals USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can delete principals"    ON public.principals USING (public.is_internal_staff());

ALTER POLICY "Staff can view beneficial owners"   ON public.beneficial_owners USING (public.is_internal_staff());
ALTER POLICY "Staff can create beneficial owners" ON public.beneficial_owners WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can update beneficial owners" ON public.beneficial_owners USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can delete beneficial owners" ON public.beneficial_owners USING (public.is_internal_staff());

ALTER POLICY "Staff can delete bank_accounts" ON public.bank_accounts USING (public.is_internal_staff());

ALTER POLICY "Staff manage quotes"            ON public.quotes USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff read quote acceptances"   ON public.quote_acceptances USING (public.is_internal_staff());
ALTER POLICY "Staff insert quote acceptances" ON public.quote_acceptances WITH CHECK (public.is_internal_staff());

ALTER POLICY "Staff manage support tickets"   ON public.support_tickets USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff manage support ticket comments" ON public.support_ticket_comments USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());

ALTER POLICY "Staff can delete documents"     ON public.documents USING (public.is_internal_staff());
ALTER POLICY "Staff can delete call logs"     ON public.call_logs USING (public.is_internal_staff());
ALTER POLICY "Staff can delete client interactions" ON public.client_interactions USING (public.is_internal_staff());
ALTER POLICY "Staff can delete campaigns"     ON public.outreach_campaigns USING (public.is_internal_staff());
ALTER POLICY "Staff can delete outreach contacts" ON public.outreach_contacts USING (public.is_internal_staff());
ALTER POLICY "Staff can delete validation reports" ON public.validation_reports USING (public.is_internal_staff());
ALTER POLICY "Staff can delete todos"         ON public.shared_todos USING (public.is_internal_staff());
ALTER POLICY "Staff can view sync logs"       ON public.commission_sync_logs USING (public.is_internal_staff());

ALTER POLICY "Staff can view boarding submissions"   ON public.nmi_boarding_submissions USING (public.is_internal_staff());
ALTER POLICY "Staff can create boarding submissions" ON public.nmi_boarding_submissions WITH CHECK (public.is_internal_staff());
ALTER POLICY "Staff can update boarding submissions" ON public.nmi_boarding_submissions USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());

ALTER POLICY "Team can read office avatars"   ON public.office_avatars USING (public.is_internal_staff());

-- ============================================================
-- 3. Referrer-scoped policies -> referrer_owns(); require sign-in
-- ============================================================
DROP POLICY IF EXISTS "Referrers can view their own accounts" ON public.accounts;
CREATE POLICY "Referrers can view their own accounts"
  ON public.accounts FOR SELECT TO authenticated
  USING (public.referrer_owns(referrer_id));

DROP POLICY IF EXISTS "Referrers can view their own merchants" ON public.merchants;
CREATE POLICY "Referrers can view their own merchants"
  ON public.merchants FOR SELECT TO authenticated
  USING (public.referrer_owns(referrer_id));

DROP POLICY IF EXISTS "Referrers can view their own opportunities" ON public.opportunities;
CREATE POLICY "Referrers can view their own opportunities"
  ON public.opportunities FOR SELECT TO authenticated
  USING (public.referrer_owns(referrer_id));

DROP POLICY IF EXISTS "Referrers can view their own applications" ON public.applications;
CREATE POLICY "Referrers can view their own applications"
  ON public.applications FOR SELECT TO authenticated
  USING (public.referrer_owns(referrer_id));

-- Public submissions go through the server-side function (service role), so the
-- wide-open insert path that allowed arbitrary referral attribution is removed.
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
DROP POLICY IF EXISTS "Referrers can submit applications" ON public.applications;
CREATE POLICY "Referrers can submit their own applications"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (public.referrer_owns(referrer_id));
CREATE POLICY "Staff can create applications"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_staff());

DROP POLICY IF EXISTS "Staff and own-referrer can update applications" ON public.applications;
CREATE POLICY "Staff and own-referrer can update applications"
  ON public.applications FOR UPDATE TO authenticated
  USING (public.is_internal_staff() OR public.referrer_owns(referrer_id))
  WITH CHECK (public.is_internal_staff() OR public.referrer_owns(referrer_id));

DROP POLICY IF EXISTS "Referrers can view their own commission records" ON public.commission_records;
CREATE POLICY "Referrers can view their own commission records"
  ON public.commission_records FOR SELECT TO authenticated
  USING (public.referrer_owns_account(account_id));

REVOKE INSERT, UPDATE, DELETE ON public.applications FROM anon;