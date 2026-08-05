-- merchants: remove anonymous insert, restrict to internal staff
DROP POLICY IF EXISTS "Anyone can insert merchants" ON public.merchants;
CREATE POLICY "Staff can insert merchants"
  ON public.merchants FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_referrer());

-- opportunities: remove anonymous insert, restrict to internal staff
DROP POLICY IF EXISTS "Anyone can create opportunities" ON public.opportunities;
CREATE POLICY "Staff can insert opportunities"
  ON public.opportunities FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_referrer());

-- Revoke write privileges from the anonymous role on both tables.
REVOKE INSERT, UPDATE, DELETE ON public.merchants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.opportunities FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.merchants TO service_role;
GRANT ALL ON public.opportunities TO service_role;