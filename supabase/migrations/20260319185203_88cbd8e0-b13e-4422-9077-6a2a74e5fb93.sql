
-- Allow users to delete their own sent direct messages
CREATE POLICY "Users can delete own sent messages"
ON public.direct_messages
FOR DELETE
TO public
USING (auth.uid() = sender_id);

-- Allow sender to update their own direct messages (for editing)
CREATE POLICY "Users can update own sent messages"
ON public.direct_messages
FOR UPDATE
TO public
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

-- Drop the old limited update policy
DROP POLICY IF EXISTS "Users can mark received messages as read" ON public.direct_messages;

-- Re-create: allow receiver to mark as read OR sender to edit
CREATE POLICY "Users can update their messages"
ON public.direct_messages
FOR UPDATE
TO public
USING ((auth.uid() = receiver_id) OR (auth.uid() = sender_id));
