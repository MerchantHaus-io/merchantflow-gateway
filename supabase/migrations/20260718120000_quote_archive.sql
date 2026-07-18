-- Quote archiving — soft-delete, primarily for accepted quotes.
--
-- Accepted quotes are contractual records with an immutable acceptance audit
-- trail (public.quote_acceptances, which cascade-deletes with the quote). They
-- must never be hard-deleted, as that would silently destroy the audit. So
-- "deleting" an accepted quote instead sets archived_at: the quote disappears
-- from every UI list but the row and its acceptance audit are preserved and the
-- action is reversible (restore = clear archived_at).
--
-- Drafts keep their existing simple hard-delete in SavedDraftsPanel; only the
-- accepted-quote flow uses archiving.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS archived_at       timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_by_email text;

CREATE INDEX IF NOT EXISTS idx_quotes_archived_at ON public.quotes(archived_at);

COMMENT ON COLUMN public.quotes.archived_at IS
  'Soft-delete timestamp. When set, the quote is hidden from all UI lists but preserved (with its acceptance audit) and restorable. Accepted quotes are archived rather than hard-deleted so the audit trail survives.';

-- Recreate the summary view exposing archived_at so the UI can filter archived
-- quotes out (or in, when explicitly showing archived). CREATE OR REPLACE
-- requires existing columns to keep their order; the new column is appended.
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
  a.fee_schedule_hash,
  q.archived_at
FROM public.quotes q
LEFT JOIN LATERAL (
  SELECT *
  FROM public.quote_acceptances qa
  WHERE qa.quote_id = q.id
  ORDER BY qa.accepted_at DESC
  LIMIT 1
) a ON true;

GRANT SELECT ON public.quote_acceptance_summary TO authenticated;
