-- Allow admins and channel creators to delete chat channels
CREATE POLICY "Admins and creators can delete channels"
ON public.chat_channels
FOR DELETE
USING (
  is_admin_email() OR auth.uid() = created_by
);

-- Allow admins and channel creators to update chat channels (for archiving)
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone DEFAULT NULL;

CREATE POLICY "Admins and creators can update channels"
ON public.chat_channels
FOR UPDATE
USING (
  is_admin_email() OR auth.uid() = created_by
);

-- When a channel is deleted, cascade delete its messages
ALTER TABLE public.chat_messages 
DROP CONSTRAINT IF EXISTS chat_messages_channel_id_fkey;

ALTER TABLE public.chat_messages
ADD CONSTRAINT chat_messages_channel_id_fkey
FOREIGN KEY (channel_id) 
REFERENCES public.chat_channels(id) 
ON DELETE CASCADE;