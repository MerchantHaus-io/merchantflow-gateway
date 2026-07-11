GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_calendar_tokens TO authenticated;

CREATE POLICY "Users manage their own google tokens"
ON public.google_calendar_tokens
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);