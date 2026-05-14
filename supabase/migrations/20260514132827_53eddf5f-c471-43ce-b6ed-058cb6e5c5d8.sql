-- Add alias column to referrers (optional handle/nickname)
ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS alias text;

-- Audit log for admin "login as referrer" backdoor
CREATE TABLE IF NOT EXISTS public.referrer_impersonation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referrer_email text NOT NULL,
  admin_user_id uuid NOT NULL,
  admin_email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_impersonation_referrer ON public.referrer_impersonation_logs(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ref_impersonation_created ON public.referrer_impersonation_logs(created_at DESC);

ALTER TABLE public.referrer_impersonation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view impersonation logs"
  ON public.referrer_impersonation_logs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role manages impersonation logs"
  ON public.referrer_impersonation_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
