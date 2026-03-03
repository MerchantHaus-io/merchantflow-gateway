-- Drop the trigger that creates bell notifications for channel messages
DROP TRIGGER IF EXISTS on_channel_message_notify ON public.chat_messages;
