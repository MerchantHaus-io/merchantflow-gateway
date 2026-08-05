CREATE TABLE IF NOT EXISTS public.internal_cron_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Server-side only: no privileges for anon/authenticated at all.
GRANT ALL ON public.internal_cron_tokens TO service_role;

ALTER TABLE public.internal_cron_tokens ENABLE ROW LEVEL SECURITY;

-- Deny-all for API roles (service_role bypasses RLS).
CREATE POLICY "No client access to internal cron tokens"
  ON public.internal_cron_tokens FOR SELECT USING (false);

CREATE TRIGGER internal_cron_tokens_touch
  BEFORE UPDATE ON public.internal_cron_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();