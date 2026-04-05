
-- Add RLS policies for user_roles table
CREATE POLICY "Authenticated users can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (is_admin_email());

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (is_admin_email());

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (is_admin_email());

-- Insert missing admin role for Jamie
INSERT INTO public.user_roles (user_id, role)
VALUES ('f1168d85-6037-41c0-a0f7-0d64e9103ba0', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
