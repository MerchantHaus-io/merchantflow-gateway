-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3: Stage transition automation.
--
-- Motivation:
--   Stage updates today write directly to opportunities.stage with no SLA
--   timer reset, no auto-doc-request on Qualified, and emails fire-and-
--   forget from the client. Network drops or modal dismounts swallow the
--   notifications.
--
-- After this migration:
--   • A trigger AFTER UPDATE OF stage fires on every transition. It writes
--     the activity audit row, resets stage_entered_at, recomputes
--     sla_status, and inserts a row into the new stage_change_events
--     outbox.
--   • The on-stage-change edge function (separate file) processes the
--     outbox: sends email, queues qualified-stage doc requests, creates
--     re-engagement tasks. Network failure = retry, never silent loss.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Outbox table. Pending rows are picked up by the edge function.
CREATE TABLE IF NOT EXISTS public.stage_change_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  old_stage       text,
  new_stage       text NOT NULL,
  assigned_to     text,
  changed_by      text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_change_events_status_check CHECK (status IN ('pending', 'processing', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_stage_change_events_status_created
  ON public.stage_change_events (status, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.stage_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stage_change_events"
  ON public.stage_change_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage stage_change_events"
  ON public.stage_change_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Helper: SLA budget per stage in hours. Mirrors STAGE_CONFIG. If a
--    stage isn't here it defaults to 72 hours.
CREATE OR REPLACE FUNCTION public.stage_sla_hours(p_stage text)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'discovery'           THEN 48
    WHEN 'qualified'           THEN 48
    WHEN 'application_prep'    THEN 72
    WHEN 'underwriting_review' THEN 120
    WHEN 'processor_approval'  THEN 72
    WHEN 'gateway_submitted'   THEN 48
    WHEN 'integration_setup'   THEN 120
    WHEN 'testing'             THEN 72
    WHEN 'go_live_ready'       THEN 24
    WHEN 'closed_won'          THEN 0
    ELSE 72
  END;
$$;

-- 3) Trigger: fires only on real stage transitions. Wraps the audit +
--    sla reset + outbox enqueue in one server-side commit.
CREATE OR REPLACE FUNCTION public.on_stage_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  -- Reset SLA timer + status. The /sla-escalation function already grades
  -- based on stage_entered_at; status starts green.
  NEW.stage_entered_at := now();
  NEW.sla_status := 'green';

  -- Audit row.
  INSERT INTO public.activities (
    opportunity_id, type, description, user_id, user_email
  ) VALUES (
    NEW.id,
    'stage_change',
    format('Stage: %s → %s', COALESCE(OLD.stage, '∅'), NEW.stage),
    NULL,
    NULL
  );

  -- Outbox row. Edge function reads pending and dispatches.
  INSERT INTO public.stage_change_events (
    opportunity_id, account_id, old_stage, new_stage, assigned_to,
    payload
  ) VALUES (
    NEW.id,
    NEW.account_id,
    OLD.stage,
    NEW.stage,
    NEW.assigned_to,
    jsonb_build_object(
      'sla_hours', public.stage_sla_hours(NEW.stage),
      'service_type', NEW.service_type
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_stage_change ON public.opportunities;
CREATE TRIGGER trg_on_stage_change
  BEFORE UPDATE OF stage ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.on_stage_change();
