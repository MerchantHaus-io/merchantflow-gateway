
-- Add scheduled_at to campaigns
ALTER TABLE public.outreach_campaigns ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL;

-- Create cadence_steps table for multi-step sequences
CREATE TABLE IF NOT EXISTS public.cadence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE NOT NULL,
  step_number int NOT NULL DEFAULT 1,
  delay_days int NOT NULL DEFAULT 0,
  subject text NOT NULL,
  body_html text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, step_number)
);

ALTER TABLE public.cadence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cadence steps"
  ON public.cadence_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add cadence tracking to outreach_contacts
ALTER TABLE public.outreach_contacts ADD COLUMN IF NOT EXISTS current_step int NOT NULL DEFAULT 1;
ALTER TABLE public.outreach_contacts ADD COLUMN IF NOT EXISTS last_step_sent_at timestamptz DEFAULT NULL;

-- Enable realtime for cadence_steps
ALTER PUBLICATION supabase_realtime ADD TABLE public.cadence_steps;
