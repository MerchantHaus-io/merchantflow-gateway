DROP POLICY IF EXISTS "Authenticated users can delete channels" ON public.chat_channels;
CREATE POLICY "Admins or creators can delete channels"
ON public.chat_channels
FOR DELETE
TO authenticated
USING (public.is_admin_email() OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can delete messages" ON public.chat_messages;
CREATE POLICY "Users can delete own messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (public.is_admin_email() OR auth.uid() = user_id);