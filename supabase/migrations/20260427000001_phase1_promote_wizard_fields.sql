-- ─────────────────────────────────────────────────────────────────────────
-- Phase 1: Promote wizard form_state fields to typed columns.
--
-- Motivation:
--   onboarding_wizard_states.form_state (JSONB) was the de-facto source of
--   truth for canonical fields like dba_contact_first_name, monthly_volume,
--   federal_tax_id. The opportunity modal read from BOTH wizard and
--   accounts/contacts with wizard taking precedence — so contact edits in
--   one surface silently diverged from the other.
--
-- After this migration:
--   • accounts has DBA + legal address columns.
--   • opportunities has business profile, legal, and processing columns
--     (plus a single gateway "current_processor" field).
--   • Existing form_state values are backfilled into the new columns where
--     the column is currently NULL. The JSONB blob is left intact for
--     rollback safety; it becomes UI-only (wizard step/scratch) going
--     forward.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) accounts: legal address + DBA second-line columns
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS dba_name             text,
  ADD COLUMN IF NOT EXISTS legal_address_line1  text,
  ADD COLUMN IF NOT EXISTS legal_address_line2  text,
  ADD COLUMN IF NOT EXISTS legal_city           text,
  ADD COLUMN IF NOT EXISTS legal_state          text,
  ADD COLUMN IF NOT EXISTS legal_zip            text,
  ADD COLUMN IF NOT EXISTS legal_country        text DEFAULT 'US';

-- 2) opportunities: business profile + processing + gateway fields
ALTER TABLE public.opportunities
  -- Business profile
  ADD COLUMN IF NOT EXISTS nature_of_business      text,
  ADD COLUMN IF NOT EXISTS product_description     text,
  ADD COLUMN IF NOT EXISTS website_url             text,
  ADD COLUMN IF NOT EXISTS sic_mcc_code            text,
  -- Legal info
  ADD COLUMN IF NOT EXISTS legal_entity_name       text,
  ADD COLUMN IF NOT EXISTS federal_tax_id          text,
  ADD COLUMN IF NOT EXISTS ownership_type          text,
  ADD COLUMN IF NOT EXISTS business_formation_date text,
  ADD COLUMN IF NOT EXISTS state_incorporated      text,
  ADD COLUMN IF NOT EXISTS tax_exempt              boolean DEFAULT false,
  -- Processing profile
  ADD COLUMN IF NOT EXISTS monthly_volume          numeric,
  ADD COLUMN IF NOT EXISTS average_transaction     numeric,
  ADD COLUMN IF NOT EXISTS high_ticket             numeric,
  ADD COLUMN IF NOT EXISTS percent_swiped          numeric,
  ADD COLUMN IF NOT EXISTS percent_keyed           numeric,
  ADD COLUMN IF NOT EXISTS percent_moto            numeric,
  ADD COLUMN IF NOT EXISTS percent_ecommerce       numeric,
  ADD COLUMN IF NOT EXISTS percent_b2b             numeric,
  ADD COLUMN IF NOT EXISTS percent_b2c             numeric,
  -- Gateway (gateway_only service type)
  ADD COLUMN IF NOT EXISTS current_processor       text;

-- 3) Backfill from existing form_state. Numeric fields cast best-effort
--    (strip non-numeric chars first); if cast fails the column stays NULL.
DO $$
DECLARE
  rec RECORD;
  v_text  text;
  v_num   numeric;
BEGIN
  FOR rec IN
    SELECT o.id AS opportunity_id,
           o.account_id,
           o.contact_id,
           ws.form_state
    FROM public.opportunities o
    JOIN public.onboarding_wizard_states ws ON ws.opportunity_id = o.id
    WHERE ws.form_state IS NOT NULL
      AND jsonb_typeof(ws.form_state) = 'object'
  LOOP
    -- Account: DBA name + legal address (only fill if NULL)
    UPDATE public.accounts a SET
      dba_name            = COALESCE(a.dba_name,            NULLIF(rec.form_state->>'dba_name', '')),
      legal_address_line1 = COALESCE(a.legal_address_line1, NULLIF(rec.form_state->>'legal_address_line1', '')),
      legal_address_line2 = COALESCE(a.legal_address_line2, NULLIF(rec.form_state->>'legal_address_line2', '')),
      legal_city          = COALESCE(a.legal_city,          NULLIF(rec.form_state->>'legal_city', '')),
      legal_state         = COALESCE(a.legal_state,         NULLIF(rec.form_state->>'legal_state', '')),
      legal_zip           = COALESCE(a.legal_zip,           NULLIF(rec.form_state->>'legal_zip', '')),
      address2            = COALESCE(a.address2,            NULLIF(rec.form_state->>'dba_address_line2', ''))
    WHERE a.id = rec.account_id;

    -- Contact: only fill from wizard if column is NULL (don't overwrite real data)
    UPDATE public.contacts c SET
      first_name = COALESCE(c.first_name, NULLIF(rec.form_state->>'dba_contact_first_name', '')),
      last_name  = COALESCE(c.last_name,  NULLIF(rec.form_state->>'dba_contact_last_name', '')),
      email      = COALESCE(c.email,      NULLIF(rec.form_state->>'dba_contact_email', '')),
      phone      = COALESCE(c.phone,      NULLIF(rec.form_state->>'dba_contact_phone', ''))
    WHERE c.id = rec.contact_id;

    -- Opportunity: text columns
    UPDATE public.opportunities o SET
      nature_of_business      = COALESCE(o.nature_of_business,      NULLIF(rec.form_state->>'nature_of_business', '')),
      product_description     = COALESCE(o.product_description,     NULLIF(rec.form_state->>'product_description', '')),
      website_url             = COALESCE(o.website_url,             NULLIF(rec.form_state->>'website_url', '')),
      sic_mcc_code            = COALESCE(o.sic_mcc_code,            NULLIF(rec.form_state->>'sic_mcc_code', '')),
      legal_entity_name       = COALESCE(o.legal_entity_name,       NULLIF(rec.form_state->>'legal_entity_name', '')),
      federal_tax_id          = COALESCE(o.federal_tax_id,          NULLIF(rec.form_state->>'federal_tax_id', '')),
      ownership_type          = COALESCE(o.ownership_type,          NULLIF(rec.form_state->>'ownership_type', '')),
      business_formation_date = COALESCE(o.business_formation_date, NULLIF(rec.form_state->>'business_formation_date', '')),
      state_incorporated      = COALESCE(o.state_incorporated,      NULLIF(rec.form_state->>'state_incorporated', '')),
      current_processor       = COALESCE(o.current_processor,       NULLIF(rec.form_state->>'current_processor', ''))
    WHERE o.id = rec.opportunity_id;

    -- Numeric coercion helper inline: try-cast each numeric field
    -- monthly_volume
    v_text := regexp_replace(COALESCE(rec.form_state->>'monthly_volume', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET monthly_volume = COALESCE(o.monthly_volume, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    v_text := regexp_replace(COALESCE(rec.form_state->>'average_transaction', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET average_transaction = COALESCE(o.average_transaction, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    v_text := regexp_replace(COALESCE(rec.form_state->>'high_ticket', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET high_ticket = COALESCE(o.high_ticket, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    -- Percent fields
    v_text := regexp_replace(COALESCE(rec.form_state->>'percent_swiped', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET percent_swiped = COALESCE(o.percent_swiped, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;
    v_text := regexp_replace(COALESCE(rec.form_state->>'percent_keyed', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET percent_keyed = COALESCE(o.percent_keyed, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;
    v_text := regexp_replace(COALESCE(rec.form_state->>'percent_moto', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET percent_moto = COALESCE(o.percent_moto, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;
    v_text := regexp_replace(COALESCE(rec.form_state->>'percent_ecommerce', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET percent_ecommerce = COALESCE(o.percent_ecommerce, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;
    v_text := regexp_replace(COALESCE(rec.form_state->>'percent_b2b', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET percent_b2b = COALESCE(o.percent_b2b, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;
    v_text := regexp_replace(COALESCE(rec.form_state->>'percent_b2c', ''), '[^0-9.\-]', '', 'g');
    IF v_text <> '' THEN
      BEGIN v_num := v_text::numeric;
        UPDATE public.opportunities o SET percent_b2c = COALESCE(o.percent_b2c, v_num) WHERE o.id = rec.opportunity_id;
      EXCEPTION WHEN others THEN NULL; END;
    END IF;
  END LOOP;
END $$;

-- 4) Indexes that aid the new read paths (Live Billing, search, sorting).
CREATE INDEX IF NOT EXISTS idx_opportunities_monthly_volume ON public.opportunities (monthly_volume);
CREATE INDEX IF NOT EXISTS idx_opportunities_federal_tax_id ON public.opportunities (federal_tax_id);
CREATE INDEX IF NOT EXISTS idx_accounts_dba_name           ON public.accounts (dba_name);
