
-- 1) Add missing gateway columns to commission_records (idempotent).
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS gateway_invoiced numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gateway_margin   numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commission_records.gateway_invoiced IS 'Gateway amount invoiced to the merchant this period (accepted quote monthly_resale).';
COMMENT ON COLUMN public.commission_records.gateway_margin   IS 'Our gateway profit this period (accepted quote monthly_margin).';

-- 2) Replace RLS predicates that hit auth.users directly (permission denied
--    for role authenticated) with SECURITY DEFINER helpers.

CREATE OR REPLACE FUNCTION public.is_merchanthaus_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND email LIKE '%@merchanthaus.io'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid();
$$;

-- commission_records: staff-visibility policy
DROP POLICY IF EXISTS "Internal staff can view all commission records" ON public.commission_records;
CREATE POLICY "Internal staff can view all commission records"
  ON public.commission_records
  FOR SELECT
  TO authenticated
  USING (public.is_merchanthaus_staff());

-- synced_emails: user's own emails policy
DROP POLICY IF EXISTS "Users can view their own synced emails" ON public.synced_emails;
CREATE POLICY "Users can view their own synced emails"
  ON public.synced_emails
  FOR SELECT
  TO authenticated
  USING (user_email = public.current_user_email());
