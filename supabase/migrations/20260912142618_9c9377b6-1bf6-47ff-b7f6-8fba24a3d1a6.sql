CREATE TABLE public.tenant_pricing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT public.default_tenant_id(),
  code text NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'extra',
  cadence text NOT NULL DEFAULT 'monthly',
  cost numeric(12,4) NOT NULL DEFAULT 0,
  resale numeric(12,4) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_pricing_items_category_chk CHECK (category IN ('plan','gateway_fee','extra','one_time')),
  CONSTRAINT tenant_pricing_items_cadence_chk CHECK (cadence IN ('monthly','per_transaction','one_time')),
  CONSTRAINT tenant_pricing_items_code_uniq UNIQUE (tenant_id, code)
);

CREATE INDEX tenant_pricing_items_tenant_idx ON public.tenant_pricing_items (tenant_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_pricing_items TO authenticated;
GRANT ALL ON public.tenant_pricing_items TO service_role;

ALTER TABLE public.tenant_pricing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their tenant pricing"
  ON public.tenant_pricing_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_platform_admin());

CREATE POLICY "Tenant admins insert their tenant pricing"
  ON public.tenant_pricing_items FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id) OR public.is_platform_admin());

CREATE POLICY "Tenant admins update their tenant pricing"
  ON public.tenant_pricing_items FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_admin(tenant_id) OR public.is_platform_admin());

CREATE POLICY "Tenant admins delete their tenant pricing"
  ON public.tenant_pricing_items FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_admin());

CREATE TRIGGER tenant_pricing_items_touch
  BEFORE UPDATE ON public.tenant_pricing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();