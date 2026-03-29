
CREATE TABLE IF NOT EXISTS public.synced_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL UNIQUE,
  gmail_thread_id text,
  user_email text NOT NULL,
  from_email text,
  from_name text,
  to_emails text[],
  cc_emails text[],
  subject text,
  snippet text,
  received_at timestamptz,
  matched_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  matched_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  matched_opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  lead_created boolean DEFAULT false,
  activity_created boolean DEFAULT false,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.synced_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view synced emails"
  ON public.synced_emails FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage synced emails"
  ON public.synced_emails FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_synced_emails_gmail_id ON public.synced_emails(gmail_message_id);
CREATE INDEX idx_synced_emails_from ON public.synced_emails(from_email);
CREATE INDEX idx_synced_emails_user ON public.synced_emails(user_email);
CREATE INDEX idx_synced_emails_account ON public.synced_emails(matched_account_id);
CREATE INDEX idx_synced_emails_contact ON public.synced_emails(matched_contact_id);
