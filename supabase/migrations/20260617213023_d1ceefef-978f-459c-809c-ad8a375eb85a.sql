-- Remove onboarding@merchanthaus.io as an ops-terminal user.
-- Reassign all owned work to admin@merchanthaus.io (Darryn).

UPDATE public.tasks
   SET assignee = 'admin@merchanthaus.io'
 WHERE assignee = 'onboarding@merchanthaus.io';

UPDATE public.action_items
   SET assigned_to = array_replace(assigned_to, 'onboarding@merchanthaus.io', 'admin@merchanthaus.io')
 WHERE 'onboarding@merchanthaus.io' = ANY(assigned_to);

-- Drop admin role + profile, then delete the auth user.
DELETE FROM public.user_roles
 WHERE user_id IN (SELECT id FROM public.profiles WHERE email = 'onboarding@merchanthaus.io');

DELETE FROM public.profiles WHERE email = 'onboarding@merchanthaus.io';

DELETE FROM auth.users WHERE email = 'onboarding@merchanthaus.io';

-- Tighten admin-email helper: onboarding is no longer an admin identity.
CREATE OR REPLACE FUNCTION public.is_admin_email()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND email IN ('admin@merchanthaus.io', 'jamie@merchanthaus.io')
  )
$function$;
