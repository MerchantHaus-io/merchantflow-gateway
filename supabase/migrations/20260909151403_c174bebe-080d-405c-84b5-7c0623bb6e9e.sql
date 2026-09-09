DO $$
DECLARE
  t text;
  parent_tbl text;
  parent_col text;
  tables text[][] := ARRAY[
    ['contacts','accounts','account_id'],
    ['principals','applications','application_id'],
    ['beneficial_owners','opportunities','opportunity_id'],
    ['bank_accounts','applications','application_id'],
    ['merchant_consents','applications','application_id'],
    ['application_documents','applications','application_id'],
    ['application_secrets','applications','application_id'],
    ['documents','opportunities','opportunity_id'],
    ['client_interactions','accounts','account_id'],
    ['call_logs','accounts','account_id'],
    ['calendar_events','accounts','account_id'],
    ['validation_reports','opportunities','opportunity_id'],
    ['website_scrutiny_reports','opportunities','opportunity_id'],
    ['onboarding_wizard_states','opportunities','opportunity_id'],
    ['nmi_boarding_submissions','accounts','account_id']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(tables,1) LOOP
    t := tables[i][1];
    parent_tbl := tables[i][2];
    parent_col := tables[i][3];

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', t);

    -- backfill from parent where possible
    EXECUTE format(
      'UPDATE public.%I c SET tenant_id = p.tenant_id FROM public.%I p WHERE c.%I = p.id AND c.tenant_id IS NULL',
      t, parent_tbl, parent_col);

    -- remaining rows (orphan or null parent) fall back to the legacy tenant
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = public.default_tenant_id() WHERE tenant_id IS NULL', t);

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);

    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)',
        t, t || '_tenant_id_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_' || t || '_tenant_id', t);

    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_tenant_id_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_%I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()',
      t, t);
  END LOOP;
END $$;