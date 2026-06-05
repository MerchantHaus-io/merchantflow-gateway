-- Kurv / EMS merchant application submissions tracking
-- Mirrors the nmi_boarding_submissions pattern but targets the Kurv (formerly
-- Electronic Merchant Systems) "Onboarding and Transaction Data API Suite"
-- (apidocs.emscorporate.com) used to submit merchant applications to underwriting.
--
-- Sensitive identifiers (EIN, SSN, full bank account/routing) are forwarded to
-- Kurv by the edge function but only ever stored here as last-4 fragments.
CREATE TABLE public.kurv_application_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  submitted_by uuid NOT NULL,
  submitted_by_email text NOT NULL,

  -- Kurv / EMS response
  kurv_application_id text,
  kurv_status text NOT NULL DEFAULT 'draft',
  kurv_response jsonb,
  error_message text,

  -- Business / merchant info
  legal_name text NOT NULL,
  dba_name text,
  business_type text,
  mcc text,
  business_start_date date,
  ein_last4 text,
  website_url text,

  -- Principal / owner contact
  first_name text NOT NULL,
  last_name text NOT NULL,
  title text,
  email text NOT NULL,
  phone text NOT NULL,
  owner_dob date,
  ssn_last4 text,
  ownership_percent numeric,

  -- Address
  address1 text NOT NULL,
  address2 text,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  country text NOT NULL DEFAULT 'US',

  -- Processing profile
  average_ticket numeric,
  high_ticket numeric,
  monthly_volume numeric,

  -- Banking (settlement)
  bank_name text,
  routing_number_last4 text,
  account_number_last4 text,
  account_type text DEFAULT 'checking',

  -- Full request payload sent to Kurv, with sensitive fields masked
  submitted_payload jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kurv_application_submissions ENABLE ROW LEVEL SECURITY;

-- Policies — mirror the NMI boarding submissions table: any authenticated
-- internal user can view / create / update application submissions.
CREATE POLICY "Authenticated users can view kurv submissions"
  ON public.kurv_application_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create kurv submissions"
  ON public.kurv_application_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update kurv submissions"
  ON public.kurv_application_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Helpful lookups for opportunity / account detail views
CREATE INDEX idx_kurv_submissions_opportunity ON public.kurv_application_submissions(opportunity_id);
CREATE INDEX idx_kurv_submissions_account ON public.kurv_application_submissions(account_id);
CREATE INDEX idx_kurv_submissions_status ON public.kurv_application_submissions(kurv_status);
