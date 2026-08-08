GRANT SELECT ON public.rate_limit_events TO authenticated;
GRANT ALL ON public.rate_limit_events TO service_role;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rate_limit_events_staff_read" ON public.rate_limit_events;
CREATE POLICY "rate_limit_events_staff_read" ON public.rate_limit_events FOR SELECT TO authenticated USING (public.is_internal_staff());