
-- Make opportunity-documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'opportunity-documents';

-- Drop any public SELECT policies on storage.objects for this bucket
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can view opportunity documents" ON storage.objects;

-- Ensure authenticated users can still read files from this bucket
CREATE POLICY "Authenticated users can view opportunity documents"
ON storage.objects FOR SELECT
USING (auth.uid() IS NOT NULL AND bucket_id = 'opportunity-documents');
