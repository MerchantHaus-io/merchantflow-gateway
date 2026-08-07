-- Error telemetry sink (audit item #56).
--
-- ErrorBoundary previously only called console.error, so every production
-- crash was invisible unless a user happened to report it. The audit named
-- this a prerequisite for the deeper passes: without a signal, a regression
-- introduced by later work is indistinguishable from working software.
--
-- A table rather than a third-party service, deliberately: it needs no vendor
-- decision, no DSN, and no new dependency, and it works the moment it is
-- applied. src/lib/telemetry.ts keeps a documented seam for forwarding to
-- Sentry later without changing any call site.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Short random id shown to the user, so a support ticket can be tied to a row.
  error_id     text        NOT NULL,
  message      text        NOT NULL,
  stack        text,
  component_stack text,
  -- Where and who.
  url          text,
  route        text,
  user_email   text,
  user_id      uuid,
  user_agent   text,
  -- 'render' (ErrorBoundary), 'window' (onerror), 'promise' (unhandledrejection)
  source       text        NOT NULL DEFAULT 'render',
  -- Build identifier, so a spike can be tied to a specific deploy.
  release      text
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created_at
  ON public.client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_error_id
  ON public.client_errors (error_id);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- Anyone (including signed-out visitors on the public forms and the quote
-- acceptance page) may report a crash. Insert-only: no client can read the
-- table back, since stack traces and URLs can carry sensitive context.
CREATE POLICY "Anyone can report a client error"
  ON public.client_errors FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Staff read the reports.
CREATE POLICY "Staff can read client errors"
  ON public.client_errors FOR SELECT
  TO authenticated
  USING (public.is_internal_staff());

COMMENT ON TABLE public.client_errors IS
  'Front-end crash reports. Insert-only for clients; readable by internal staff. Retention: 30 days.';

-- Retention. Crash reports carry URLs, emails and stack traces; keeping them
-- indefinitely is a liability and they lose value quickly.
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

-- NOTE: schedule this alongside prune_rate_limit_events(). With pg_cron:
--   SELECT cron.schedule('prune-client-errors', '30 3 * * *',
--                        'SELECT public.prune_client_errors()');
