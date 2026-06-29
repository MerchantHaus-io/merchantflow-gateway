
-- A. Remove admin@ alias from Jamie so admin email resolves to Darryn
UPDATE public.team_roster SET aliases = '{}' WHERE id = 'jamie';

-- C. Deregister sales@merchanthaus.io
DELETE FROM public.team_roster WHERE email = 'sales@merchanthaus.io' OR id = 'sales';

DO $$
DECLARE sales_id uuid;
BEGIN
  SELECT id INTO sales_id FROM auth.users WHERE email = 'sales@merchanthaus.io';
  IF sales_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = sales_id;
    DELETE FROM public.profiles WHERE id = sales_id;
    DELETE FROM auth.users WHERE id = sales_id;
  END IF;
  -- Also nuke any orphan profiles row keyed by email
  DELETE FROM public.profiles WHERE email = 'sales@merchanthaus.io';
END $$;
