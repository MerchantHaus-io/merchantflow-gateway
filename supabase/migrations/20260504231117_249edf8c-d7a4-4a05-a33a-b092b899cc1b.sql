
CREATE POLICY "Service role only access to google_calendar_tokens"
ON public.google_calendar_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
