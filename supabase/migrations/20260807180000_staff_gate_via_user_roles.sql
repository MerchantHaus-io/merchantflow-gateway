-- Back the "internal staff" gate with user_roles instead of "any signed-in
-- user who isn't a referral partner".
--
-- THE PROBLEM
--
-- is_internal_staff() is currently:
--
--   SELECT auth.uid() IS NOT NULL AND NOT public.is_referrer();
--
-- Every "Staff can ..." policy on opportunities, accounts, contacts and
-- documents is built on that. So the real rule today is "any authenticated
-- user without a referrers row has full read/write on the CRM".
--
-- The only thing actually restricting staff access is isEmailAllowed() in
-- src/types/opportunity.ts, which runs in the browser. Google sign-in is not
-- restricted server-side (the `hd` parameter is a UI hint, not enforcement),
-- so any Google account that completes OAuth and has no referrers row
-- currently satisfies is_internal_staff().
--
-- THE FIX
--
-- public.user_roles and public.has_role() already exist (2025-12-08) and are
-- correctly SECURITY DEFINER with a pinned search_path. They were simply never
-- wired into the staff gate. This migration seeds that table and switches the
-- gate over to it.
--
-- ORDERING IS LOAD-BEARING
--
-- Seeding happens BEFORE is_internal_staff() is redefined, in a single
-- transaction. Reversing these two steps — or shipping the redefinition
-- without the seed — locks every staff member out of the CRM instantly.

BEGIN;

-- 1. 'staff' joins the existing ('admin','user') enum. Additive only, so
--    existing rows and has_role() calls are unaffected.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

COMMIT;

-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- references the new value, so the seed and swap run in a second transaction.
BEGIN;

-- 2. Seed user_roles from the same rule the client currently applies:
--    anyone on the merchanthaus.io domain, plus individually-approved
--    addresses. Mirrors isEmailAllowed() in src/types/opportunity.ts.
--
--    Derived from auth.users rather than a hardcoded id list so it stays
--    correct whatever the current roster is. Idempotent via the existing
--    UNIQUE (user_id, role) constraint.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'::public.app_role
FROM auth.users u
WHERE (
        lower(u.email) LIKE '%@merchanthaus.io'
     OR lower(u.email) = ANY (ARRAY['darryn182@gmail.com'])
      )
  -- Never grant staff to an account that is a referral partner.
  AND NOT EXISTS (
        SELECT 1 FROM public.referrers r
        WHERE r.auth_user_id = u.id
           OR lower(r.email) = lower(u.email)
      )
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Keep the three known admins as admins too, so admin-only surfaces keep
--    working once they stop reading hardcoded ADMIN_EMAILS arrays.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = ANY (ARRAY[
        'admin@merchanthaus.io',
        'onboarding@merchanthaus.io',
        'jamie@merchanthaus.io'
      ])
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Fail loudly rather than lock the team out. If the seed matched nobody,
--    the redefinition below would deny every staff member, so abort instead.
DO $$
DECLARE
  staff_count integer;
BEGIN
  SELECT count(*) INTO staff_count
  FROM public.user_roles
  WHERE role IN ('staff'::public.app_role, 'admin'::public.app_role);

  IF staff_count = 0 THEN
    RAISE EXCEPTION
      'Refusing to tighten is_internal_staff(): user_roles has no staff or admin rows. '
      'Seeding matched no auth.users. Verify the roster before re-running.';
  END IF;

  RAISE NOTICE 'user_roles now holds % staff/admin row(s).', staff_count;
END $$;

-- 5. Swap the gate. Membership in user_roles is now required; being merely
--    authenticated-and-not-a-referrer is no longer sufficient.
CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT public.is_referrer()
     AND EXISTS (
           SELECT 1
           FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
             AND ur.role IN ('staff'::public.app_role, 'admin'::public.app_role)
         );
$$;

-- Admin check for policies and edge functions, replacing the hardcoded
-- ADMIN_EMAILS arrays duplicated across several functions.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- 6. Consolidate the second, competing staff gate.
--
--    is_merchanthaus_staff() (2026-07-14) independently checks
--    `auth.users.email LIKE '%@merchanthaus.io'` and guards commission_records
--    — which holds partner cost and margin figures. Two gates that can
--    disagree is exactly the problem this migration exists to remove, so it
--    now delegates rather than carrying its own rule.
--
--    REVIEWER NOTE — this is a deliberate behaviour change. The email rule and
--    the seeded roster are not quite identical: addresses in
--    EXTRA_ALLOWED_EMAILS (currently darryn182@gmail.com) are seeded as staff
--    and so gain access to commission_records, which the '%@merchanthaus.io'
--    test excluded. If cost/margin data should stay domain-restricted, drop
--    this step and leave is_merchanthaus_staff() defined as it was.
CREATE OR REPLACE FUNCTION public.is_merchanthaus_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_internal_staff();
$$;

REVOKE EXECUTE ON FUNCTION public.is_internal_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_merchanthaus_staff() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_merchanthaus_staff() TO authenticated, service_role;

COMMIT;
