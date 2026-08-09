-- Restrict the admin role to the two accounts that should hold it.
--
-- WHAT WAS ACTUALLY THERE
--
-- A live read of public.user_roles on 2026-08-09 returned four admin rows:
--
--   admin@merchanthaus.io      2026-08-07 18:02:51
--   darryn@merchanthaus.io     2026-08-07 18:02:51
--   support@merchanthaus.io    2026-08-07 18:02:51
--   jamie@merchanthaus.io      2026-08-07 18:13:18
--
-- That is NOT the set 20260807180000_staff_gate_via_user_roles.sql seeds. Its
-- step 3 grants admin to admin@, onboarding@ and jamie@. The timestamps
-- suggest what happened: three rows were granted at 18:02:51 by something
-- else, then the migration ran ten minutes later and added only jamie@ —
-- admin@ already existed and hit ON CONFLICT DO NOTHING, and onboarding@
-- produced no row at all because it has no auth.users record (that address has
-- never signed in).
--
-- Worth remembering the next time a seed "did not work": ON CONFLICT DO
-- NOTHING and a missing auth.users row look identical afterwards.
--
-- THE DECISION
--
-- D5 originally said admin@merchanthaus.io was the only real admin. Once the
-- actual list was visible that was refined: admin@ is the shared admin
-- account, and darryn@ is the operator's own login. Revoking the latter would
-- have locked the operator out of admin surfaces until they signed in as the
-- shared account. Both keep it.
--
-- support@ is a shared inbox and jamie@ is covered by staff.
--
-- WHAT THIS DOES NOT DO
--
-- Revoking 'admin' removes nobody from the CRM. staff and finance are
-- untouched, so both revoked accounts keep opportunities, accounts, contacts,
-- documents and commission_records. They lose admin-only surfaces, which is
-- the entire intent.
--
-- SAFETY
--
-- Expressed as "everyone not in the allow-list" rather than "these two
-- addresses", so it stays correct if another admin row appears before this is
-- applied. The guard then refuses to commit if the delete emptied the admin
-- set — the same pattern as the migration that created the situation.

BEGIN;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id
  AND ur.role = 'admin'::public.app_role
  AND lower(u.email) <> ALL (ARRAY[
        'admin@merchanthaus.io',
        'darryn@merchanthaus.io'
      ]);

DO $$
DECLARE
  admin_count integer;
BEGIN
  SELECT count(*) INTO admin_count
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role;

  IF admin_count = 0 THEN
    RAISE EXCEPTION
      'Refusing to leave zero admins. Neither admin@merchanthaus.io nor '
      'darryn@merchanthaus.io holds an admin row — grant one first, then '
      're-run. Nothing has been changed.';
  END IF;

  RAISE NOTICE 'admin rows remaining: %', admin_count;
END $$;

COMMIT;
