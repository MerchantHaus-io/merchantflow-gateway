CREATE TABLE public.scoping_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new',

  -- Step 1: Business Profile
  legal_business_name text NOT NULL,
  dba_name text,
  entity_type text,
  state_of_incorporation text,
  years_in_operation text,
  employee_count text,
  website_url text,
  business_address_line1 text,
  business_city text,
  business_state text,
  business_zip text,
  contact_first_name text NOT NULL,
  contact_last_name text NOT NULL,
  contact_title text,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  technical_contact_name text,
  technical_contact_email text,
  foreign_ownership text,

  -- Step 2: Products & Processing
  product_description text NOT NULL,
  industry_vertical text,
  estimated_mcc text,
  fulfilment_timeframe text,
  refund_policy_summary text,
  typical_refund_rate text,
  restricted_verticals text[] DEFAULT '{}',
  currently_processing text,
  current_processor text,
  current_effective_rate text,
  contract_end_date text,
  monthly_volume text,
  monthly_transaction_count text,
  average_ticket text,
  highest_ticket text,
  projected_volume_12mo text,
  seasonal_peak_months text,
  channel_mix text[] DEFAULT '{}',
  channel_split_notes text,
  chargeback_count_12mo text,
  chargeback_ratio text,
  prior_terminations text,

  -- Step 3: Payment Methods & Technical
  payment_methods text[] DEFAULT '{}',
  currency_geography text[] DEFAULT '{}',
  storefront_platform text,
  crm_or_erp text,
  accounting_system text,
  integration_route text[] DEFAULT '{}',
  gateway_capabilities text[] DEFAULT '{}',
  has_developer_resource text,
  terminal_count text,
  location_mid_count text,
  unusual_flow_notes text,

  -- Step 4: Risk & Compliance
  pci_status text,
  data_collected text[] DEFAULT '{}',
  existing_fraud_tooling text,
  chargeback_management_provider text,

  -- Step 5: Funding, Timeline & Decision
  funding_timeline text,
  deposit_structure text,
  reconciliation_owner text,
  reporting_frequency text,
  reporting_requirements text,
  target_go_live_date text,
  hard_deadline_reason text,
  process_stage text,
  decision_makers text[] DEFAULT '{}',
  other_providers_evaluated text,
  budget_expectation text,
  additional_notes text,

  -- Step 6: Acknowledgement
  acknowledgement_name text NOT NULL,
  acknowledgement_title text,
  disclosures_accepted boolean NOT NULL DEFAULT false,

  -- Meta
  opportunity_id uuid,
  client_ip text,
  user_agent text,
  utm jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scoping_submissions TO authenticated;
GRANT ALL ON public.scoping_submissions TO service_role;

ALTER TABLE public.scoping_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scoping submissions"
  ON public.scoping_submissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update scoping submissions"
  ON public.scoping_submissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete scoping submissions"
  ON public.scoping_submissions FOR DELETE TO authenticated USING (true);

CREATE TRIGGER scoping_submissions_updated_at
  BEFORE UPDATE ON public.scoping_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notify_on_new_scoping_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, notification_category, link)
  SELECT p.id,
         'New scoping form received',
         COALESCE(NEW.legal_business_name, 'A prospect') || ' submitted a Payments & Gateway Scoping Form.',
         'info',
         'scoping_submission',
         '/admin/web-submissions'
  FROM public.profiles p
  WHERE NOT public.is_blocked_recipient(p.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER scoping_submissions_notify
  AFTER INSERT ON public.scoping_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_scoping_submission();