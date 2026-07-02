DO $$
DECLARE
  v_support_id uuid;
  v_jessie_id uuid;
BEGIN
  SELECT id INTO v_support_id FROM public.profiles WHERE email = 'support@merchanthaus.io';
  SELECT id INTO v_jessie_id  FROM public.profiles WHERE email = 'jessie@merchanthaus.io';

  IF v_jessie_id IS NULL AND v_support_id IS NOT NULL THEN
    UPDATE public.profiles
       SET email = 'jessie@merchanthaus.io',
           full_name = COALESCE(full_name, 'Yaseen Sheik')
     WHERE id = v_support_id;
  ELSIF v_jessie_id IS NOT NULL THEN
    UPDATE public.profiles
       SET full_name = COALESCE(NULLIF(full_name, ''), 'Yaseen Sheik')
     WHERE id = v_jessie_id AND (full_name IS NULL OR full_name = '');
  END IF;
END $$;

UPDATE public.team_roster
   SET email = 'jessie@merchanthaus.io',
       aliases = ARRAY(
         SELECT DISTINCT unnest(COALESCE(aliases, '{}'::text[]) || ARRAY['support@merchanthaus.io'])
       )
 WHERE id = 'yaseen';

UPDATE public.opportunities SET assigned_to = 'jessie@merchanthaus.io' WHERE assigned_to = 'support@merchanthaus.io';
UPDATE public.tasks         SET assignee    = 'jessie@merchanthaus.io' WHERE assignee    = 'support@merchanthaus.io';