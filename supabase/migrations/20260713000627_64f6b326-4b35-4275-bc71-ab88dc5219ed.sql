
-- 1. Add archived_at column
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_support_tickets_archived_at
  ON public.support_tickets (archived_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_closed_at
  ON public.support_tickets (status, closed_at)
  WHERE status = 'closed' AND archived_at IS NULL;

-- 2. Archive function: mark closed tickets older than 7 days as archived
CREATE OR REPLACE FUNCTION public.archive_stale_closed_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.support_tickets
       SET archived_at = now()
     WHERE status = 'closed'
       AND archived_at IS NULL
       AND closed_at IS NOT NULL
       AND closed_at < now() - interval '7 days'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

-- 3. Schedule hourly archive sweep (idempotent — unschedule prior job if it exists)
DO $$
BEGIN
  PERFORM cron.unschedule('archive-stale-closed-support-tickets');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'archive-stale-closed-support-tickets',
  '17 * * * *',
  $$ SELECT public.archive_stale_closed_tickets(); $$
);

-- 4. One-time backfill: archive any already-stale closed tickets right now
SELECT public.archive_stale_closed_tickets();
