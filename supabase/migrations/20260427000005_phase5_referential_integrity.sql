-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5: Referential integrity, RLS hardening, and cleanup.
--
-- Includes:
--   1) opportunities.contact_id MUST belong to opportunities.account_id —
--      enforced via BEFORE INSERT OR UPDATE trigger.
--   2) tasks.priority column to match the TS Task type.
--   3) onboarding_wizard_states RLS tightened to authenticated-only
--      (writes from public forms go through edge functions with service role).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Contact must belong to the account.
CREATE OR REPLACE FUNCTION public.assert_opportunity_contact_belongs_to_account()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_account uuid;
BEGIN
  IF NEW.contact_id IS NULL OR NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account_id INTO v_contact_account
  FROM public.contacts
  WHERE id = NEW.contact_id;

  IF v_contact_account IS NULL THEN
    RAISE EXCEPTION 'opportunity %: contact % does not exist', NEW.id, NEW.contact_id;
  END IF;

  IF v_contact_account <> NEW.account_id THEN
    RAISE EXCEPTION 'opportunity %: contact % belongs to account % but opportunity is on account %',
      NEW.id, NEW.contact_id, v_contact_account, NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunities_contact_account_consistency ON public.opportunities;
CREATE TRIGGER trg_opportunities_contact_account_consistency
  BEFORE INSERT OR UPDATE OF account_id, contact_id ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_opportunity_contact_belongs_to_account();

-- 2) tasks.priority — TS type already exposes it; column was missing.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'));

-- 3) onboarding_wizard_states: replace open policies with authenticated-only.
DROP POLICY IF EXISTS "Anyone can view onboarding wizard states"
  ON public.onboarding_wizard_states;
DROP POLICY IF EXISTS "Anyone can create onboarding wizard states"
  ON public.onboarding_wizard_states;
DROP POLICY IF EXISTS "Anyone can update onboarding wizard states"
  ON public.onboarding_wizard_states;
DROP POLICY IF EXISTS "Anyone can delete onboarding wizard states"
  ON public.onboarding_wizard_states;

CREATE POLICY "Authenticated users can view onboarding wizard states"
  ON public.onboarding_wizard_states FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can create onboarding wizard states"
  ON public.onboarding_wizard_states FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update onboarding wizard states"
  ON public.onboarding_wizard_states FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete onboarding wizard states"
  ON public.onboarding_wizard_states FOR DELETE
  TO authenticated USING (true);

-- Service role keeps full access (edge functions writing on behalf of public
-- forms). The default service_role bypass remains in effect.
