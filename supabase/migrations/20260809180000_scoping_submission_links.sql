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
-- THE DECISION: assigned_to is text, not a uuid FK to auth.users
--
-- This schema has two live conventions for "who owns this row", and they
-- disagree:
--
--   * opportunities.assigned_to text  (20251204152441_...sql:3) and
--     tasks.assignee text — both hold a rep's email address, and the
--     notification triggers in 20260713001301_...sql look the owner up with
--     `SELECT ... FROM profiles WHERE email = NEW.assigned_to`.
--   * support_tickets.assigned_to uuid REFERENCES auth.users(id)
--     (20260521120000_support_triage_schema.sql:38) — a real FK, with
--     denormalised assigned_to_name / assigned_to_email alongside it.
--
-- The uuid FK is the stricter design and in isolation the better one. It is
-- deliberately NOT used here. A scoping submission is worked by the same
-- people, in the same breath, as the opportunity it turns into and the tasks
-- raised off it. Making this column text means an owner can be copied
-- straight between scoping_submissions, opportunities and tasks and compared
-- with a plain equality test; making it uuid would mean every one of those
-- hand-offs needs a join through auth.users, and the existing
-- email-keyed assignment-notification triggers could not be reused.
--
-- Consistency with the two tables this flow actually touches beat strictness
-- against a table it does not. If the support_tickets pattern later wins
-- across the schema, this column moves with opportunities.assigned_to and
-- tasks.assignee, not before them.
--
-- One deployment note on that FK: it is added as a normal validating
-- constraint, so if any existing scoping_submissions row already holds an
-- opportunity_id that is not in public.opportunities — which nothing has been
-- preventing until now — this ALTER fails and the whole migration rolls back.
-- That is the intended behaviour: an orphan should be seen and dealt with
-- explicitly, not hidden behind NOT VALID. Live data has not been inspected
-- from here; if it does fail, null the orphaned ids out and re-run.
--
-- The FK columns follow the loose-linkage convention used by quotes
-- (20260525120000_quotes_persistence.sql:16-18) and support_tickets
-- (20260521120000_support_triage_schema.sql:36-37): nullable, lowercase uuid,
-- ON DELETE SET NULL. A submission is an inbound record of something a
-- prospect sent us; deleting the CRM row it was later matched to must not
-- delete or block the submission itself.
--
-- first_response_at is not indexed. It is an SLA timestamp read per-row on a
-- submission that has already been located by status or owner, and the
-- equivalent stamps on support_tickets (claimed_at, closed_at) carry no index
-- either. Adding one here would be inventing a convention.
--
-- RLS IS NOT TOUCHED, AND THAT IS ITSELF A PROBLEM — SEE BELOW
--
-- The three policies on this table (20260805003336_...sql:102-109) are all
-- `USING (true)` with no column list, so the new columns are covered the
-- moment they exist. The existing GRANTs to authenticated and service_role
-- likewise apply per-table, not per-column. Nothing to change.
--
-- But `USING (true)` is the whole story: scoping_submissions never received
-- the is_internal_staff() lockdown that accounts, opportunities and merchants
-- were each given later the same day (20260805014901, 20260805015430,
-- 20260805020108). Any authenticated user — including a referrer on the
-- affiliate portal — can currently SELECT, UPDATE and DELETE every scoping
-- submission in the table, which contains full business profiles, processing
-- volumes and contact details for every prospect who has filled in the form.
--
-- That gap is real, it predates this migration, and it is deliberately NOT
-- fixed here. Tightening those policies is a behaviour change for anyone
-- currently reading the table and belongs to the RLS phase, on its own, where
-- it can be reviewed as a security change rather than smuggled in behind four
-- new columns. Recorded here so it is not lost.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- New columns. IF NOT EXISTS throughout so this is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scoping_submissions
  ADD COLUMN IF NOT EXISTS account_id        uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id        uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to       text,
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
COMMENT ON COLUMN public.scoping_submissions.assigned_to IS 'Rep who owns this submission, held as an email address. Deliberately text rather than a uuid FK to auth.users, to match opportunities.assigned_to and tasks.assignee — see this migration''s header.';
COMMENT ON COLUMN public.scoping_submissions.first_response_at IS 'When a human first responded to this submission. SLA measurement only; intentionally unindexed.';

COMMIT;
