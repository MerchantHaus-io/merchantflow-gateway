-- Beneficial owners table for FinCEN CDD Rule compliance
CREATE TABLE public.beneficial_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  title TEXT,
  ownership_percentage NUMERIC NOT NULL CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),
  date_of_birth TEXT,
  address_line1 TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.beneficial_owners ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view beneficial owners"
  ON public.beneficial_owners FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create beneficial owners"
  ON public.beneficial_owners FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update beneficial owners"
  ON public.beneficial_owners FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete beneficial owners"
  ON public.beneficial_owners FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Add risk_tier to validation_reports for high-risk MCC flagging
ALTER TABLE public.validation_reports ADD COLUMN IF NOT EXISTS risk_tier TEXT DEFAULT NULL;

-- Add updated_at trigger for beneficial_owners
CREATE TRIGGER update_beneficial_owners_updated_at
  BEFORE UPDATE ON public.beneficial_owners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();