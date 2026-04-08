
ALTER TABLE public.synced_emails 
  ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_names text[] DEFAULT '{}';
