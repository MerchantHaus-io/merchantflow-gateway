-- ─────────────────────────────────────────────────────────────────────────────
-- Office Simulator onboarding: persistent avatar + desk-slot mapping
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.office_avatars (
  email         text PRIMARY KEY,
  name          text NOT NULL,
  title         text NOT NULL DEFAULT 'Team',
  desk_x        integer NOT NULL,
  desk_z        integer NOT NULL,
  shirt_color   integer NOT NULL,
  hair_color    integer NOT NULL DEFAULT 2759184,   -- 0x2a1a10
  skin_color    integer NOT NULL DEFAULT 14726794,  -- 0xe0b48a
  hairstyle     text,
  scale         numeric NOT NULL DEFAULT 1.0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (desk_x, desk_z)
);

ALTER TABLE public.office_avatars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can read office avatars" ON public.office_avatars;
CREATE POLICY "Team can read office avatars"
  ON public.office_avatars FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Users can update their own avatar" ON public.office_avatars;
CREATE POLICY "Users can update their own avatar"
  ON public.office_avatars FOR UPDATE
  TO authenticated
  USING (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())))
  WITH CHECK (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE OR REPLACE FUNCTION public.office_avatars_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_office_avatars_touch ON public.office_avatars;
CREATE TRIGGER trg_office_avatars_touch
BEFORE UPDATE ON public.office_avatars
FOR EACH ROW EXECUTE FUNCTION public.office_avatars_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding logic: deterministic colors + next-free desk slot
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_office_avatar(p_email text)
RETURNS public.office_avatars
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_local text;
  v_name  text;
  v_hash  bigint;
  v_hue   int;
  v_shirt int;
  v_slot  record;
  v_row   public.office_avatars;
  -- Desk pool: 6 original + 8 overflow desks.
  v_slots int[][] := ARRAY[
    ARRAY[-10,-16], ARRAY[-2,-16], ARRAY[6,-16],
    ARRAY[-6,-8],   ARRAY[2,-8],   ARRAY[10,-8],
    ARRAY[-10,0],   ARRAY[-2,0],   ARRAY[6,0],   ARRAY[10,0],
    ARRAY[-10,8],   ARRAY[-6,8],   ARRAY[2,8],   ARRAY[10,8]
  ];
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_email NOT LIKE '%@merchanthaus.io' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.office_avatars WHERE email = v_email;
  IF FOUND THEN RETURN v_row; END IF;

  v_local := split_part(v_email, '@', 1);
  v_name  := initcap(replace(replace(replace(v_local, '.', ' '), '_', ' '), '-', ' '));

  -- Deterministic hue from email
  v_hash := 0;
  FOR i IN 1..length(v_email) LOOP
    v_hash := ((v_hash << 5) - v_hash + ascii(substr(v_email, i, 1))) & x'FFFFFFFF'::bigint;
  END LOOP;
  v_hue := (abs(v_hash) % 360)::int;
  -- HSL(hue, 0.55, 0.5) → hex (approximation via RGB conversion)
  v_shirt := (
    ((128 + ((v_hue * 70) % 127))::int << 16) |
    ((96  + ((v_hue * 53) % 127))::int << 8)  |
    ( 80  + ((v_hue * 41) % 127))::int
  );

  -- Pick first unused desk slot in pool
  FOR i IN 1..array_length(v_slots, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.office_avatars
       WHERE desk_x = v_slots[i][1] AND desk_z = v_slots[i][2]
    ) THEN
      v_slot := ROW(v_slots[i][1], v_slots[i][2]);
      EXIT;
    END IF;
  END LOOP;

  -- Overflow safety: stack remaining new users along z=16
  IF v_slot IS NULL THEN
    v_slot := ROW(
      ((SELECT COUNT(*) FROM public.office_avatars) * 4 - 12)::int,
      16
    );
  END IF;

  INSERT INTO public.office_avatars (email, name, title, desk_x, desk_z, shirt_color)
  VALUES (v_email, v_name, 'Team', (v_slot.f1)::int, (v_slot.f2)::int, v_shirt)
  ON CONFLICT (email) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM public.office_avatars WHERE email = v_email;
  END IF;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_office_avatar(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger on profiles → auto-onboard any new @merchanthaus.io teammate
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.profiles_onboard_office_avatar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND lower(NEW.email) LIKE '%@merchanthaus.io' THEN
    PERFORM public.ensure_office_avatar(NEW.email);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_onboard_office_avatar ON public.profiles;
CREATE TRIGGER trg_profiles_onboard_office_avatar
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_onboard_office_avatar();

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'office_avatars'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.office_avatars;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- One-time backfill for existing @merchanthaus.io profiles
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT email FROM public.profiles
     WHERE email IS NOT NULL
       AND lower(email) LIKE '%@merchanthaus.io'
       AND NOT EXISTS (SELECT 1 FROM public.office_avatars oa WHERE oa.email = lower(profiles.email))
  LOOP
    PERFORM public.ensure_office_avatar(r.email);
  END LOOP;
END $$;