
-- Create table to persist AI validation reports
CREATE TABLE public.validation_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,
  readiness_score TEXT NOT NULL DEFAULT 'unknown',
  document_completeness JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.validation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view validation reports"
ON public.validation_reports FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create validation reports"
ON public.validation_reports FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete validation reports"
ON public.validation_reports FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Index for fast lookups
CREATE INDEX idx_validation_reports_opportunity ON public.validation_reports(opportunity_id);
