-- Move `must_change_password` out of user-writable metadata (audit item #46).
--
-- THE PROBLEM
--
-- The forced-password-reset flag lived in auth.users.raw_user_meta_data, which
-- surfaces as `user_metadata`. A user can write their own user_metadata from
-- the browser:
--
--   supabase.auth.updateUser({ data: { must_change_password: false } })
--
-- So anyone subject to a forced reset could clear their own flag and skip it
-- entirely — the control was advisory, not enforced.
--
-- THE FIX
--
-- raw_app_meta_data (`app_metadata`) is readable by the client but writable
-- only by the service role, so it is the correct home for a flag the user
-- must not control. This migration backfills the existing flags; the
-- application changes ship alongside it:
--
--   - create-team-user / create-referrer-user / force-password-reset now set
--     the flag in app_metadata
--   - AuthContext reads app_metadata first, falling back to user_metadata so
--     accounts flagged before this migration are not stranded
--   - the new complete-password-change edge function clears it, keyed off the
--     caller's own JWT, because the browser can no longer clear it directly
--
-- The user_metadata copy is kept in step rather than deleted: a client running
-- older JS still reads it, and a stale `true` there would otherwise trap a
-- user on the change-password screen forever.

BEGIN;

-- Backfill: every account currently flagged in user_metadata gets the same
-- flag in app_metadata. Idempotent — re-running is a no-op.
UPDATE auth.users
SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('must_change_password', true)
WHERE COALESCE(raw_user_meta_data ->> 'must_change_password', 'false') = 'true'
  AND COALESCE(raw_app_meta_data ->> 'must_change_password', 'false') <> 'true';

DO $$
DECLARE
  flagged integer;
BEGIN
  SELECT count(*) INTO flagged
  FROM auth.users
  WHERE COALESCE(raw_app_meta_data ->> 'must_change_password', 'false') = 'true';

  RAISE NOTICE 'must_change_password now set in app_metadata for % account(s).', flagged;
END $$;

COMMIT;

-- FOLLOW-UP (not automated here, because it is only safe once every client has
-- picked up the new JS): clear the legacy user_metadata copy, at which point
-- the fallback in AuthContext can be deleted too.
--
--   UPDATE auth.users
--   SET raw_user_meta_data = raw_user_meta_data - 'must_change_password'
--   WHERE raw_user_meta_data ? 'must_change_password';
