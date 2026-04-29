CREATE TABLE IF NOT EXISTS public.team_roster (
  id text PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  title text,
  active boolean NOT NULL DEFAULT true,
  color_token text,
  legacy_names text[] DEFAULT '{}',
  aliases text[] DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.team_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view team_roster"
  ON public.team_roster FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage team_roster"
  ON public.team_roster FOR ALL
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

CREATE OR REPLACE FUNCTION public.team_roster_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS team_roster_touch_trg ON public.team_roster;
CREATE TRIGGER team_roster_touch_trg BEFORE UPDATE ON public.team_roster
  FOR EACH ROW EXECUTE FUNCTION public.team_roster_touch();

-- Seed with current roster
INSERT INTO public.team_roster (id, email, display_name, title, active, color_token, legacy_names, aliases, sort_order)
VALUES
  ('jamie',  'jamie@merchanthaus.io',   'Jamie',          'CEO',                        true,  'border-team-jamie',  '{}',                 ARRAY['admin@merchanthaus.io'],                                    10),
  ('darryn', 'admin@merchanthaus.io',   'Darryn',         'QA & Complex Sales / Tech',  true,  'border-team-darryn', '{}',                 ARRAY['onboarding@merchanthaus.io','darryn@merchanthaus.io'],     20),
  ('yaseen', 'support@merchanthaus.io', 'Yaseen Sheik',   'Support Lead',               true,  'border-team-yaseen', ARRAY['Sheiky','Yaseen'], '{}',                                                            30),
  ('taryn',  'taryn@merchanthaus.io',   'Taryn Engledoe', 'Affiliate & Partner Manager',true,  'border-team-taryn',  ARRAY['Taryn'],       '{}',                                                              40),
  ('neil',   'neil@nmi.com',            'Neil',           'NMI Support Liaison',        true,  'border-team-neil',   '{}',                 '{}',                                                              50),
  ('wesley', 'sales@merchanthaus.io',   'Wesley',         'Sales (inactive)',           false, 'border-team-wesley', '{}',                 '{}',                                                              90)
ON CONFLICT (id) DO NOTHING;

-- When display_name changes, backfill opportunities.assigned_to from any legacy_names → new display_name
CREATE OR REPLACE FUNCTION public.team_roster_rename_backfill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    UPDATE public.opportunities SET assigned_to = NEW.display_name
      WHERE assigned_to = OLD.display_name
         OR assigned_to = ANY(COALESCE(OLD.legacy_names, '{}'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_roster_rename_backfill_trg ON public.team_roster;
CREATE TRIGGER team_roster_rename_backfill_trg AFTER UPDATE ON public.team_roster
  FOR EACH ROW EXECUTE FUNCTION public.team_roster_rename_backfill();