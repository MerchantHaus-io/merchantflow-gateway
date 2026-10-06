-- ─────────────────────────────────────────────────────────────────────────────
-- 0003_storage.sql
-- Private document bucket. Objects are keyed "{org_id}/{case_id}/{file}" so the
-- first path segment IS the tenant boundary. Policies check that segment against
-- public.user_orgs() — the same isolation rule as the Postgres tables. Downloads
-- are served via short-lived signed URLs minted by the edge function; the bucket
-- is never public.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

-- Read: only members of the org that owns the first path segment.
create policy "case_docs_read_own_org"
  on storage.objects for select
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (select public.user_orgs())
  );

-- Insert: members may upload only under their own org's prefix.
create policy "case_docs_insert_own_org"
  on storage.objects for insert
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (select public.user_orgs())
  );

-- Update: same org constraint.
create policy "case_docs_update_own_org"
  on storage.objects for update
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (select public.user_orgs())
  )
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (select public.user_orgs())
  );

-- Delete: same org constraint.
create policy "case_docs_delete_own_org"
  on storage.objects for delete
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (select public.user_orgs())
  );
