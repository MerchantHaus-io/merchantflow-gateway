DROP POLICY IF EXISTS "Authenticated users can view applications" ON public.applications;
CREATE POLICY "Staff can view applications"
ON public.applications
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());