
-- Fix accounts INSERT policy to require authentication
DROP POLICY IF EXISTS "Authenticated users can create accounts" ON public.accounts;
CREATE POLICY "Authenticated users can create accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
