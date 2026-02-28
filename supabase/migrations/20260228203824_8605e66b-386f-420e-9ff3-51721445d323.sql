
-- Make chat-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- Drop overly permissive storage policies for chat-attachments
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;

-- Add authenticated-only policy for chat-attachments
CREATE POLICY "Authenticated users can view chat attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
