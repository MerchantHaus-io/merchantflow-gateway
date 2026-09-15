ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

CREATE INDEX IF NOT EXISTS idx_support_tickets_quarantined_at
  ON public.support_tickets (quarantined_at)
  WHERE quarantined_at IS NOT NULL;

COMMENT ON COLUMN public.support_tickets.quarantined_at IS
  'Set when inbound intake judged the message likely bulk/spam. Staff can release it back to the queue.';
COMMENT ON COLUMN public.support_tickets.quarantine_reason IS
  'Short machine reason, e.g. gmail_spam_label, list_unsubscribe, auto_reply.';