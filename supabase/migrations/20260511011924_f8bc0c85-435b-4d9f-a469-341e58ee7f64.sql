-- Referrer Portal: schema, RLS helpers, and policies.

CREATE TABLE IF NOT EXISTS public.referrers (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id                uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name                   text NOT NULL,
  email                       text NOT NULL UNIQUE,
  phone                       text,
  active                      boolean NOT NULL DEFAULT true,
  commission_rate             numeric(5,4) NOT NULL DEFAULT 0.1000,
  monthly_cap_per_merchant    numeric(10,2) NOT NULL DEFAULT 1500.00,
  clawback_window_days        integer NOT NULL DEFAULT 90,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrers_auth_user_id ON public.referrers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_referrers_email        ON public.referrers(email);
CREATE INDEX IF NOT EXISTS idx_referrers_active       ON public.referrers(active);

CREATE OR REPLACE FUNCTION public.referrers_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referrers_touch_updated_at ON public.referrers;
CREATE TRIGGER trg_referrers_touch_updated_at
BEFORE UPDATE ON public.referrers
FOR EACH ROW EXECUTE FUNCTION public.referrers_touch_updated_at();

CREATE OR REPLACE FUNCTION public.current_referrer_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.referrers
   WHERE auth_user_id = auth.uid()
     AND active = true
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_referrer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_referrer_id() IS NOT NULL;
$$;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_referrer_id ON public.opportunities(referrer_id);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_referrer_id ON public.accounts(referrer_id);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_applications_referrer_id ON public.applications(referrer_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchants') THEN
    EXECUTE 'ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_merchants_referrer_id ON public.merchants(referrer_id)';
  END IF;
END $$;

ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Referrers can view their own profile" ON public.referrers;
CREATE POLICY "Referrers can view their own profile"
  ON public.referrers FOR SELECT
  USING (auth_user_id = auth.uid() OR public.is_admin_email() OR (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM auth.users
       WHERE id = auth.uid() AND email LIKE '%@merchanthaus.io'
    )
  ));

DROP POLICY IF EXISTS "Admins can manage referrers" ON public.referrers;
CREATE POLICY "Admins can manage referrers"
  ON public.referrers FOR ALL
  USING (public.is_admin_email() OR (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM auth.users
       WHERE id = auth.uid() AND email LIKE '%@merchanthaus.io'
    )
  ))
  WITH CHECK (public.is_admin_email() OR (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM auth.users
       WHERE id = auth.uid() AND email LIKE '%@merchanthaus.io'
    )
  ));

DROP POLICY IF EXISTS "Referrers can view their own opportunities" ON public.opportunities;
CREATE POLICY "Referrers can view their own opportunities"
  ON public.opportunities FOR SELECT
  USING (referrer_id = public.current_referrer_id());

DROP POLICY IF EXISTS "Referrers can view their own accounts" ON public.accounts;
CREATE POLICY "Referrers can view their own accounts"
  ON public.accounts FOR SELECT
  USING (referrer_id = public.current_referrer_id());

DROP POLICY IF EXISTS "Referrers can view their own applications" ON public.applications;
CREATE POLICY "Referrers can view their own applications"
  ON public.applications FOR SELECT
  USING (referrer_id = public.current_referrer_id());

DROP POLICY IF EXISTS "Referrers can submit applications" ON public.applications;
CREATE POLICY "Referrers can submit applications"
  ON public.applications FOR INSERT
  WITH CHECK (
    public.is_referrer()
    AND referrer_id = public.current_referrer_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchants') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Referrers can view their own merchants" ON public.merchants';
    EXECUTE $POL$
      CREATE POLICY "Referrers can view their own merchants"
        ON public.merchants FOR SELECT
        USING (referrer_id = public.current_referrer_id())
    $POL$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.link_opportunity_to_referrer(
  p_opportunity_id uuid,
  p_application_email text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  SELECT referrer_id INTO v_referrer_id
    FROM public.applications
   WHERE referrer_id IS NOT NULL
     AND lower(email) = lower(p_application_email)
     AND created_at > now() - interval '90 days'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_referrer_id IS NOT NULL THEN
    UPDATE public.opportunities
       SET referrer_id = v_referrer_id
     WHERE id = p_opportunity_id
       AND referrer_id IS NULL;

    UPDATE public.accounts a
       SET referrer_id = v_referrer_id
      FROM public.opportunities o
     WHERE o.id = p_opportunity_id
       AND o.account_id = a.id
       AND a.referrer_id IS NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'commission_records') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view commission records" ON public.commission_records';
    EXECUTE $POL$
      CREATE POLICY "Internal staff can view all commission records"
        ON public.commission_records FOR SELECT
        USING (
          auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1 FROM auth.users
             WHERE id = auth.uid()
               AND email LIKE '%@merchanthaus.io'
          )
        )
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "Referrers can view their own commission records"
        ON public.commission_records FOR SELECT
        USING (
          account_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.accounts a
             WHERE a.id = commission_records.account_id
               AND a.referrer_id = public.current_referrer_id()
          )
        )
    $POL$;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.referrer_commission_records AS
SELECT
  cr.id                        AS record_id,
  cr.period_id,
  cp.period_start,
  cp.period_end,
  cr.account_id,
  cr.company_name,
  cr.transaction_volume,
  cr.transaction_count,
  cr.total_commission          AS company_commission,
  a.referrer_id,
  r.commission_rate,
  r.monthly_cap_per_merchant,
  (cr.total_commission * r.commission_rate)                                    AS uncapped_payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0
      THEN LEAST(cr.total_commission * r.commission_rate, r.monthly_cap_per_merchant)
    ELSE cr.total_commission * r.commission_rate
  END                                                                          AS payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0
     AND (cr.total_commission * r.commission_rate) > r.monthly_cap_per_merchant
      THEN true
    ELSE false
  END                                                                          AS at_cap
FROM public.commission_records cr
JOIN public.accounts        a  ON a.id = cr.account_id
JOIN public.referrers       r  ON r.id = a.referrer_id
JOIN public.commission_periods cp ON cp.id = cr.period_id;

COMMENT ON VIEW public.referrer_commission_records IS 'Per-merchant per-period referrer payout with monthly cap applied.';
COMMENT ON TABLE public.referrers IS 'External referral partners with read-only portal access.';
COMMENT ON COLUMN public.referrers.commission_rate IS 'Decimal share of monthly net revenue per referred merchant. 0.10 = 10%.';
COMMENT ON COLUMN public.referrers.monthly_cap_per_merchant IS 'USD cap per merchant per month. 0 = no cap.';