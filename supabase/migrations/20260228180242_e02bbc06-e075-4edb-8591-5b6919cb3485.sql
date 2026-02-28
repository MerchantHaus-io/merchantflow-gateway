
-- Change default stage for new opportunities from application_started to discovery
ALTER TABLE public.opportunities ALTER COLUMN stage SET DEFAULT 'discovery';
