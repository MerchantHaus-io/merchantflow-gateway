-- Track onboarding/preboarding wizard progress per opportunity
CREATE TABLE IF NOT EXISTS public.onboarding_wizard_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  step_index INTEGER NOT NULL DEFAULT 0,
  form_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_wizard_states_opportunity_unique UNIQUE (opportunity_id)
);

ALTER TABLE public.onboarding_wizard_states ENABLE ROW LEVEL SECURITY;

-- Open policies for now to match other onboarding entities
CREATE POLICY "Anyone can view onboarding wizard states"
  ON public.onboarding_wizard_states
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create onboarding wizard states"
  ON public.onboarding_wizard_states
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update onboarding wizard states"
  ON public.onboarding_wizard_states
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete onboarding wizard states"
  ON public.onboarding_wizard_states
  FOR DELETE
  USING (true);

CREATE TRIGGER update_onboarding_wizard_states_updated_at
  BEFORE UPDATE ON public.onboarding_wizard_states
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_onboarding_wizard_states_opportunity
  ON public.onboarding_wizard_states(opportunity_id);
