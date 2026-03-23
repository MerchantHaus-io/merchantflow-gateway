ALTER TABLE public.validation_reports
  ADD COLUMN IF NOT EXISTS score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recommendation text DEFAULT NULL;