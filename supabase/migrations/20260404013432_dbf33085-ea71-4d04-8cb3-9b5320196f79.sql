
-- Update is_admin_email function to use it@ instead of darryn@
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
      AND email IN ('admin@merchanthaus.io', 'it@merchanthaus.io')
  )
$function$;

-- Update profile email
UPDATE public.profiles
SET email = 'it@merchanthaus.io'
WHERE email = 'darryn@merchanthaus.io';
