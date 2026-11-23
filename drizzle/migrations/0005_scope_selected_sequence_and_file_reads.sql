CREATE OR REPLACE FUNCTION public.can_read_chat_attachment(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.tenant_id = public.current_tenant_id()
      AND (m.attachment_url = _name OR substring(split_part(m.attachment_url, '?', 1) FROM '/storage/v1/object/(?:sign|public|authenticated)/chat-attachments/(.*)$') = _name)
  ) OR EXISTS (
    SELECT 1 FROM public.direct_messages m
    WHERE m.tenant_id = public.current_tenant_id()
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
      AND (m.attachment_url = _name OR substring(split_part(m.attachment_url, '?', 1) FROM '/storage/v1/object/(?:sign|public|authenticated)/chat-attachments/(.*)$') = _name)
  ) OR EXISTS (
    SELECT 1 FROM public.action_items a
    WHERE a.tenant_id = public.current_tenant_id()
      AND (a.attachment_url = _name OR substring(split_part(a.attachment_url, '?', 1) FROM '/storage/v1/object/(?:sign|public|authenticated)/chat-attachments/(.*)$') = _name)
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_chat_attachment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_chat_attachment(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_merchant_file(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.tenant_id = public.current_tenant_id()
      AND (o.id::text = split_part(_name, '/', 1) OR EXISTS (
        SELECT 1 FROM public.documents d WHERE d.opportunity_id = o.id
          AND d.tenant_id = o.tenant_id AND d.file_path = _name
      ))
  ) OR EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.tenant_id = public.current_tenant_id()
      AND (a.id::text = split_part(_name, '/', 1) OR EXISTS (
        SELECT 1 FROM public.application_documents d WHERE d.application_id = a.id
          AND d.tenant_id = a.tenant_id AND d.file_path = _name
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_merchant_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_merchant_file(text) TO authenticated, service_role;

ALTER POLICY "Auth team can read sequences" ON public.billing_doc_sequences
TO authenticated USING (
  auth.uid() IS NOT NULL AND public.is_internal_staff()
  AND public.current_tenant_id() = public.default_tenant_id()
);
ALTER POLICY "Authenticated users can view chat attachments" ON storage.objects
TO authenticated USING (
  bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL
  AND public.is_internal_staff() AND public.current_tenant_id() IS NOT NULL
  AND (owner_id = auth.uid()::text OR public.can_read_chat_attachment(name))
);
ALTER POLICY "Authenticated users can view opportunity documents" ON storage.objects
TO authenticated USING (
  bucket_id = 'opportunity-documents' AND auth.uid() IS NOT NULL
  AND public.is_internal_staff() AND public.current_tenant_id() IS NOT NULL
  AND public.can_read_merchant_file(name)
);