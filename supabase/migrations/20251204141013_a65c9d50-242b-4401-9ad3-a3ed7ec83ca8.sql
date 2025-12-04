-- Add intake form fields to merchants table
ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS address2 text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS zip text,
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS fax text,
ADD COLUMN IF NOT EXISTS username text,
ADD COLUMN IF NOT EXISTS processing_services text[],
ADD COLUMN IF NOT EXISTS value_services text,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS timezone text,
ADD COLUMN IF NOT EXISTS language text;