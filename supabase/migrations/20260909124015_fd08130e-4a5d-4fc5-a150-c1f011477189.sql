-- Column-level default so inserts that omit the organization still work
CREATE OR REPLACE FUNCTION public.default_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  BEGIN
    v_tenant := public.current_tenant_id();
  EXCEPTION WHEN OTHERS THEN
    v_tenant := NULL;
  END;

  IF v_tenant IS NULL THEN
    SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'merchanthaus';
  END IF;

  RETURN v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.default_tenant_id() TO anon, authenticated, service_role;

ALTER TABLE public.accounts      ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.opportunities ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.merchants     ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.applications  ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();