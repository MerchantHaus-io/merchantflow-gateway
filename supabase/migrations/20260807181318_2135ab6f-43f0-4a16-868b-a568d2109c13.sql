BEGIN;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';

COMMIT;

BEGIN;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'::public.app_role
FROM auth.users u
WHERE (
        lower(u.email) LIKE '%@merchanthaus.io'
     OR lower(u.email) = ANY (ARRAY['darryn182@gmail.com'])
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.referrers r
        WHERE r.auth_user_id = u.id
           OR lower(r.email) = lower(u.email)
      )
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = ANY (ARRAY[
        'admin@merchanthaus.io',
        'onboarding@merchanthaus.io',
        'jamie@merchanthaus.io'
      ])
ON CONFLICT (user_id, role) DO NOTHING;

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
      'Seeding matched no auth.users. Verify the roster before re-running';
  END IF;

  RAISE NOTICE 'user_roles now holds % staff/admin row(s).', staff_count;
END $$;

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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'finance'::public.app_role
FROM auth.users u
WHERE lower(u.email) LIKE '%@merchanthaus.io'
  AND NOT EXISTS (
        SELECT 1 FROM public.referrers r
        WHERE r.auth_user_id = u.id
           OR lower(r.email) = lower(u.email)
      )
ON CONFLICT (user_id, role) DO NOTHING;

DO $$
DECLARE
  finance_count integer;
BEGIN
  SELECT count(*) INTO finance_count
  FROM public.user_roles
  WHERE role = 'finance'::public.app_role;

  IF finance_count = 0 THEN
    RAISE EXCEPTION
      'Refusing to tighten is_merchanthaus_staff(): user_roles has no finance rows. '
      'No @merchanthaus.io accounts matched. Verify the roster before re-running';
  END IF;

  RAISE NOTICE 'user_roles now holds % finance row(s).', finance_count;
END $$;

CREATE OR REPLACE FUNCTION public.is_merchanthaus_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'finance'::public.app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.is_internal_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_merchanthaus_staff() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_merchanthaus_staff() TO authenticated, service_role;

COMMIT;