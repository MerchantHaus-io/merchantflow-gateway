
-- Outreach campaigns table
CREATE TABLE public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  from_name text NOT NULL DEFAULT 'Merchant Haus',
  from_email text NOT NULL DEFAULT 'outreach@merchanthaus.io',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_by_email text NOT NULL,
  total_contacts integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  converted_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Outreach contacts table
CREATE TABLE public.outreach_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text NOT NULL,
  company text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  converted_at timestamptz,
  bounce_reason text,
  reply_snippet text,
  opportunity_id uuid REFERENCES public.opportunities(id),
  resend_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;

-- RLS for campaigns
CREATE POLICY "Authenticated users can view campaigns" ON public.outreach_campaigns FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create campaigns" ON public.outreach_campaigns FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update campaigns" ON public.outreach_campaigns FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete campaigns" ON public.outreach_campaigns FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS for contacts
CREATE POLICY "Authenticated users can view outreach contacts" ON public.outreach_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create outreach contacts" ON public.outreach_contacts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update outreach contacts" ON public.outreach_contacts FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete outreach contacts" ON public.outreach_contacts FOR DELETE USING (auth.uid() IS NOT NULL);

-- Enable realtime for outreach contacts
ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_campaigns;

-- Updated at trigger for campaigns
CREATE TRIGGER update_outreach_campaigns_updated_at BEFORE UPDATE ON public.outreach_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_outreach_contacts_updated_at BEFORE UPDATE ON public.outreach_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
