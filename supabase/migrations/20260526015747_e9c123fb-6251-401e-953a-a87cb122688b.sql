-- ─── 1. Token columns on the existing quotes table ─────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS acceptance_token            text UNIQUE,
  ADD COLUMN IF NOT EXISTS acceptance_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_quotes_acceptance_token
  ON public.quotes(acceptance_token)
  WHERE acceptance_token IS NOT NULL;

COMMENT ON COLUMN public.quotes.acceptance_token IS
  'Unguessable URL-safe token issued at send time. Used by the public /q/:token acceptance page. NULL until the quote is sent.';
COMMENT ON COLUMN public.quotes.acceptance_token_expires_at IS
  'Token expiry — defaults to valid_until. Used by the accept-quote edge function to refuse stale acceptance attempts.';

-- ─── 2. quote_acceptances — immutable audit trail of every accept event ────
CREATE TABLE IF NOT EXISTS public.quote_acceptances (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id               uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  signatory_name         text NOT NULL,
  signatory_title        text,
  signatory_email        text NOT NULL,
  authority_to_bind      boolean NOT NULL DEFAULT false,
  agreed_to_msa          boolean NOT NULL DEFAULT false,
  ip_address             inet,
  user_agent             text,
  accepted_at            timestamptz NOT NULL DEFAULT now(),
  fee_schedule_hash      text,
  terms_version          text,
  ach_authorized         boolean NOT NULL DEFAULT false,
  ach_account_holder     text,
  ach_routing_last4      text,
  ach_account_last4      text,
  ach_account_type       text CHECK (ach_account_type IN ('checking','savings') OR ach_account_type IS NULL),
  ach_bank_name          text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_acceptances_quote_id   ON public.quote_acceptances(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_acceptances_accepted_at ON public.quote_acceptances(accepted_at DESC);

COMMENT ON TABLE public.quote_acceptances IS
  'Immutable audit trail of every quote acceptance event. One quote may have multiple rows if the merchant re-signs after a fee-schedule revision, but only the latest determines current status.';
COMMENT ON COLUMN public.quote_acceptances.fee_schedule_hash IS
  'SHA-256 (or similar) of the lines_snapshot at acceptance time, so revisions are auditable.';
COMMENT ON COLUMN public.quote_acceptances.ach_routing_last4 IS
  'Last 4 of the ACH routing number — never store the full number here. Full account details should be tokenized in the billing provider.';

-- ─── 3. RLS policies ───────────────────────────────────────────────────────
ALTER TABLE public.quote_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read quote acceptances" ON public.quote_acceptances;
CREATE POLICY "Staff read quote acceptances"
  ON public.quote_acceptances FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Staff insert quote acceptances" ON public.quote_acceptances;
CREATE POLICY "Staff insert quote acceptances"
  ON public.quote_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());

-- ─── 4. View — quote_acceptance_summary ────────────────────────────────────
CREATE OR REPLACE VIEW public.quote_acceptance_summary AS
SELECT
  q.id                                  AS quote_id,
  q.quote_number,
  q.status,
  q.client_business_name,
  q.sender_email,
  q.opportunity_id,
  q.account_id,
  q.contact_id,
  a.id                                  AS acceptance_id,
  a.signatory_name,
  a.signatory_title,
  a.signatory_email,
  a.accepted_at,
  a.ach_authorized,
  a.terms_version,
  a.ip_address,
  a.fee_schedule_hash
FROM public.quotes q
LEFT JOIN LATERAL (
  SELECT *
  FROM public.quote_acceptances qa
  WHERE qa.quote_id = q.id
  ORDER BY qa.accepted_at DESC
  LIMIT 1
) a ON true;

COMMENT ON VIEW public.quote_acceptance_summary IS
  'One row per quote with the latest acceptance (if any) joined. Drives the "Accepted by …" badge and the Generate Contract affordance.';

GRANT SELECT ON public.quote_acceptance_summary TO authenticated;