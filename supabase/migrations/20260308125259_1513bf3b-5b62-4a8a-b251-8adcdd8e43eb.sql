-- Create website_scrutiny_reports table
CREATE TABLE public.website_scrutiny_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL DEFAULT 'unknown',
  score NUMERIC NOT NULL DEFAULT 0,
  score_label TEXT NOT NULL DEFAULT 'unknown',
  summary TEXT,
  requirements_met JSONB NOT NULL DEFAULT '[]'::jsonb,
  red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  website_url TEXT,
  no_change BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.website_scrutiny_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view website scrutiny reports"
  ON public.website_scrutiny_reports FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert website scrutiny reports"
  ON public.website_scrutiny_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add no_change column to validation_reports
ALTER TABLE public.validation_reports ADD COLUMN IF NOT EXISTS no_change BOOLEAN NOT NULL DEFAULT false;