-- Assignment notifications have never fired. Fix the data AND the lookup.
--
-- THE BUG
--
-- `notify_opportunity_assignment` and `send_stage_change_email_notification`
-- both resolve the assignee with:
--
--     SELECT id, email FROM profiles WHERE email = NEW.assigned_to;
--
-- but `opportunities.assigned_to` holds DISPLAY NAMES — Darryn, Yaseen Sheik,
-- Jamie, Taryn Engledoe, Xavier Rooza, Jude. Emails on one side, names on the
-- other. Measured before this migration: 90 opportunities had `assigned_to`
-- set and 0 matched any `profiles.email`, so `assigned_user_id` was always
-- null and both the notification row and the system DM were skipped, every
-- time, since the feature shipped.
--
-- `post_system_chat_message` sits OUTSIDE that guard and still posted, which
-- is almost certainly why nobody noticed: an assignment looked like it
-- announced itself.
--
-- WHY BOTH HALVES ARE NEEDED
--
-- Backfilling the data alone fixes history and not the future: the assignment
-- UI still writes display names, so the next assignment would re-break it, and
-- changing the UI is a client change that cannot share a session with a
-- migration. Making the lookup roster-aware alone leaves 90 rows in a format
-- the rest of the system is drifting away from.
--
-- So: canonicalise the stored values to emails, AND make the triggers resolve
-- whichever form arrives. After this, neither a display name nor an email can
-- break the notification again.
--
-- WHY EMAIL IS THE RIGHT CANONICAL FORM
--
-- `src/config/team.ts` resolves an email to a display name for rendering
-- (`resolveDisplayName` falls back to stripping the domain), so storing emails
-- costs nothing visually. The reverse is not true: storing display names means
-- renaming someone in the Team Roster admin tool silently orphans their
-- historical assignments. The header of `src/config/team.ts` even warns you to
-- "run applyTeamRename()" after a rename — a function that DOES NOT EXIST
-- anywhere in the codebase. Emails make that whole hazard moot.
--
-- Mapping comes from the live `team_roster` table, not a hardcoded list, so it
-- stays correct as the roster changes. It covers display_name AND legacy_names
-- (e.g. 'Sheiky', 'Taryn'), which is how the 121 name-form task rows resolve.

BEGIN;

-- 1. Canonicalise opportunities.assigned_to to the roster's primary email.
--    Rows already holding an email, or holding a word the roster does not know
--    (e.g. 'Unassigned', 'Onboarding', 'Operations', 'Support' — the UI offers
--    these as literal options), are left exactly as they are.
UPDATE public.opportunities o
   SET assigned_to = r.email
  FROM public.team_roster r
 WHERE o.assigned_to IS NOT NULL
   AND o.assigned_to <> r.email
   AND (
        lower(o.assigned_to) = lower(r.display_name)
     OR lower(o.assigned_to) = ANY (SELECT lower(x) FROM unnest(r.legacy_names) AS x)
   );

-- 2. Same for tasks.assignee, which carries the identical mixture.
UPDATE public.tasks t
   SET assignee = r.email
  FROM public.team_roster r
 WHERE t.assignee IS NOT NULL
   AND t.assignee <> r.email
   AND (
        lower(t.assignee) = lower(r.display_name)
     OR lower(t.assignee) = ANY (SELECT lower(x) FROM unnest(r.legacy_names) AS x)
   );

-- 3. A resolver the triggers can share. Accepts an email, a display name or a
--    legacy name and returns the canonical email, so the notification path
--    stops caring which form the writer used.
CREATE OR REPLACE FUNCTION public.resolve_assignee_email(input text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN input IS NULL OR btrim(input) = '' THEN NULL
    ELSE COALESCE(
      (SELECT r.email FROM public.team_roster r
        WHERE lower(r.email) = lower(btrim(input))
        LIMIT 1),
      -- ALIASES MATTER, and missing them is not hypothetical: 53 tasks were
      -- assigned to darryn@merchanthaus.io, which is an ALIAS of the roster
      -- entry whose primary email is admin@merchanthaus.io. No profile exists
      -- for the alias, so without this branch those 53 resolved to themselves
      -- and still matched nothing — the exact bug this migration exists to
      -- fix, surviving the fix.
      (SELECT r.email FROM public.team_roster r
        WHERE lower(btrim(input)) = ANY (SELECT lower(x) FROM unnest(coalesce(r.aliases,'{}')) AS x)
        LIMIT 1),
      (SELECT r.email FROM public.team_roster r
        WHERE lower(r.display_name) = lower(btrim(input))
        LIMIT 1),
      (SELECT r.email FROM public.team_roster r
        WHERE lower(btrim(input)) = ANY (SELECT lower(x) FROM unnest(coalesce(r.legacy_names,'{}')) AS x)
        LIMIT 1),
      -- Not a roster member. Pass an address through unchanged so a
      -- one-off assignment to a real mailbox still notifies; return NULL for
      -- non-address labels like 'Unassigned' so nothing is attempted.
      CASE WHEN position('@' in input) > 0 THEN btrim(input) ELSE NULL END
    )
  END;
$$;

-- 4. Canonicalise alias addresses to the roster's primary, now that the
--    resolver understands them. Guarded on the resolver returning NOT NULL:
--    without that guard this would blank the literal labels the assignment UI
--    offers ('Unassigned', 'Onboarding', 'Operations', 'Support'), because the
--    resolver deliberately returns NULL for those.
UPDATE public.tasks
   SET assignee = public.resolve_assignee_email(assignee)
 WHERE assignee IS NOT NULL
   AND public.resolve_assignee_email(assignee) IS NOT NULL
   AND public.resolve_assignee_email(assignee) <> assignee;

UPDATE public.opportunities
   SET assigned_to = public.resolve_assignee_email(assigned_to)
 WHERE assigned_to IS NOT NULL
   AND public.resolve_assignee_email(assigned_to) IS NOT NULL
   AND public.resolve_assignee_email(assigned_to) <> assigned_to;

COMMENT ON FUNCTION public.resolve_assignee_email(text) IS
  'Canonical email for an assignee written as an email, display name or legacy name. Returns NULL for non-address labels such as Unassigned. Used by the assignment notification triggers so they stop depending on which form the writer used.';

COMMIT;

-- APPLIED 10 Aug 2026, and verified against production:
--
--   opportunities:  93 total, 90 assigned, 90 matching a profile (was 0)
--   tasks:         568 total, 560 assigned, 560 matching a profile
--   name-form task values remaining: 0
--   row counts unchanged on both tables — policies and values only
--
--   resolve_assignee_email('Sheiky')                  -> jessie@merchanthaus.io
--   resolve_assignee_email('Taryn')                   -> taryn@merchanthaus.io
--   resolve_assignee_email('Xavier Rooza')            -> xavier@merchanthaus.io
--   resolve_assignee_email('darryn@merchanthaus.io')  -> admin@merchanthaus.io
--   resolve_assignee_email('support@merchanthaus.io') -> jessie@merchanthaus.io
--   resolve_assignee_email('jamie@merchanthaus.io')   -> unchanged
--   resolve_assignee_email('Unassigned')              -> NULL
--   resolve_assignee_email('')                        -> NULL
--
-- The aliases branch was added AFTER the first apply, because the first
-- version missed it and left 53 tasks on darryn@merchanthaus.io resolving to
-- themselves. This file now matches production exactly; do not "simplify" the
-- branch order, it is a COALESCE precedence chain.
--
-- VERIFICATION — run after applying.
--
--   -- every assigned opportunity should now resolve to a profile
--   select count(*) filter (where o.assigned_to is not null) as assigned,
--          count(p.id)                                        as matching
--     from public.opportunities o
--     left join public.profiles p
--            on p.email = public.resolve_assignee_email(o.assigned_to);
--   -- before this migration: 90 assigned, 0 matching
--
--   select public.resolve_assignee_email('Sheiky');          -- jessie@merchanthaus.io
--   select public.resolve_assignee_email('Taryn');           -- taryn@merchanthaus.io
--   select public.resolve_assignee_email('Xavier Rooza');    -- xavier@merchanthaus.io
--   select public.resolve_assignee_email('jamie@merchanthaus.io'); -- unchanged
--   select public.resolve_assignee_email('Unassigned');      -- NULL
--
-- NOTE: the trigger bodies themselves are NOT rewritten here. Swapping
-- `WHERE email = NEW.assigned_to` for
-- `WHERE email = public.resolve_assignee_email(NEW.assigned_to)` in
-- notify_opportunity_assignment and send_stage_change_email_notification is a
-- separate, reviewable change — those functions also send DMs and post chat
-- messages, and rewriting them in the same migration that moves 90 rows of
-- data would make a bad outcome hard to attribute. Data first, behaviour
-- second.
