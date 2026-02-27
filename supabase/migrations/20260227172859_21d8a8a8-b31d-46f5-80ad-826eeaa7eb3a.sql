
-- Table to record merchant agreement acceptance with compliance metadata
CREATE TABLE public.merchant_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  consent_type TEXT NOT NULL DEFAULT 'merchant_agreement',
  ip_address TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  terms_version TEXT NOT NULL DEFAULT '1.0',
  beneficial_ownership_accepted BOOLEAN NOT NULL DEFAULT false,
  merchant_agreement_accepted BOOLEAN NOT NULL DEFAULT false,
  account_authorization_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.merchant_consents ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public form)
CREATE POLICY "Anyone can insert merchant_consents" ON public.merchant_consents
  FOR INSERT WITH CHECK (true);

-- Authenticated users can view
CREATE POLICY "Authenticated users can view merchant_consents" ON public.merchant_consents
  FOR SELECT USING (auth.uid() IS NOT NULL);
