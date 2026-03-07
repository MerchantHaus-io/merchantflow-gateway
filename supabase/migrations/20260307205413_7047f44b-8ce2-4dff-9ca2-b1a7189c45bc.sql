
-- NMI Boarding submissions tracking
CREATE TABLE public.nmi_boarding_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  submitted_by uuid NOT NULL,
  submitted_by_email text NOT NULL,
  
  -- NMI response
  nmi_gateway_id text,
  nmi_status text NOT NULL DEFAULT 'draft',
  nmi_response jsonb,
  error_message text,
  
  -- Merchant info submitted
  merchant_type text NOT NULL DEFAULT 'standard',
  company_name text NOT NULL,
  dba_name text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  
  -- Address
  address1 text NOT NULL,
  address2 text,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  country text NOT NULL DEFAULT 'US',
  
  -- Settings
  website_url text,
  timezone text NOT NULL DEFAULT 'America/New_York',
  language text NOT NULL DEFAULT 'en',
  username text NOT NULL,
  
  -- Banking
  bank_name text,
  routing_number_last4 text,
  account_number_last4 text,
  account_type text DEFAULT 'checking',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nmi_boarding_submissions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view boarding submissions"
  ON public.nmi_boarding_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create boarding submissions"
  ON public.nmi_boarding_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update boarding submissions"
  ON public.nmi_boarding_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
