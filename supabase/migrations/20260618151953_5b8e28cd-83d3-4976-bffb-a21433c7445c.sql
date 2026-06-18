
-- 1. Lead referrers directory (separate from the commission-bearing `referrers` table)
CREATE TABLE public.lead_referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_referrers TO authenticated;
GRANT ALL ON public.lead_referrers TO service_role;

ALTER TABLE public.lead_referrers ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the directory (needed for the dropdown)
CREATE POLICY "Authenticated can read lead referrers"
  ON public.lead_referrers FOR SELECT
  TO authenticated
  USING (true);

-- Only admins (by email) can insert/update/delete
CREATE POLICY "Admins can insert lead referrers"
  ON public.lead_referrers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_email());

CREATE POLICY "Admins can update lead referrers"
  ON public.lead_referrers FOR UPDATE
  TO authenticated
  USING (public.is_admin_email())
  WITH CHECK (public.is_admin_email());

CREATE POLICY "Admins can delete lead referrers"
  ON public.lead_referrers FOR DELETE
  TO authenticated
  USING (public.is_admin_email());

CREATE TRIGGER lead_referrers_touch
  BEFORE UPDATE ON public.lead_referrers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Link opportunities to a lead referrer (nullable)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS lead_referrer_id uuid
  REFERENCES public.lead_referrers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_lead_referrer_id
  ON public.opportunities(lead_referrer_id);

-- 3. Seed initial directory
INSERT INTO public.lead_referrers (name, institution) VALUES
  ('Urle Johnson',  NULL),
  ('Gayle Edmond',  NULL),
  ('Jason Gibson',  'Wells Fargo'),
  ('Josue Sanchez', 'Wells Fargo'),
  ('Dan K',         NULL)
ON CONFLICT DO NOTHING;
