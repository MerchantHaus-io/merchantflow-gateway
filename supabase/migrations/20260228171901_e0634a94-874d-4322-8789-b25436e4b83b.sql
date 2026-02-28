
-- Fix accounts: replace public policies with authenticated-only
DROP POLICY IF EXISTS "Anyone can view accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anyone can create accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anyone can update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anyone can delete accounts" ON public.accounts;

CREATE POLICY "Authenticated users can view accounts" ON public.accounts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create accounts" ON public.accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update accounts" ON public.accounts FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete accounts" ON public.accounts FOR DELETE USING (auth.uid() IS NOT NULL);

-- Fix opportunities: replace public policies with authenticated-only
-- Keep public INSERT for merchant application form
DROP POLICY IF EXISTS "Anyone can view opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Anyone can create opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Anyone can update opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Anyone can delete opportunities" ON public.opportunities;

CREATE POLICY "Authenticated users can view opportunities" ON public.opportunities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Anyone can create opportunities" ON public.opportunities FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update opportunities" ON public.opportunities FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete opportunities" ON public.opportunities FOR DELETE USING (auth.uid() IS NOT NULL);

-- Fix documents: replace public policies with authenticated-only
DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.documents;

CREATE POLICY "Authenticated users can view documents" ON public.documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert documents" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can delete documents" ON public.documents FOR DELETE USING (auth.uid() IS NOT NULL);
