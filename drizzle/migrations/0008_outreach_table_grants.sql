-- Tighten table privileges on the five outreach tables created before 0006.
--
-- Verified in production on 25 Nov 2026 (read-only) before writing this:
--   * production is PostgreSQL 17.6. All five tables below are owned by postgres.
--   * anon, authenticated and service_role each hold arwdDxtm, which on PG17 is eight
--     privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
--     MAINTAIN), on public.cadence_steps, public.outreach_campaigns,
--     public.outreach_contacts, public.outreach_enrollments and public.outreach_touches.
--     anon and authenticated are members of no roles. They are inherited from
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     (tables: anon/authenticated/service_role = arwdDxtm). 0001 only GRANTed, and the
--     20260302* Lovable migrations never granted or revoked anything.
--     public.outreach_suppressions (0006) is already correct and is not touched.
--   * Rows at time of writing: 1 campaign, 32 contacts, 32 enrolments, 384 touches,
--     0 cadence_steps. This migration changes privileges only, no data.
--   * No RPC callable by anon/authenticated runs TRUNCATE or dynamic SQL, so TRUNCATE
--     is not reachable through PostgREST today. This closes a latent privilege (any
--     future SQL path running as those roles), not a demonstrated exploit.
--
-- Grant rationale:
--   * authenticated gets back SELECT, INSERT, UPDATE, DELETE: exactly the verbs its RLS
--     policies already allow (cadence_steps/enrollments/touches FOR ALL TO authenticated;
--     campaigns/contacts SELECT/INSERT/UPDATE to public gated on auth.uid() IS NOT NULL,
--     DELETE staff-only). Code uses a subset (client + user-JWT edge functions
--     outreach-execute/outreach-ai insert contacts and enrollments, update
--     contacts/enrollments/touches, insert+delete campaigns); narrowing DML below the
--     policies is deliberately left out of this migration. cadence_steps is in the
--     realtime publication, so it keeps SELECT.
--   * anon gets nothing: every policy requires auth.uid() or TO authenticated, and no
--     anon path reaches these tables.
--   * service_role is not touched (edge functions send-outreach-emails,
--     process-scheduled-campaigns, resend-outreach-webhook, backup-snapshot-to-drive,
--     and the outreach-ai admin client).
-- Idempotent: REVOKE, GRANT and ALTER DEFAULT PRIVILEGES are all safe to re-run.

REVOKE ALL ON public.cadence_steps, public.outreach_campaigns, public.outreach_contacts, public.outreach_enrollments, public.outreach_touches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadence_steps, public.outreach_campaigns, public.outreach_contacts, public.outreach_enrollments, public.outreach_touches TO authenticated;

-- Default privileges: this affects only tables created *in future* by role postgres in
-- schema public, which is who runs these migrations (verified current_user=postgres,
-- not superuser; postgres may always alter its own defaults). It does not touch
-- existing objects, sequences, functions, service_role, or supabase_admin's separate
-- defaults (postgres cannot alter those). No client path uses TRUNCATE, REFERENCES,
-- TRIGGER or MAINTAIN (VACUUM/ANALYZE/REINDEX/CLUSTER/LOCK TABLE/REFRESH MATERIALIZED
-- VIEW); PostgREST cannot issue any of them, so new Lovable tables keep working via
-- their SELECT/INSERT/UPDATE/DELETE defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;

DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cadence_steps','outreach_campaigns','outreach_contacts','outreach_enrollments','outreach_touches'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege('anon', ('public.'||t)::regclass, p) THEN
        RAISE EXCEPTION 'Grant verification failed: anon holds % on public.%', p, t;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege('authenticated', ('public.'||t)::regclass, p) THEN
        RAISE EXCEPTION 'Grant verification failed: authenticated holds % on public.%', p, t;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('authenticated', ('public.'||t)::regclass, p) THEN
        RAISE EXCEPTION 'Grant verification failed: authenticated lacks % on public.%', p, t;
      END IF;
      IF NOT has_table_privilege('service_role', ('public.'||t)::regclass, p) THEN
        RAISE EXCEPTION 'Grant verification failed: service_role lacks % on public.%', p, t;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
             WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='r'
               AND a.grantee IN ('anon'::regrole,'authenticated'::regrole)
               AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')) THEN
    RAISE EXCEPTION 'Default privilege verification failed: postgres defaults in public still grant TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon or authenticated';
  END IF;
END $$;
