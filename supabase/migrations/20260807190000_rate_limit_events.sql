-- Backing store for per-IP rate limiting on the public intake endpoints.
--
-- submit-merchant-application, submit-scoping-request, submit-support-ticket,
-- send-contact-form-email and accept-quote all run with verify_jwt = false —
-- an anonymous visitor has no session, so they must. That makes them the one
-- surface a stranger can hit at will, and until now with no ceiling.
--
-- Postgres rather than in-memory state: edge functions are horizontally
-- scaled and short-lived, so a per-process Map would reset constantly and see
-- only a fraction of the traffic.

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id         bigserial PRIMARY KEY,
  ip         text        NOT NULL,
  endpoint   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The lookup is always (ip, endpoint, created_at >= window start).
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
  ON public.rate_limit_events (ip, endpoint, created_at DESC);

-- Supports the retention sweep below.
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at
  ON public.rate_limit_events (created_at);

-- Written and read only by the service role from inside edge functions.
-- RLS on with no policies means no anon or authenticated client can read the
-- table — it holds visitor IP addresses.
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;

COMMENT ON TABLE public.rate_limit_events IS
  'Per-IP request log for public intake endpoints. Service-role only; contains visitor IPs. Rows older than 24h are disposable.';

-- Retention: the longest window in use is minutes, so nothing older than a day
-- has any value, and keeping visitor IPs longer than necessary is a liability.
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

-- NOTE: schedule this. If pg_cron is enabled:
--   SELECT cron.schedule('prune-rate-limit-events', '0 * * * *',
--                        'SELECT public.prune_rate_limit_events()');
-- Otherwise call it from an existing scheduled edge function. Without a
-- schedule the table grows unbounded.
