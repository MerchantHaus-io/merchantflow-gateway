
-- Allow users to update their own chat messages (for editing)
CREATE POLICY "Users can update own messages"
ON public.chat_messages
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
