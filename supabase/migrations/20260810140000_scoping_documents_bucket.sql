-- Scoping confirmation PDFs: a private bucket an anonymous submitter can write
-- to, and nothing else.
--
-- WHY THIS EXISTS
--
-- Phase 2A decision 3: the browser generates the merchant's answers PDF with
-- jsPDF at submit time and uploads it; `send-scoping-confirmation` then
-- attaches the stored object. That needs somewhere for an ANONYMOUS submitter
-- to put a file, and none of the existing buckets allow it — `avatars` is
-- public-read but not anon-write, `chat-attachments` and
-- `opportunity-documents` are private and staff-only.
--
-- WHY AN ANON WRITE IS ACCEPTABLE HERE, HAVING JUST REMOVED TWO
--
-- Migration 20260810030000 closed anon INSERT on `call_logs` and `documents`.
-- Granting a new one needs justifying rather than waving through, so this is
-- deliberately the narrowest possible version:
--
--   * A DEDICATED bucket. The grant cannot reach any other bucket's objects.
--   * PRIVATE. `public = false`, so nothing is readable without a signed URL
--     — a merchant cannot enumerate or read anyone else's PDF, including
--     their own after upload.
--   * INSERT ONLY. No SELECT, UPDATE or DELETE for anon. An uploader cannot
--     read back, overwrite or remove anything, so this cannot be used to
--     tamper with a stored document.
--   * `application/pdf` ONLY, enforced by the bucket, so it cannot be used to
--     host scripts, HTML or images.
--   * 5 MB cap, enforced by the bucket, so it cannot be used as free bulk
--     storage.
--
-- The residual risk is an anonymous party filling the bucket with junk PDFs up
-- to 5 MB each. That is the same exposure the public scoping form already has,
-- and `submit-scoping-request` is rate limited to 3 requests per 10 minutes
-- per IP. It is a storage-cost nuisance, not a data-exposure or integrity
-- problem, and it is the price of a merchant-facing form that returns a PDF.
--
-- Staff read access goes through `is_internal_staff()`, matching how
-- `documents` and `call_logs` gate their own staff-only operations.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scoping-documents',
  'scoping-documents',
  false,
  5242880,                      -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anonymous submitters may CREATE an object in this bucket and do nothing else.
DROP POLICY IF EXISTS "Anyone can upload a scoping PDF" ON storage.objects;
CREATE POLICY "Anyone can upload a scoping PDF"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'scoping-documents');

-- Staff may read them. Deliberately not granted to plain `authenticated`:
-- anyone can register (see phase-3.md), so `authenticated` is not "staff".
DROP POLICY IF EXISTS "Staff can read scoping PDFs" ON storage.objects;
CREATE POLICY "Staff can read scoping PDFs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'scoping-documents' AND public.is_internal_staff());

-- Staff may clean up. No UPDATE policy for anyone: a stored scoping PDF is a
-- record of what the merchant submitted and should not be editable in place.
DROP POLICY IF EXISTS "Staff can delete scoping PDFs" ON storage.objects;
CREATE POLICY "Staff can delete scoping PDFs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'scoping-documents' AND public.is_internal_staff());

COMMIT;

-- VERIFICATION
--
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'scoping-documents';
--   -- expect: public = false, 5242880, {application/pdf}
--
--   select policyname, cmd, array_to_string(roles, ',')
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname ilike '%scoping%';
--   -- expect exactly three: INSERT (anon,authenticated), SELECT and DELETE
--   -- (authenticated). NO update policy, and no `true` qualifier anywhere.
--
-- As always, policy text is not proof. Confirm anon cannot SELECT from this
-- bucket as a real signed-out caller — `query_database` bypasses RLS.
