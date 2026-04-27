-- ─────────────────────────────────────────────────────────────────────────
-- Phase 2: Billing layer + document archive on close-won.
--
-- Motivation:
--   LiveBilling.tsx today reads `select * from opportunities where
--   outcome_status='closed_won'`. There is no live_accounts table and no
--   document archive — if an opportunity is deleted, the live account and
--   its docs vanish. commission_records link by nmi_gateway_id, never to
--   the opportunity that closed.
--
-- After this migration:
--   • billing_accounts is the canonical row for an active customer (1:1
--     with accounts).
--   • account_documents archives docs at close-won so post-deal access
--     does not depend on the opportunity row.
--   • commission_records.billing_account_id ties commissions to the
--     billing account directly (the existing account_id stays for legacy).
--   • on_outcome_closed_won() trigger fires when an opportunity transitions
--     to closed_won: upserts billing_accounts, copies docs, sets the
--     account active.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) billing_accounts: 1:1 with accounts. UNIQUE on account_id enforces it.
CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_opportunity_id  uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  nmi_gateway_id         text,
  commission_model       text NOT NULL DEFAULT 'gateway_only',
  merchant_rate_pct      numeric(6,4),
  interchange_rate_pct   numeric(6,4),
  revenue_share_pct      numeric(5,2),
  status                 text NOT NULL DEFAULT 'active',
  activated_at           timestamptz NOT NULL DEFAULT now(),
  deactivated_at         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_accounts_account_id_unique UNIQUE (account_id),
  CONSTRAINT billing_accounts_status_check      CHECK (status IN ('active', 'inactive', 'suspended')),
  CONSTRAINT billing_accounts_model_check       CHECK (commission_model IN ('gateway_only', 'processing'))
);

CREATE INDEX IF NOT EXISTS idx_billing_accounts_account ON public.billing_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_gateway ON public.billing_accounts(nmi_gateway_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_status  ON public.billing_accounts(status);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view billing_accounts"
  ON public.billing_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage billing_accounts"
  ON public.billing_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage billing_accounts"
  ON public.billing_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_billing_accounts_updated_at
  BEFORE UPDATE ON public.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) account_documents: archived copies of opportunity documents on close-won.
--    Original `documents` rows stay (deal-scope); these survive opportunity
--    deletion (account-scope).
CREATE TABLE IF NOT EXISTS public.account_documents (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_opportunity_id  uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  source_document_id     uuid,  -- NOT a hard FK — original doc may be deleted
  file_name              text NOT NULL,
  file_path              text NOT NULL,
  file_size              integer,
  content_type           text,
  document_type          text,
  uploaded_by            text,
  archived_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_documents_account ON public.account_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_account_documents_source  ON public.account_documents(source_opportunity_id);

ALTER TABLE public.account_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view account_documents"
  ON public.account_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage account_documents"
  ON public.account_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage account_documents"
  ON public.account_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) commission_records.billing_account_id — link commissions to the
--    billing account (preserving the old account_id for legacy queries).
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS billing_account_id uuid
    REFERENCES public.billing_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_records_billing_account
  ON public.commission_records(billing_account_id);

-- 4) on_outcome_closed_won trigger: fires when outcome_status transitions
--    to 'closed_won'. Idempotent (UPSERTs on conflict; document copies
--    skip rows that already exist for this account+source_document_id).
CREATE OR REPLACE FUNCTION public.on_outcome_closed_won()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_billing_id uuid;
BEGIN
  -- Only fire on a real transition INTO closed_won.
  IF NOT (NEW.outcome_status = 'closed_won'
          AND (OLD.outcome_status IS DISTINCT FROM NEW.outcome_status)) THEN
    RETURN NEW;
  END IF;

  -- Upsert billing_accounts. Carry over commission rate config from the
  -- account if it has one (legacy columns from migration 20260426000000).
  INSERT INTO public.billing_accounts (
    account_id,
    source_opportunity_id,
    nmi_gateway_id,
    commission_model,
    merchant_rate_pct,
    interchange_rate_pct,
    revenue_share_pct,
    status,
    activated_at
  )
  SELECT
    NEW.account_id,
    NEW.id,
    a.nmi_merchant_id,
    COALESCE(a.commission_model, 'gateway_only'),
    a.merchant_rate_pct,
    a.interchange_rate_pct,
    a.revenue_share_pct,
    'active',
    now()
  FROM public.accounts a
  WHERE a.id = NEW.account_id
  ON CONFLICT (account_id) DO UPDATE SET
    source_opportunity_id = EXCLUDED.source_opportunity_id,
    status                = 'active',
    deactivated_at        = NULL,
    updated_at            = now()
  RETURNING id INTO v_billing_id;

  -- Backfill commission_records.billing_account_id where missing.
  UPDATE public.commission_records cr
  SET billing_account_id = v_billing_id
  WHERE cr.billing_account_id IS NULL
    AND cr.account_id = NEW.account_id;

  -- Mark the account active (sticky).
  UPDATE public.accounts
  SET status = 'active'
  WHERE id = NEW.account_id
    AND (status IS NULL OR status <> 'active');

  -- Archive opportunity documents into account_documents (skip duplicates).
  INSERT INTO public.account_documents (
    account_id,
    source_opportunity_id,
    source_document_id,
    file_name,
    file_path,
    file_size,
    content_type,
    document_type,
    uploaded_by
  )
  SELECT
    NEW.account_id,
    NEW.id,
    d.id,
    d.file_name,
    d.file_path,
    d.file_size,
    d.content_type,
    d.document_type,
    d.uploaded_by
  FROM public.documents d
  WHERE d.opportunity_id = NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM public.account_documents ad
      WHERE ad.account_id = NEW.account_id
        AND ad.source_document_id = d.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_outcome_closed_won ON public.opportunities;
CREATE TRIGGER trg_on_outcome_closed_won
  AFTER UPDATE OF outcome_status ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.on_outcome_closed_won();

-- 5) Backfill: for every existing closed-won opportunity, ensure a
--    billing_accounts row exists (latest closed-won wins per account).
INSERT INTO public.billing_accounts (
  account_id,
  source_opportunity_id,
  nmi_gateway_id,
  commission_model,
  merchant_rate_pct,
  interchange_rate_pct,
  revenue_share_pct,
  status,
  activated_at
)
SELECT
  latest.account_id,
  latest.opportunity_id,
  a.nmi_merchant_id,
  COALESCE(a.commission_model, 'gateway_only'),
  a.merchant_rate_pct,
  a.interchange_rate_pct,
  a.revenue_share_pct,
  'active',
  COALESCE(latest.outcome_closed_at, now())
FROM (
  SELECT DISTINCT ON (o.account_id)
    o.account_id,
    o.id AS opportunity_id,
    o.outcome_closed_at
  FROM public.opportunities o
  WHERE o.outcome_status = 'closed_won'
  ORDER BY o.account_id, o.outcome_closed_at DESC NULLS LAST
) latest
JOIN public.accounts a ON a.id = latest.account_id
ON CONFLICT (account_id) DO NOTHING;

-- Backfill commission_records.billing_account_id from the new table.
UPDATE public.commission_records cr
SET billing_account_id = ba.id
FROM public.billing_accounts ba
WHERE cr.billing_account_id IS NULL
  AND cr.account_id = ba.account_id;

-- Backfill account_documents from any closed-won opportunity that has docs.
INSERT INTO public.account_documents (
  account_id,
  source_opportunity_id,
  source_document_id,
  file_name,
  file_path,
  file_size,
  content_type,
  document_type,
  uploaded_by,
  archived_at
)
SELECT
  o.account_id,
  o.id,
  d.id,
  d.file_name,
  d.file_path,
  d.file_size,
  d.content_type,
  d.document_type,
  d.uploaded_by,
  COALESCE(o.outcome_closed_at, now())
FROM public.documents d
JOIN public.opportunities o ON o.id = d.opportunity_id
WHERE o.outcome_status = 'closed_won'
  AND NOT EXISTS (
    SELECT 1 FROM public.account_documents ad
    WHERE ad.account_id = o.account_id
      AND ad.source_document_id = d.id
  );
