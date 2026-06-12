
DROP POLICY IF EXISTS "Authenticated users can update applications" ON public.applications;
CREATE POLICY "Staff and own-referrer can update applications"
ON public.applications FOR UPDATE TO authenticated
USING (public.is_admin_email() OR (NOT public.is_referrer()) OR (public.is_referrer() AND referrer_id = public.current_referrer_id()))
WITH CHECK (public.is_admin_email() OR (NOT public.is_referrer()) OR (public.is_referrer() AND referrer_id = public.current_referrer_id()));

DROP POLICY IF EXISTS "Authenticated users can delete applications" ON public.applications;
CREATE POLICY "Staff can delete applications" ON public.applications FOR DELETE TO authenticated
USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can view beneficial owners" ON public.beneficial_owners;
DROP POLICY IF EXISTS "Authenticated users can update beneficial owners" ON public.beneficial_owners;
DROP POLICY IF EXISTS "Authenticated users can create beneficial owners" ON public.beneficial_owners;
DROP POLICY IF EXISTS "Authenticated users can delete beneficial owners" ON public.beneficial_owners;
CREATE POLICY "Staff can view beneficial owners" ON public.beneficial_owners FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can create beneficial owners" ON public.beneficial_owners FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can update beneficial owners" ON public.beneficial_owners FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer()) WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can delete beneficial owners" ON public.beneficial_owners FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can view acknowledgments" ON public.broadcast_acknowledgments;
CREATE POLICY "Users see own acknowledgments; admins see all" ON public.broadcast_acknowledgments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_email());

DROP POLICY IF EXISTS "Authenticated users can view sync logs" ON public.commission_sync_logs;
CREATE POLICY "Staff can view sync logs" ON public.commission_sync_logs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can view boarding submissions" ON public.nmi_boarding_submissions;
DROP POLICY IF EXISTS "Authenticated users can update boarding submissions" ON public.nmi_boarding_submissions;
DROP POLICY IF EXISTS "Authenticated users can create boarding submissions" ON public.nmi_boarding_submissions;
CREATE POLICY "Staff can view boarding submissions" ON public.nmi_boarding_submissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can create boarding submissions" ON public.nmi_boarding_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can update boarding submissions" ON public.nmi_boarding_submissions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer()) WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can view principals" ON public.principals;
DROP POLICY IF EXISTS "Authenticated users can insert principals" ON public.principals;
DROP POLICY IF EXISTS "Authenticated users can update principals" ON public.principals;
DROP POLICY IF EXISTS "Authenticated users can delete principals" ON public.principals;
CREATE POLICY "Staff can view principals" ON public.principals FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can insert principals" ON public.principals FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can update principals" ON public.principals FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer()) WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());
CREATE POLICY "Staff can delete principals" ON public.principals FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can view impersonation logs" ON public.referrer_impersonation_logs;
CREATE POLICY "Admins can view impersonation logs" ON public.referrer_impersonation_logs FOR SELECT TO authenticated USING (public.is_admin_email());

DROP POLICY IF EXISTS "Authenticated users can delete opportunities" ON public.opportunities;
CREATE POLICY "Staff can delete opportunities" ON public.opportunities FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete accounts" ON public.accounts;
CREATE POLICY "Staff can delete accounts" ON public.accounts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.documents;
CREATE POLICY "Staff can delete documents" ON public.documents FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete bank_accounts" ON public.bank_accounts;
CREATE POLICY "Staff can delete bank_accounts" ON public.bank_accounts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete validation reports" ON public.validation_reports;
CREATE POLICY "Staff can delete validation reports" ON public.validation_reports FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete call logs" ON public.call_logs;
CREATE POLICY "Staff can delete call logs" ON public.call_logs FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete client interactions" ON public.client_interactions;
CREATE POLICY "Staff can delete client interactions" ON public.client_interactions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete campaigns" ON public.outreach_campaigns;
CREATE POLICY "Staff can delete campaigns" ON public.outreach_campaigns FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can delete outreach contacts" ON public.outreach_contacts;
CREATE POLICY "Staff can delete outreach contacts" ON public.outreach_contacts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated can delete todos" ON public.shared_todos;
CREATE POLICY "Staff can delete todos" ON public.shared_todos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Users can delete own chat attachments" ON storage.objects;
CREATE POLICY "Users can delete own chat attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND (owner = auth.uid() OR public.is_admin_email()));

DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
CREATE POLICY "Staff can delete opportunity documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'opportunity-documents' AND auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
CREATE POLICY "Staff can update opportunity documents" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'opportunity-documents' AND auth.uid() IS NOT NULL AND NOT public.is_referrer())
WITH CHECK (bucket_id = 'opportunity-documents' AND auth.uid() IS NOT NULL AND NOT public.is_referrer());
