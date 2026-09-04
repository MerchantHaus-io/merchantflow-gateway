ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS attribution_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.referrers ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_email_key;
DROP INDEX IF EXISTS public.idx_referrers_email;

CREATE UNIQUE INDEX referrers_email_key
  ON public.referrers (email)
  WHERE email IS NOT NULL;

CREATE INDEX idx_referrers_email ON public.referrers (email);

CREATE INDEX IF NOT EXISTS idx_referrers_attribution_only
  ON public.referrers (attribution_only);
