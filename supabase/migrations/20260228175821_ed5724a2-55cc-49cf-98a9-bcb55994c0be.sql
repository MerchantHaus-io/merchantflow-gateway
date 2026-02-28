
-- Audit table for document uploads from merchant applications (public-facing)
CREATE TABLE public.application_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  content_type text,
  document_type text NOT NULL DEFAULT 'Unassigned',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS: public insert (no auth), authenticated read
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert application_documents"
  ON public.application_documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view application_documents"
  ON public.application_documents FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete application_documents"
  ON public.application_documents FOR DELETE
  USING (auth.uid() IS NOT NULL);
