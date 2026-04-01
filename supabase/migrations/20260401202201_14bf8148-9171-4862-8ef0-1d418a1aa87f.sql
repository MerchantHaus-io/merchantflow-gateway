
-- Create message_logs table for SMS/text tracking from Quo
CREATE TABLE public.message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quo_message_id TEXT UNIQUE,
  direction TEXT NOT NULL DEFAULT 'incoming',
  status TEXT NOT NULL DEFAULT 'received',
  phone_number TEXT,
  content TEXT,
  from_number TEXT,
  to_numbers TEXT[],
  quo_phone_number_id TEXT,
  contact_id UUID REFERENCES public.contacts(id),
  opportunity_id UUID REFERENCES public.opportunities(id),
  account_id UUID REFERENCES public.accounts(id),
  media_urls TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "Authenticated users can view message logs"
  ON public.message_logs FOR SELECT TO authenticated USING (true);

-- Only service role inserts (via webhook edge function)
CREATE POLICY "Service role can insert message logs"
  ON public.message_logs FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update message logs"
  ON public.message_logs FOR UPDATE TO service_role USING (true);

-- Enable realtime for message_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;

-- Add index for contact lookups
CREATE INDEX idx_message_logs_contact_id ON public.message_logs(contact_id);
CREATE INDEX idx_message_logs_phone_number ON public.message_logs(phone_number);
CREATE INDEX idx_message_logs_quo_message_id ON public.message_logs(quo_message_id);

-- Add trigger for updated_at
CREATE TRIGGER update_message_logs_updated_at
  BEFORE UPDATE ON public.message_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
