INSERT INTO public.team_roster (id, email, display_name, title, active, color_token, sort_order, is_external, aliases, legacy_names)
VALUES ('jude', 'jude@merchanthaus.io', 'Jude', 'Sales', true, 'border-border', 25, false, ARRAY[]::text[], ARRAY[]::text[])
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  active = true,
  sort_order = EXCLUDED.sort_order;