CREATE OR REPLACE FUNCTION public.tenant_visible(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin()
      OR (_tenant_id IS NOT NULL
          AND _tenant_id = COALESCE(public.current_tenant_id(), public.default_tenant_id()));
$function$;

REVOKE ALL ON FUNCTION public.tenant_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_visible(uuid) TO anon, authenticated, service_role;

DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  roles_txt text;
  sql text;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.permissive, p.roles, p.cmd,
           p.qual, p.with_check
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename NOT LIKE 'tenant\_%'
       AND p.tablename <> 'tenants'
       AND p.tablename <> 'platform_admins'
       AND EXISTS (
             SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = 'public'
                AND c.table_name = p.tablename
                AND c.column_name = 'tenant_id')
       AND COALESCE(p.qual, '') || COALESCE(p.with_check, '') NOT LIKE '%tenant_visible%'
       AND COALESCE(p.qual, '') || COALESCE(p.with_check, '') NOT LIKE '%current_tenant_id%'
  LOOP
    roles_txt := array_to_string(r.roles, ', ');

    new_qual := CASE WHEN r.qual IS NULL THEN NULL
                     ELSE '(' || r.qual || ') AND public.tenant_visible(tenant_id)' END;
    new_check := CASE WHEN r.with_check IS NULL THEN NULL
                      ELSE '(' || r.with_check || ') AND public.tenant_visible(tenant_id)' END;

    IF new_qual IS NULL AND new_check IS NULL THEN
      CONTINUE;
    END IF;

    sql := format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE sql;

    sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                  r.policyname, r.tablename,
                  CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                  r.cmd, roles_txt);
    IF new_qual IS NOT NULL THEN
      sql := sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE sql;
  END LOOP;
END $$;