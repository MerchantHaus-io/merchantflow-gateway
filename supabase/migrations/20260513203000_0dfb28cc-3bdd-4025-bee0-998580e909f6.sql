ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'standard';
UPDATE public.referrers SET tier='premium' WHERE email='kenadan55@yahoo.fr';