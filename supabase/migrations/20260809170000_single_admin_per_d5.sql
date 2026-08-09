-- Reduce the admin role to the one account that should hold it (decision D5).
--
-- THE PROBLEM
--
-- 20260807180000_staff_gate_via_user_roles.sql seeded three admins —
-- admin@, onboarding@ and jamie@merchanthaus.io — from the hardcoded
-- ADMIN_EMAILS arrays that were scattered across the edge functions at the
-- time. A live count on 2026-08-09 returned FOUR admin rows, so a fourth came
-- from somewhere else again: either the original 2025-12-08 migration or a
-- manual insert.
--
-- D5 says admin@merchanthaus.io is the only real admin. is_admin() is now
-- live and gates admin surfaces, so three accounts currently pass a check
-- they should not.
--
-- WHAT THIS DOES NOT DO
--
-- Revoking 'admin' does not remove anyone from the CRM. The staff and finance
-- roles are untouched, so all three keep opportunities, accounts, contacts,
-- documents and commission_records. They lose admin-only surfaces, which is
-- exactly the intent.
--
-- SAFETY
--
-- The delete is expressed as "everyone except admin@merchanthaus.io" rather
-- than a list of the three, so it is correct whoever the mystery fourth row
-- belongs to. The guard then refuses to commit if that emptied the admin set —
-- which is what would happen if admin@merchanthaus.io has no auth.users row
-- yet, or never received the role. Same pattern as the migration that created
-- this situation.
--
-- Run the identify query first if you want to know who is losing it:
--
--   SELECT u.email, ur.created_at
--     FROM public.user_roles ur
--     JOIN auth.users u ON u.id = ur.user_id
--    WHERE ur.role = 'admin'
--    ORDER BY u.email;

BEGIN;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id
  AND ur.role = 'admin'::public.app_role
  AND lower(u.email) <> 'admin@merchanthaus.io';

DO $$
DECLARE
  admin_count integer;
BEGIN
  SELECT count(*) INTO admin_count
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role;

  IF admin_count = 0 THEN
    RAISE EXCEPTION
      'Refusing to leave zero admins. admin@merchanthaus.io holds no admin row — '
      'grant it first, then re-run. Nothing has been changed.';
  END IF;

  RAISE NOTICE 'admin rows remaining: %', admin_count;
END $$;

COMMIT;
