-- ─────────────────────────────────────────────────────────────────────────
-- Backfill accounts.status so the renamed "Leads" page has a meaningful
-- default filter.
--
-- Background:
--   The CRM page previously labelled "Accounts" is being renamed to
--   "Leads". It now defaults to showing status = 'lead'. Existing
--   accounts predate this convention and largely have status = NULL.
--
-- Rules (only applied where accounts.status IS NULL — manual tags win):
--   • No opportunities for this account        → 'lead'
--   • At least one opportunity that is not
--     dead/closed (status='active' AND
--     outcome_status IS NULL)                  → 'active'
--   • Otherwise (all opportunities closed/dead) → 'dead'
--
-- Safety:
--   • No triggers fire email on accounts.status changes (verified against
--     migrations 20260103040851 and 20260319153256). Email triggers live
--     on opportunities and tasks only.
--   • Respects any manually-set status (WHERE status IS NULL).
--   • Idempotent: running it again is a no-op because statuses are set.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE public.accounts a
SET status = CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM public.opportunities o WHERE o.account_id = a.id
  ) THEN 'lead'
  WHEN EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.account_id = a.id
      AND o.status = 'active'
      AND o.outcome_status IS NULL
  ) THEN 'active'
  ELSE 'dead'
END
WHERE a.status IS NULL;
