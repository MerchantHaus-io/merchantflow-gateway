-- Recording a Closed Won outcome sets opportunities.status = 'won', but the
-- original column CHECK constraint only permitted ('active','dead'). That made
-- every Closed Won update fail with a check-constraint violation while all
-- other outcomes (which write 'dead') succeeded. Widen the constraint to
-- allow 'won'.

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_status_check;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('active', 'dead', 'won'));
