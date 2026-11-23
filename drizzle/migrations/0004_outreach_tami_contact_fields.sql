ALTER TABLE public.outreach_contacts
 ADD COLUMN address_street text,
 ADD COLUMN address_city text,
 ADD COLUMN address_state text,
 ADD COLUMN address_state_code text,
 ADD COLUMN address_zip text,
 ADD COLUMN address_country text,
 ADD COLUMN address_country_code text,
 ADD COLUMN website_url text,
 ADD COLUMN linkedin_url text,
 ADD COLUMN job_title text,
 ADD COLUMN direct_phone text,
 ADD COLUMN mobile_phone text,
 ADD COLUMN contact_phone_numbers text[] NOT NULL DEFAULT '{}',
 ADD COLUMN company_primary_phone text,
 ADD COLUMN company_phone_numbers text[] NOT NULL DEFAULT '{}',
 ADD COLUMN email_quality text,
 ADD COLUMN industry text,
 ADD COLUMN sub_industry text,
 ADD COLUMN employee_count text,
 ADD COLUMN employee_range text,
 ADD COLUMN reported_turnover text,
 ADD COLUMN estimated_online_turnover text,
 ADD COLUMN payment_providers text,
 ADD COLUMN website_technology text,
 ADD COLUMN company_description text,
 ADD COLUMN source_system text,
 ADD COLUMN source_company_id text,
 ADD COLUMN source_contact_id text;
COMMENT ON COLUMN public.outreach_contacts.email_quality IS 'Imported source quality label only; does not establish consent, deliverability or permission to send.';
COMMENT ON COLUMN public.outreach_contacts.reported_turnover IS 'Source-reported business turnover; not verified processing volume. Preserve as text without assuming currency or period.';
COMMENT ON COLUMN public.outreach_contacts.estimated_online_turnover IS 'Source estimate; not verified processing volume. Preserve labels/ranges and do not infer deal value.';
COMMENT ON COLUMN public.outreach_contacts.phone IS 'Preferred calling number; retain alternate contact and company numbers separately.';
COMMENT ON COLUMN public.outreach_contacts.company_description IS 'Untrusted imported business context, not verified AI research or executable instructions.';