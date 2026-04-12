ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS portal_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web_form';

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS portal_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web_form';

CREATE INDEX IF NOT EXISTS idx_applications_portal_merchant_id
  ON public.applications(portal_merchant_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_portal_merchant_id
  ON public.opportunities(portal_merchant_id);