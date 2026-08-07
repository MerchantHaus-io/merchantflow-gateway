-- =========================================================
-- 20260807190000  rate_limit_events
-- =========================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id         bigserial PRIMARY KEY,
  ip         text        NOT NULL,
  endpoint   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
  ON public.rate_limit_events (ip, endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at
  ON public.rate_limit_events (created_at);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;
GRANT ALL ON public.rate_limit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_events_id_seq TO service_role;

COMMENT ON TABLE public.rate_limit_events IS
  'Per-IP request log for public intake endpoints. Service-role only; contains visitor IPs. Rows older than 24h are disposable.';

CREATE OR REPLACE FUNCTION public.prune_rate_limit_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_events
  WHERE created_at < now() - interval '24 hours';
$$;

REVOKE EXECUTE ON FUNCTION public.prune_rate_limit_events() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_events() TO service_role;

-- =========================================================
-- 20260807200000  client_errors
-- =========================================================
CREATE TABLE IF NOT EXISTS public.client_errors (
  id              bigserial PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  error_id        text        NOT NULL,
  message         text        NOT NULL,
  stack           text,
  component_stack text,
  url             text,
  route           text,
  user_email      text,
  user_id         uuid,
  user_agent      text,
  source          text        NOT NULL DEFAULT 'render',
  release         text
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created_at
  ON public.client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_error_id
  ON public.client_errors (error_id);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.client_errors TO anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.client_errors_id_seq TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can report a client error" ON public.client_errors;
CREATE POLICY "Anyone can report a client error"
  ON public.client_errors FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can read client errors" ON public.client_errors;
CREATE POLICY "Staff can read client errors"
  ON public.client_errors FOR SELECT
  TO authenticated
  USING (public.is_internal_staff());

COMMENT ON TABLE public.client_errors IS
  'Front-end crash reports. Insert-only for clients; readable by internal staff. Retention: 30 days.';

CREATE OR REPLACE FUNCTION public.prune_client_errors()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.client_errors
  WHERE created_at < now() - interval '30 days';
$$;

REVOKE EXECUTE ON FUNCTION public.prune_client_errors() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_client_errors() TO service_role;

-- =========================================================
-- 20260807210000  must_change_password -> app_metadata backfill
-- =========================================================
UPDATE auth.users
SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('must_change_password', true)
WHERE COALESCE(raw_user_meta_data ->> 'must_change_password', 'false') = 'true'
  AND COALESCE(raw_app_meta_data ->> 'must_change_password', 'false') <> 'true';

-- =========================================================
-- Retention schedules (pg_cron)
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('prune-rate-limit-events')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-rate-limit-events');

SELECT cron.unschedule('prune-client-errors')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-client-errors');

SELECT cron.schedule('prune-rate-limit-events', '0 * * * *',
                     'SELECT public.prune_rate_limit_events()');

SELECT cron.schedule('prune-client-errors', '30 3 * * *',
                     'SELECT public.prune_client_errors()');