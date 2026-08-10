-- Wire public.scoping_submissions into the CRM: account/contact/owner links,
-- a first-response SLA stamp, and the foreign key + indexes the table has been
-- missing since it was created.
--
-- WHAT WAS ACTUALLY THERE
--
-- scoping_submissions was created whole in
-- 20260805003336_585bbe7a-a96a-44f6-96a2-10fad4f7f15a.sql and no later
-- migration has touched it. Its "Meta" block ends with:
--
--   opportunity_id uuid,
--
-- That is a bare uuid. No REFERENCES clause, no index. Nothing stops a
-- submission pointing at an opportunity id that does not exist, or at one that
-- was deleted last month, and every "show me the submissions for this deal"
-- lookup is a sequential scan of the whole table.
--
-- So opportunity_id is NOT added here — it already exists. What is added is
-- the constraint and the index that should have come with it.
--
-- The genuinely new columns are account_id, contact_id, assigned_to and
-- first_response_at. Today a submission can only ever be joined to the CRM
-- through the opportunity, which means a prospect who fills in the scoping
-- form before a deal record exists cannot be attached to their account or
-- contact at all, and nobody owns the submission until someone remembers it.
--
-- THE DECISION: assigned_to is uuid, and this file was CORRECTED to match
--
-- This migration originally declared `assigned_to text`, holding a rep email,
-- to match opportunities.assigned_to and tasks.assignee — the two tables this
-- flow hands off to.
--
-- That is not what shipped. A separate migration,
-- 20260809230014_376d0a03-950e-4756-baf3-eb0dd9d0531c.sql, was authored and
-- applied instead, declaring `assigned_to uuid REFERENCES auth.users(id)`. A
-- live read of information_schema.columns confirms the production type is
-- uuid. This file never ran.
--
-- Left uncorrected, that would have been an environment divergence rather than
-- a cosmetic mismatch. Both files use ADD COLUMN IF NOT EXISTS, and migrations
-- apply in filename order — 180000 before 230014 — so a FRESH database would
-- have taken `text` from this file and then silently no-opped the uuid clause
-- in the other. Production uuid, every new environment text, and nothing
-- anywhere would have errored.
--
-- So this file now declares uuid, matching production. On a fresh database the
-- two files agree; on production this one is a no-op.
--
-- THE TRAP THIS LEAVES FOR 2A-FUNCTION
--
-- uuid is defensible on its own terms — it is a real foreign key, it cannot
-- hold a typo'd address, and it revokes when the account does. support_tickets
-- already does exactly this. But it does NOT match the handoff targets:
--
--   * opportunities.assigned_to  text  (20251204152441_...sql:3) — an email
--   * tasks.assignee             text  (20251212223657_...sql:6) — an email
--
-- and the opportunity notification triggers do
-- `SELECT ... FROM profiles WHERE email = NEW.assigned_to`.
--
-- So a submission carries a uuid while the opportunity and task it creates
-- carry emails. 2A-function MUST convert at that boundary — read profiles to
-- resolve uuid -> email when it writes the opportunity and the task. Writing
-- the uuid straight through will produce an opportunity nobody is notified
-- about, and it will fail silently, because both columns are text and a uuid
-- string is a perfectly valid text value.
--
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- New columns. IF NOT EXISTS throughout so this is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scoping_submissions
  ADD COLUMN IF NOT EXISTS account_id        uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id        uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- The pre-existing opportunity_id gets the foreign key it never had.
-- ADD CONSTRAINT has no IF NOT EXISTS, so check pg_constraint first.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scoping_submissions_opportunity_id_fkey'
      AND conrelid = 'public.scoping_submissions'::regclass
  ) THEN
    ALTER TABLE public.scoping_submissions
      ADD CONSTRAINT scoping_submissions_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes — idx_<table>_<col>, matching
-- 20260521120000_support_triage_schema.sql:48-53.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_opportunity_id ON public.scoping_submissions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_account_id     ON public.scoping_submissions(account_id);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_contact_id     ON public.scoping_submissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_assigned_to    ON public.scoping_submissions(assigned_to);

COMMENT ON COLUMN public.scoping_submissions.account_id IS 'Optional link to the CRM account this submission was matched to. Nullable: the form is public and the account may not exist yet.';
COMMENT ON COLUMN public.scoping_submissions.contact_id IS 'Optional link to the CRM contact this submission was matched to. Nullable for the same reason as account_id.';
COMMENT ON COLUMN public.scoping_submissions.assigned_to IS 'Rep who owns this submission, as a uuid FK to auth.users — matching support_tickets.assigned_to. NOTE: opportunities.assigned_to and tasks.assignee are TEXT holding an email, so 2A-function must convert via profiles at the boundary. See this migration''s header.';
COMMENT ON COLUMN public.scoping_submissions.first_response_at IS 'When a human first responded to this submission. SLA measurement only; intentionally unindexed.';

COMMIT;
