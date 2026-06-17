
DO $$
DECLARE
  sales_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO sales_id FROM auth.users WHERE email = 'sales@merchanthaus.io';
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@merchanthaus.io';
  IF sales_id IS NULL THEN RETURN; END IF;

  UPDATE public.tasks SET assignee = 'admin@merchanthaus.io' WHERE assignee = 'sales@merchanthaus.io';
  UPDATE public.tasks SET assignee = 'Darryn' WHERE assignee IN ('Sales','Wesley');
  UPDATE public.tasks SET created_by = 'admin@merchanthaus.io' WHERE created_by = 'sales@merchanthaus.io';

  UPDATE public.opportunities SET assigned_to = 'admin@merchanthaus.io' WHERE assigned_to = 'sales@merchanthaus.io';
  UPDATE public.opportunities SET assigned_to = 'Darryn' WHERE assigned_to IN ('Sales','Wesley');

  UPDATE public.action_items
    SET assigned_to = array_replace(assigned_to, 'sales@merchanthaus.io', 'admin@merchanthaus.io')
    WHERE 'sales@merchanthaus.io' = ANY(assigned_to);

  -- chat_channels has no ON DELETE rule; reassign
  UPDATE public.chat_channels SET created_by = admin_id WHERE created_by = sales_id;

  DELETE FROM public.team_roster WHERE email = 'sales@merchanthaus.io';
  DELETE FROM auth.users WHERE id = sales_id;
END $$;
