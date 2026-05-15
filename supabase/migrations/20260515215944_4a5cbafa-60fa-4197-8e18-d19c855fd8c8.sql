
-- 1. push_subscriptions: restrict broad SELECT to service_role only
DROP POLICY IF EXISTS "Service role can read all subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role can read all subscriptions"
  ON public.push_subscriptions FOR SELECT TO service_role USING (true);

-- 2. admin_popup_acknowledgments: scope SELECT to own row (admins still covered via is_admin_email)
DROP POLICY IF EXISTS "Users can view own acknowledgments" ON public.admin_popup_acknowledgments;
CREATE POLICY "Users can view own acknowledgments"
  ON public.admin_popup_acknowledgments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all acknowledgments"
  ON public.admin_popup_acknowledgments FOR SELECT TO authenticated
  USING (public.is_admin_email());

-- 3. user_roles: restrict broad SELECT (own roles policy already exists; admins covered)
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin_email());

-- 4. synced_emails: scope SELECT to owner (matched by email)
DROP POLICY IF EXISTS "Authenticated users can view synced emails" ON public.synced_emails;
CREATE POLICY "Users can view their own synced emails"
  ON public.synced_emails FOR SELECT TO authenticated
  USING (
    user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 5. principals / application_secrets / bank_accounts / application_documents:
-- replace public unauthenticated INSERT with authenticated-only.
-- Public merchant submissions go through edge functions using service_role (which bypasses RLS),
-- so this does not break the public application flow.
DROP POLICY IF EXISTS "Anyone can insert principals" ON public.principals;
CREATE POLICY "Authenticated users can insert principals"
  ON public.principals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can insert application_secrets" ON public.application_secrets;
CREATE POLICY "Admins can insert application_secrets"
  ON public.application_secrets FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_email());

DROP POLICY IF EXISTS "Anyone can insert bank_accounts" ON public.bank_accounts;
CREATE POLICY "Authenticated users can insert bank_accounts"
  ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can insert application_documents" ON public.application_documents;
CREATE POLICY "Authenticated users can insert application_documents"
  ON public.application_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
