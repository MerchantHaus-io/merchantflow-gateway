-- ─────────────────────────────────────────────────────────────────────────
-- pending_emails: hold-for-review queue for automated emails that should
-- be approved (and optionally edited) by an ops staff member before going
-- out to a merchant.
--
-- Currently used by: Website Compliance Checklist (M2 Wizard Submitted).
-- The "Application Received" thank-you email continues to fire instantly
-- — it's short, low risk, and merchants need immediate confirmation.
--
-- Lifecycle:
--   • created on wizard submission (status = 'pending')
--   • staff reviews on /admin/pending-emails
--     - 'send'    → status = 'sent', sent_at populated
--     - 'discard' → status = 'discarded', reviewed_at populated
--   • RLS: only authenticated users can read/update; service role inserts
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pending_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type      TEXT NOT NULL,
  application_id  UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT,
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'discarded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  send_error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_emails_status_created
  ON public.pending_emails (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_emails_application
  ON public.pending_emails (application_id);

ALTER TABLE public.pending_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pending_emails"
  ON public.pending_emails FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update pending_emails"
  ON public.pending_emails FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- INSERTs only via service role (the Edge Function that queues emails).
-- No INSERT policy for authenticated users intentionally.

-- Realtime so the review page updates as new submissions come in.
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_emails;
