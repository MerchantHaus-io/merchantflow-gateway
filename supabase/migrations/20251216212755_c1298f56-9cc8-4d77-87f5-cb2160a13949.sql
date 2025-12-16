-- Add document_type column to documents table
ALTER TABLE public.documents
ADD COLUMN document_type text DEFAULT 'Unassigned';

-- Update existing documents to have 'Unassigned' type
UPDATE public.documents SET document_type = 'Unassigned' WHERE document_type IS NULL;