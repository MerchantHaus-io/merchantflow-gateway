-- Add UPDATE policy on opportunity-documents storage for copy operations during migration
CREATE POLICY "Authenticated users can update documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'opportunity-documents' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'opportunity-documents' AND auth.uid() IS NOT NULL);

-- Add UPDATE policy on documents table for updating document_type
CREATE POLICY "Authenticated users can update documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);