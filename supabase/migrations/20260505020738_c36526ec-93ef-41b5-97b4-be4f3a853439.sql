ALTER TABLE public.team_roster
ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;