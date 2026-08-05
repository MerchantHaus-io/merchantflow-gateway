-- ACCOUNTS ------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view accounts" ON public.accounts;
CREATE POLICY "Staff can view accounts"
  ON public.accounts FOR SELECT TO authenticated
  USING (NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can update accounts" ON public.accounts;
CREATE POLICY "Staff can update accounts"
  ON public.accounts FOR UPDATE TO authenticated
  USING (NOT public.is_referrer())
  WITH CHECK (NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can create accounts" ON public.accounts;
CREATE POLICY "Staff can create accounts"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_referrer());

-- MERCHANTS -----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view merchants" ON public.merchants;
CREATE POLICY "Staff can view merchants"
  ON public.merchants FOR SELECT TO authenticated
  USING (NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can update merchants" ON public.merchants;
CREATE POLICY "Staff can update merchants"
  ON public.merchants FOR UPDATE TO authenticated
  USING (NOT public.is_referrer())
  WITH CHECK (NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete merchants" ON public.merchants;
CREATE POLICY "Staff can delete merchants"
  ON public.merchants FOR DELETE TO authenticated
  USING (NOT public.is_referrer());

-- OPPORTUNITIES -------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view opportunities" ON public.opportunities;
CREATE POLICY "Staff can view opportunities"
  ON public.opportunities FOR SELECT TO authenticated
  USING (NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can update opportunities" ON public.opportunities;
CREATE POLICY "Staff can update opportunities"
  ON public.opportunities FOR UPDATE TO authenticated
  USING (NOT public.is_referrer())
  WITH CHECK (NOT public.is_referrer());