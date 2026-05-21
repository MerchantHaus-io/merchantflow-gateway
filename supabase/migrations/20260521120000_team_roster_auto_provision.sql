-- Auto-provision team_roster entries for new internal users.
--
-- Problem: when a new @merchanthaus.io teammate signs in for the first time they
-- get a `profiles` row, but `team_roster` — the single source of every
-- assignment dropdown, leaderboard and calendar column — is only manually
-- curated. So the new teammate stays invisible in those surfaces until an admin
-- adds them by hand.
--
-- Fix: a trigger that mirrors every new internal auth user into team_roster with
-- sensible defaults. External referrers (non-merchanthaus.io emails, or users
-- tagged role=referrer by the create-referrer-user function) are intentionally
-- skipped — they are referral partners, not CRM staff.

CREATE OR REPLACE FUNCTION public.provision_team_roster_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  -- Only internal staff belong in the team roster.
  IF NEW.email IS NULL OR lower(NEW.email) NOT LIKE '%@merchanthaus.io' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.raw_user_meta_data ->> 'role', '') = 'referrer' THEN
    RETURN NEW;
  END IF;

  -- Skip if this email is already represented (as a primary email or an alias
  -- of a manually-curated roster entry).
  IF EXISTS (
    SELECT 1 FROM public.team_roster tr
    WHERE lower(tr.email) = lower(NEW.email)
       OR EXISTS (SELECT 1 FROM unnest(tr.aliases) a WHERE lower(a) = lower(NEW.email))
  ) THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''),
    initcap(split_part(NEW.email, '@', 1))
  );

  INSERT INTO public.team_roster (id, email, display_name, title, active, color_token, sort_order)
  VALUES (NEW.id::text, lower(NEW.email), v_name, 'Team Member', true, 'border-border', 100)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_team_roster ON auth.users;
CREATE TRIGGER on_auth_user_created_team_roster
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_team_roster_member();

-- Backfill: existing internal users that signed in before this trigger existed.
INSERT INTO public.team_roster (id, email, display_name, title, active, color_token, sort_order)
SELECT
  p.id::text,
  lower(p.email),
  COALESCE(NULLIF(trim(p.full_name), ''), initcap(split_part(p.email, '@', 1))),
  'Team Member',
  true,
  'border-border',
  100
FROM public.profiles p
WHERE p.email IS NOT NULL
  AND lower(p.email) LIKE '%@merchanthaus.io'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_roster tr
    WHERE lower(tr.email) = lower(p.email)
       OR EXISTS (SELECT 1 FROM unnest(tr.aliases) a WHERE lower(a) = lower(p.email))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.referrers r WHERE r.auth_user_id = p.id
  )
ON CONFLICT (id) DO NOTHING;
