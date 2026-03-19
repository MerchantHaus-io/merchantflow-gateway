
DROP POLICY IF EXISTS "Admins and creators can delete channels" ON public.chat_channels;
CREATE POLICY "Authenticated users can delete channels"
ON public.chat_channels
FOR DELETE
TO public
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete messages"
ON public.chat_messages
FOR DELETE
TO public
USING (auth.uid() IS NOT NULL);
