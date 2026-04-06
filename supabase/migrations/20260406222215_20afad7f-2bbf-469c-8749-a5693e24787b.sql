
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
      AND email IN ('admin@merchanthaus.io', 'onboarding@merchanthaus.io', 'jamie@merchanthaus.io')
  )
$function$;
