-- ─────────────────────────────────────────────────────────────────────────
-- Phase 4: Auto-graduate accounts.status from opportunity lifecycle.
--
-- Motivation:
--   accounts.status is set today at backfill (one-shot) and the existing
--   "leads" page filters manually. Without a trigger, opening or losing
--   an opportunity does not move the account between states, so the
--   filters drift over time.
--
-- Rules (recomputed for the affected account on every relevant write):
--   • Any closed-won opportunity ever          → 'active' (sticky)
--   • Else any opportunity with status='active'
--     and outcome_status IS NULL                → 'active'
--   • Else any opportunity exists at all
--     (i.e., all are dead/lost/disqualified)    → 'dead'
--   • No opportunities                          → 'lead'
--
-- The trigger fires on INSERT/UPDATE/DELETE of opportunities.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_account_status(p_account_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_new_status text;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN;
  END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.account_id = p_account_id
        AND o.outcome_status = 'closed_won'
    ) THEN 'active'
    WHEN EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.account_id = p_account_id
        AND o.status = 'active'
        AND o.outcome_status IS NULL
    ) THEN 'active'
    WHEN EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.account_id = p_account_id
    ) THEN 'dead'
    ELSE 'lead'
  END
  INTO v_new_status;

  UPDATE public.accounts
  SET status = v_new_status
  WHERE id = p_account_id
    AND (status IS NULL OR status IS DISTINCT FROM v_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.opportunities_account_status_sync()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_account_status(OLD.account_id);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_account_status(NEW.account_id);
  -- If account_id changed (rare), also recompute the old one.
  IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    PERFORM public.recompute_account_status(OLD.account_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunities_account_status_sync ON public.opportunities;
CREATE TRIGGER trg_opportunities_account_status_sync
  AFTER INSERT OR UPDATE OF status, outcome_status, account_id OR DELETE
  ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.opportunities_account_status_sync();

-- One-shot reconcile so existing accounts converge to the rule.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.accounts LOOP
    PERFORM public.recompute_account_status(rec.id);
  END LOOP;
END $$;
