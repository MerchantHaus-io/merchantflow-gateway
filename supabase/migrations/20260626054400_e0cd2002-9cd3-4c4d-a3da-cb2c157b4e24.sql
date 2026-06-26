ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text;
COMMENT ON COLUMN public.support_tickets.gmail_thread_id IS 'Gmail threadId used to keep outbound status emails in the same conversation.';
COMMENT ON COLUMN public.support_tickets.gmail_message_id IS 'RFC Message-ID header of the most recent message in the thread, used for In-Reply-To/References.';