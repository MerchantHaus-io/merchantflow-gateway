-- Phase 2a: adopt anchor tables into the tenancy model (additive, behaviour-preserving)

-- Resolve tenant on insert: explicit value, else caller's tenant, else legacy tenant.
CREATE OR REPLACE FUNCTION public.set_tenant_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_tenant := public.current_tenant_id();
  EXCEPTION WHEN OTHERS THEN
    v_tenant := NULL;
  END;

  IF v_tenant IS NULL THEN
    SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'merchanthaus';
  END IF;

  NEW.tenant_id := v_tenant;
  RETURN NEW;
END;
$$;

-- 1. Add nullable columns
ALTER TABLE public.accounts      ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.merchants     ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.applications  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 2. Backfill to the legacy tenant
DO $$
DECLARE
  v_legacy uuid;
BEGIN
  SELECT id INTO v_legacy FROM public.tenants WHERE slug = 'merchanthaus';
  IF v_legacy IS NULL THEN
    RAISE EXCEPTION 'legacy MerchantHaus tenant missing - cannot backfill';
  END IF;

  UPDATE public.accounts      SET tenant_id = v_legacy WHERE tenant_id IS NULL;
  UPDATE public.opportunities SET tenant_id = v_legacy WHERE tenant_id IS NULL;
  UPDATE public.merchants     SET tenant_id = v_legacy WHERE tenant_id IS NULL;
  UPDATE public.applications  SET tenant_id = v_legacy WHERE tenant_id IS NULL;
END $$;

-- 3. Verify zero nulls before locking down
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.accounts      WHERE tenant_id IS NULL)
       + (SELECT count(*) FROM public.opportunities WHERE tenant_id IS NULL)
       + (SELECT count(*) FROM public.merchants     WHERE tenant_id IS NULL)
       + (SELECT count(*) FROM public.applications  WHERE tenant_id IS NULL)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % rows still without a tenant', n;
  END IF;
END $$;

-- 4. Constraints, defaults via trigger, indexes
ALTER TABLE public.accounts
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT accounts_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.opportunities
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT opportunities_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.merchants
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT merchants_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.applications
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT applications_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;

CREATE TRIGGER accounts_set_tenant_id
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();
CREATE TRIGGER opportunities_set_tenant_id
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();
CREATE TRIGGER merchants_set_tenant_id
  BEFORE INSERT ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();
CREATE TRIGGER applications_set_tenant_id
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();

CREATE INDEX IF NOT EXISTS accounts_tenant_id_idx      ON public.accounts (tenant_id);
CREATE INDEX IF NOT EXISTS opportunities_tenant_id_idx ON public.opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS merchants_tenant_id_idx     ON public.merchants (tenant_id);
CREATE INDEX IF NOT EXISTS applications_tenant_id_idx  ON public.applications (tenant_id);
