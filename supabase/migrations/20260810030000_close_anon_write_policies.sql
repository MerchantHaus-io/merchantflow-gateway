-- Close two anon-writable holes on call_logs and documents.
--
-- WHAT IS WRONG
--
-- Three PERMISSIVE policies use `true` as their qualifier while being granted
-- TO public. In Postgres, `TO public` covers every role including `anon`, so
-- these are satisfied by an unauthenticated request carrying nothing but the
-- anon key. PostgREST is directly callable, so the client UI is irrelevant —
-- RLS is the only boundary on this path.
--
--   call_logs  INSERT  "Service role can insert call logs"     WITH CHECK (true)
--   call_logs  UPDATE  "Service role can update call logs"     USING (true)
--   documents  INSERT  "Authenticated users can insert documents" WITH CHECK (true)
--
-- Two of them are named for the service role and one for authenticated users.
-- Neither name is what the policy does. That mismatch is almost certainly why
-- they survived review: the name reads as the intent, and nobody re-read the
-- grant.
--
-- WHY THE NAMES MATTER MORE THAN USUAL HERE
--
-- PERMISSIVE policies are OR'd together. call_logs already has correctly
-- gated INSERT and UPDATE policies checking `auth.uid() IS NOT NULL` — but a
-- second policy returning `true` does not merely sit alongside them, it
-- DEFEATS them. The gate was not missing; it was overridden by a policy that
-- looked like it was about something else entirely.
--
-- THE UPDATE HOLE IS DESTRUCTIVE, NOT JUST A WRITE
--
-- Reproduced on a scratch PostgreSQL 16.13 with these exact policies:
--
--   * anon INSERT into call_logs and documents both SUCCEEDED.
--   * anon `UPDATE call_logs SET ... WHERE note = '...'` affected 0 rows —
--     the WHERE clause has to read, and the SELECT policy hides every row.
--     That looks reassuring and is not.
--   * anon `UPDATE call_logs SET note = '...'` with NO WHERE clause
--     rewrote EVERY ROW IN THE TABLE. An unqualified UPDATE reads nothing,
--     so the SELECT policy never constrains it and USING (true) permits all
--     rows.
--
-- So the anon key can blank the call log. That is data destruction, not
-- merely unauthorised insertion, and it is why this is worth fixing ahead of
-- the wider RLS sweep in Phase 3A.
--
-- WHY DROPPING THE call_logs POLICIES LOSES NOTHING
--
-- `service_role` has rolbypassrls = true (verified against this database), so
-- it does not consult RLS at all. A policy written "for the service role" is
-- dead weight for the service role and live permission for everyone else.
-- Every edge function that writes these tables — quo-sync-calls, quo-webhook,
-- classify-document, purge-stale-documents — authenticates with
-- SUPABASE_SERVICE_ROLE_KEY, so all of them keep working untouched.
--
-- After the drop, call_logs still allows:
--   SELECT / INSERT / UPDATE  to signed-in users via `auth.uid() IS NOT NULL`
--   DELETE                    to staff via is_internal_staff()
--
-- WHY documents IS REPLACED RATHER THAN DROPPED
--
-- documents has exactly one INSERT policy, so dropping it would lock out the
-- real callers. It is replaced with the rule its own name already claims.
-- Verified no public route inserts documents: every caller
-- (DocumentUploadDialog, DocumentsTab, Documents, OpportunityDetail,
-- StatementAnalysis, PreboardingWizard, WebSubmissions, ApplicationProgress)
-- sits behind ProtectedRoute, and no public page references `documents` or
-- `storage.from` at all.
--
-- NOT CHANGED, DELIBERATELY
--
-- The remaining `TO public` policies on these tables already gate on
-- `auth.uid() IS NOT NULL`, so they are not holes. Rewriting them to
-- `TO authenticated` would be tidier but is a wider diff than this fix needs.
--
-- VERIFIED BEFORE COMMITTING
--
-- Rebuilt the two tables and all ten of their current policies on a scratch
-- PostgreSQL 16.13 (same major version as production), then:
--
--   * proved the holes are real BEFORE the change (see above), so the
--     after-state means something;
--   * applied this migration and confirmed anon INSERT is refused on both
--     tables and the unqualified anon UPDATE now affects 0 rows;
--   * confirmed a signed-in `authenticated` user can still INSERT and UPDATE
--     both tables;
--   * confirmed `service_role` still writes both tables with no policy
--     present at all — the direct proof that dropping the two call_logs
--     policies does not break the edge functions;
--   * applied it three times for idempotency.

BEGIN;

-- call_logs: remove the two overriding `true` policies.
DROP POLICY IF EXISTS "Service role can insert call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Service role can update call logs" ON public.call_logs;

-- documents: make the policy do what it is named.
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;

CREATE POLICY "Authenticated users can insert documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;

-- VERIFICATION — expect zero rows.
--
--   select tablename, policyname, cmd, array_to_string(roles, ',') as roles
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('call_logs', 'documents')
--      and (qual = 'true' or with_check = 'true');
--
-- Note this only proves the policy text changed. Whether it BITES must be
-- checked as a real signed-out caller — see the connector table in CLAUDE.md.
-- `query_database` bypasses RLS and will pass this check while proving nothing.
