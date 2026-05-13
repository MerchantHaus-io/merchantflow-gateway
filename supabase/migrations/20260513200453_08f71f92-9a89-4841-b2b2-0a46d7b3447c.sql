DROP POLICY IF EXISTS "Referrers can view their own profile" ON public.referrers;
DROP POLICY IF EXISTS "Admins can manage referrers" ON public.referrers;

CREATE POLICY "Referrers can view their own profile"
ON public.referrers
FOR SELECT
USING (auth_user_id = auth.uid() OR is_admin_email());

CREATE POLICY "Admins can manage referrers"
ON public.referrers
FOR ALL
USING (is_admin_email())
WITH CHECK (is_admin_email());