ALTER TABLE public.user_roles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

DO $$
DECLARE legacy_id uuid;
BEGIN
  SELECT id INTO STRICT legacy_id FROM public.tenants WHERE slug = 'merchanthaus';
  UPDATE public.user_roles SET tenant_id = legacy_id WHERE tenant_id IS NULL;
END $$;

CREATE INDEX user_roles_tenant_user_role_idx ON public.user_roles (tenant_id, user_id, role);
CREATE UNIQUE INDEX user_roles_tenant_user_role_key ON public.user_roles (tenant_id, user_id, role);
COMMENT ON CONSTRAINT user_roles_user_id_role_key ON public.user_roles IS 'Transitional compatibility constraint: remove only after legacy ON CONFLICT(user_id,role) callers are tenant-aware.';

CREATE OR REPLACE FUNCTION public.set_user_role_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE resolved uuid; tenant_count integer;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN RETURN NEW; END IF;
  resolved := public.current_tenant_id();
  IF resolved IS NULL AND auth.uid() IS NULL THEN
    SELECT count(DISTINCT m.tenant_id), (array_agg(DISTINCT m.tenant_id))[1]
      INTO tenant_count, resolved
      FROM public.tenant_memberships m JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.user_id = NEW.user_id AND m.status = 'active' AND t.status IN ('ready','active');
    IF tenant_count <> 1 THEN resolved := NULL; END IF;
  END IF;
  IF resolved IS NULL THEN
    RAISE EXCEPTION 'Role assignment requires an explicit organisation or an unambiguous active membership';
  END IF;
  NEW.tenant_id := resolved;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_user_role_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_tenant() TO service_role;
CREATE TRIGGER user_roles_set_tenant BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_user_role_tenant();

CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id uuid, _role public.app_role, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _tenant_id IS NOT NULL
    AND (public.is_platform_admin() OR _tenant_id = public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.tenant_memberships m ON m.user_id = ur.user_id AND m.tenant_id = ur.tenant_id
      JOIN public.tenants t ON t.id = ur.tenant_id
      WHERE ur.user_id = _user_id AND ur.role = _role AND ur.tenant_id = _tenant_id
        AND m.status = 'active' AND t.status IN ('ready','active')
    );
$$;
REVOKE ALL ON FUNCTION public.has_tenant_role(uuid, public.app_role, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, public.app_role, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_tenant_role(_user_id, _role, public.current_tenant_id());
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_referrer()
    AND (public.has_role(auth.uid(), 'staff'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));
$$;

CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email IN ('admin@merchanthaus.io','jamie@merchanthaus.io'));
$$;
REVOKE ALL ON FUNCTION public.is_internal_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
REVOKE ALL ON public.user_roles FROM anon;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Restrictive policies AND with every existing permissive policy, closing
-- cross-organisation reads/writes without broadening role-management rights.
CREATE POLICY user_roles_tenant_boundary ON public.user_roles AS RESTRICTIVE
FOR ALL TO authenticated
USING (tenant_id IS NOT NULL AND (public.is_platform_admin() OR tenant_id = public.current_tenant_id()))
WITH CHECK (tenant_id IS NOT NULL AND (public.is_platform_admin() OR tenant_id = public.current_tenant_id()));

CREATE POLICY user_roles_target_membership ON public.user_roles AS RESTRICTIVE
FOR ALL TO authenticated
USING (true)
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tenant_memberships m
  WHERE m.tenant_id = user_roles.tenant_id AND m.user_id = user_roles.user_id AND m.status IN ('active','invited')
));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.tenants t ON t.id=ur.tenant_id WHERE t.slug <> 'merchanthaus')
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Role backfill verification failed';
  END IF;
END $$;