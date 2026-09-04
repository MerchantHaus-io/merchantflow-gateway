CREATE TABLE public.partner_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'new',
  expected_deals integer NOT NULL DEFAULT 0,
  expected_monthly_gateway numeric NOT NULL DEFAULT 0,
  win_likelihood integer NOT NULL DEFAULT 50,
  expected_close_date date,
  owner_email text,
  source text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_leads_stage_check CHECK (stage IN ('new','in_talks','proposal_sent','agreed','won','lost')),
  CONSTRAINT partner_leads_likelihood_check CHECK (win_likelihood BETWEEN 0 AND 100)
);

CREATE INDEX partner_leads_stage_idx ON public.partner_leads (stage);
CREATE INDEX partner_leads_referrer_idx ON public.partner_leads (referrer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_leads TO authenticated;
GRANT ALL ON public.partner_leads TO service_role;

ALTER TABLE public.partner_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view partner leads"
  ON public.partner_leads FOR SELECT TO authenticated
  USING (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email());

CREATE POLICY "Staff can create partner leads"
  ON public.partner_leads FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email());

CREATE POLICY "Staff can update partner leads"
  ON public.partner_leads FOR UPDATE TO authenticated
  USING (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email())
  WITH CHECK (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email());

CREATE POLICY "Staff can delete partner leads"
  ON public.partner_leads FOR DELETE TO authenticated
  USING (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email());

CREATE TRIGGER partner_leads_touch
  BEFORE UPDATE ON public.partner_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();