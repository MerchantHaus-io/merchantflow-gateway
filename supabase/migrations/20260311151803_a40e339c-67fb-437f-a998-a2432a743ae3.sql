
ALTER TABLE public.opportunities 
  ADD COLUMN IF NOT EXISTS outcome_status text,
  ADD COLUMN IF NOT EXISTS outcome_reason text,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_closed_by text;
