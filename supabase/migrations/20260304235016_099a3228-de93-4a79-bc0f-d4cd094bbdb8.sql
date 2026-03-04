-- Allow admins to update any comment (currently only owner can update)
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
CREATE POLICY "Users can update own comments or admin"
ON public.comments
FOR UPDATE
USING ((auth.uid() = user_id) OR is_admin_email());