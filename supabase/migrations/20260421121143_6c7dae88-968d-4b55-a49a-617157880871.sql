BEGIN;

-- 1) Merge business data onto Sharlea's APPLICATION (Sharlea remains contact; Gary is owner)
UPDATE public.applications
SET
  company_name = 'IMPROVLearning',
  dba_name = 'My Improv',
  legal_name = 'Interactive Education Concepts, Inc.',
  federal_tax_id = '95-4508759',
  business_structure = 'corporation',
  state_of_incorporation = 'CA',
  date_established = '1994-10-26',
  monthly_volume = '25000',
  avg_ticket = '2400',
  high_ticket = '42000',
  nature_of_business = 'Education',
  products = 'Driver Safety and related trainings',
  website = 'www.improvlearning.com',
  address = '17328 Ventura Blvd. #202',
  city = 'Encino',
  state = 'CA',
  zip = '91316',
  in_person_percent = '0',
  keyed_percent = '100',
  ecommerce_percent = '0',
  owner_name = 'Gary Aleksintser',
  owner_dob = '1965-05-22',
  owner_ssn_last4 = '9131',
  owner_address = '17328 Ventura Blvd. #202',
  owner_city = 'Encino',
  owner_state = 'CA',
  owner_zip = '91316',
  owner_title = 'President',
  updated_at = now()
WHERE id = '76758cfe-ea46-4ba2-a08d-ebc2551fc076';

-- 2) Merge merchant detail row for Sharlea's application
UPDATE public.merchants
SET
  legal_entity_name = 'Interactive Education Concepts, Inc.',
  dba_name = 'My Improv',
  federal_tax_id = '95-4508759',
  ownership_type = 'corporation',
  state_incorporated = 'CA',
  business_formation_date = '1994-10-26',
  monthly_volume = '25000',
  average_transaction = '2400',
  high_ticket = '42000',
  percent_swiped = '0',
  percent_keyed = '100',
  percent_ecommerce = '0',
  percent_moto = '0',
  percent_b2b = '100',
  percent_b2c = '0',
  nature_of_business = 'Education',
  product_description = 'Driver Safety and related trainings',
  website_url = 'www.improvlearning.com',
  legal_address_line1 = '17328 Ventura Blvd. #202',
  legal_city = 'Encino',
  legal_state = 'CA',
  legal_zip = '91316',
  legal_country = 'US',
  dba_address_line1 = '17328 Ventura Blvd. #202',
  dba_city = 'Encino',
  dba_state = 'CA',
  dba_zip = '91316',
  dba_country = 'US',
  updated_at = now()
WHERE application_id = '76758cfe-ea46-4ba2-a08d-ebc2551fc076';

-- 3) Update the My Improv account with address/website
UPDATE public.accounts
SET
  address1 = '17328 Ventura Blvd. #202',
  city = 'Encino',
  state = 'CA',
  zip = '91316',
  country = 'US',
  website = 'www.improvlearning.com',
  updated_at = now()
WHERE id = 'c575b1b9-a407-49a7-9a5c-8f1503ce02d4';

-- 4) Add Gary Aleksintser as the beneficial owner (principal)
INSERT INTO public.beneficial_owners (
  opportunity_id, full_name, title, ownership_percentage,
  date_of_birth, address_line1, address_city, address_state, address_zip, address_country
)
SELECT
  '7e4e690f-96ed-4992-8a71-866d2420ce0e'::uuid,
  'Gary Aleksintser',
  'President',
  100,
  '1965-05-22',
  '17328 Ventura Blvd. #202',
  'Encino',
  'CA',
  '91316',
  'US'
WHERE NOT EXISTS (
  SELECT 1 FROM public.beneficial_owners
  WHERE opportunity_id = '7e4e690f-96ed-4992-8a71-866d2420ce0e'
    AND full_name = 'Gary Aleksintser'
);

COMMIT;