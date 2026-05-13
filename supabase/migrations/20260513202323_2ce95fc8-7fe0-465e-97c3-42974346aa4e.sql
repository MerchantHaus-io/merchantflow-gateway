
ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS lifetime_cap_per_merchant numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS account_ceiling integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS bonus_amount numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS bonus_milestone_count integer NOT NULL DEFAULT 5;

UPDATE public.referrers
   SET commission_rate = 0.50,
       lifetime_cap_per_merchant = 500,
       account_ceiling = 10,
       bonus_amount = 500,
       bonus_milestone_count = 5;
