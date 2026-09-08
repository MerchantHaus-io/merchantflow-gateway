-- ============================================================
-- Phase 1 — Tenancy foundation (additive only).
-- New tables/functions only. No existing table is touched, so the
-- running single-tenant app is unaffected.
-- ============================================================

CREATE TYPE public.tenant_status AS ENUM (
  'pending', 'provisioning', 'ready', 'active', 'suspended', 'failed', 'deactivated'
);

CREATE TYPE public.tenant_member_role AS ENUM ('owner', 'admin', 'member');

CREATE TYPE public.tenant_membership_status AS ENUM ('invited', 'active', 'suspended', 'revoked');

CREATE TYPE public.provisioning_run_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');

CREATE TYPE public.provisioning_step_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'skipped');

-- ------------------------------------------------------------
-- tenants
-- ------------------------------------------------------------
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  status public.tenant_status NOT NULL DEFAULT 'pending',
  is_legacy boolean NOT NULL DEFAULT false,
  primary_contact_email text,
  billing_email text,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  suspended_at timestamptz,
  suspended_reason text,
  activated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_key UNIQUE (slug),
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

-- ------------------------------------------------------------
-- platform_admins  (platform operators, across all tenants)
-- ------------------------------------------------------------
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_user_id_key UNIQUE (user_id)
);

-- ------------------------------------------------------------
-- tenant_memberships
-- ------------------------------------------------------------
CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text,
  role public.tenant_member_role NOT NULL DEFAULT 'member',
  status public.tenant_membership_status NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  invited_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_tenant_user_key UNIQUE (tenant_id, user_id)
);

CREATE INDEX tenant_memberships_user_idx ON public.tenant_memberships (user_id);
CREATE INDEX tenant_memberships_tenant_idx ON public.tenant_memberships (tenant_id);
CREATE UNIQUE INDEX tenant_memberships_one_default_per_user
  ON public.tenant_memberships (user_id) WHERE is_default;

-- ------------------------------------------------------------
-- tenant_invitations
-- ------------------------------------------------------------
CREATE TABLE public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.tenant_member_role NOT NULL DEFAULT 'member',
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invitations_token_key UNIQUE (token)
);

CREATE UNIQUE INDEX tenant_invitations_open_email_idx
  ON public.tenant_invitations (tenant_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ------------------------------------------------------------
-- provisioning
-- ------------------------------------------------------------
CREATE TABLE public.tenant_provisioning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status public.provisioning_run_status NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 1,
  requested_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_provisioning_runs_idem_key UNIQUE (idempotency_key)
);

CREATE INDEX tenant_provisioning_runs_tenant_idx ON public.tenant_provisioning_runs (tenant_id);

CREATE TABLE public.tenant_provisioning_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tenant_provisioning_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_order integer NOT NULL DEFAULT 0,
  status public.provisioning_step_status NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_provisioning_steps_run_step_key UNIQUE (run_id, step_key)
);

CREATE INDEX tenant_provisioning_steps_tenant_idx ON public.tenant_provisioning_steps (tenant_id);

-- ------------------------------------------------------------
-- onboarding state
-- ------------------------------------------------------------
CREATE TABLE public.tenant_onboarding_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_step text NOT NULL DEFAULT 'welcome',
  completed_steps text[] NOT NULL DEFAULT ARRAY[]::text[],
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_state_tenant_key UNIQUE (tenant_id)
);

-- ------------------------------------------------------------
-- audit
-- ------------------------------------------------------------
CREATE TABLE public.tenant_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_audit_events_tenant_idx ON public.tenant_audit_events (tenant_id, created_at DESC);

-- ============================================================
-- Helper functions (security definer)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM public.tenant_memberships m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND t.status IN ('ready', 'active')
  ORDER BY m.is_default DESC, m.joined_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = _tenant_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = _tenant_id
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
  );
$$;

-- ============================================================
-- Status state machine
-- ============================================================
CREATE OR REPLACE FUNCTION public.tenants_guard_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed text[];
BEGIN
  NEW.updated_at := now();

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'pending'      THEN ARRAY['provisioning','failed','deactivated']
    WHEN 'provisioning' THEN ARRAY['ready','failed','deactivated']
    WHEN 'ready'        THEN ARRAY['active','suspended','failed','deactivated']
    WHEN 'active'       THEN ARRAY['suspended','deactivated']
    WHEN 'suspended'    THEN ARRAY['active','ready','deactivated']
    WHEN 'failed'       THEN ARRAY['provisioning','deactivated']
    WHEN 'deactivated'  THEN ARRAY['provisioning']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY (allowed)) THEN
    RAISE EXCEPTION 'Invalid tenant status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'suspended' AND NEW.suspended_at IS NULL THEN
    NEW.suspended_at := now();
  END IF;
  IF NEW.status = 'active' THEN
    NEW.suspended_at := NULL;
    NEW.suspended_reason := NULL;
    IF NEW.activated_at IS NULL THEN
      NEW.activated_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_status_transition
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenants_guard_status_transition();

CREATE TRIGGER tenant_memberships_touch
BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenant_invitations_touch
BEFORE UPDATE ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenant_provisioning_runs_touch
BEFORE UPDATE ON public.tenant_provisioning_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenant_provisioning_steps_touch
BEFORE UPDATE ON public.tenant_provisioning_steps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenant_onboarding_state_touch
BEFORE UPDATE ON public.tenant_onboarding_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_memberships TO authenticated;
GRANT ALL ON public.tenant_memberships TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invitations TO authenticated;
GRANT ALL ON public.tenant_invitations TO service_role;

GRANT SELECT ON public.tenant_provisioning_runs TO authenticated;
GRANT ALL ON public.tenant_provisioning_runs TO service_role;

GRANT SELECT ON public.tenant_provisioning_steps TO authenticated;
GRANT ALL ON public.tenant_provisioning_steps TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.tenant_onboarding_state TO authenticated;
GRANT ALL ON public.tenant_onboarding_state TO service_role;

GRANT SELECT ON public.tenant_audit_events TO authenticated;
GRANT ALL ON public.tenant_audit_events TO service_role;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_provisioning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_provisioning_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage tenants"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Members read their own tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(id));

CREATE POLICY "Tenant admins update their own tenant"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(id))
  WITH CHECK (public.is_tenant_admin(id));

CREATE POLICY "Platform admins manage platform admins"
  ON public.platform_admins FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Users read their own platform admin row"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Platform admins manage memberships"
  ON public.tenant_memberships FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Users read their own memberships"
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members read memberships in their tenant"
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant admins insert memberships in their tenant"
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins update memberships in their tenant"
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins delete memberships in their tenant"
  ON public.tenant_memberships FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Platform admins manage invitations"
  ON public.tenant_invitations FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Tenant admins read invitations in their tenant"
  ON public.tenant_invitations FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins create invitations in their tenant"
  ON public.tenant_invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins update invitations in their tenant"
  ON public.tenant_invitations FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins delete invitations in their tenant"
  ON public.tenant_invitations FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Platform admins manage provisioning runs"
  ON public.tenant_provisioning_runs FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Tenant admins read their provisioning runs"
  ON public.tenant_provisioning_runs FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Platform admins manage provisioning steps"
  ON public.tenant_provisioning_steps FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Tenant admins read their provisioning steps"
  ON public.tenant_provisioning_steps FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id));

CREATE POLICY "Platform admins manage onboarding state"
  ON public.tenant_onboarding_state FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Members read their onboarding state"
  ON public.tenant_onboarding_state FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant admins insert their onboarding state"
  ON public.tenant_onboarding_state FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins update their onboarding state"
  ON public.tenant_onboarding_state FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Platform admins manage audit events"
  ON public.tenant_audit_events FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Tenant admins read their audit events"
  ON public.tenant_audit_events FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id));

-- ============================================================
-- Seed the legacy tenant + backfill memberships
-- ============================================================
INSERT INTO public.tenants (name, slug, status, is_legacy, primary_contact_email, activated_at)
VALUES ('MerchantHaus', 'merchanthaus', 'active', true, 'admin@merchanthaus.io', now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.tenant_memberships (tenant_id, user_id, email, role, status, is_default, joined_at)
SELECT
  t.id,
  u.id,
  u.email,
  CASE
    WHEN lower(u.email) IN ('admin@merchanthaus.io', 'darryn182@gmail.com') THEN 'owner'::public.tenant_member_role
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'
    ) THEN 'admin'::public.tenant_member_role
    ELSE 'member'::public.tenant_member_role
  END,
  'active',
  true,
  COALESCE(u.created_at, now())
FROM auth.users u
CROSS JOIN public.tenants t
WHERE t.slug = 'merchanthaus'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO public.platform_admins (user_id, email, note)
SELECT u.id, u.email, 'Seeded from legacy hardcoded admin allowlist'
FROM auth.users u
WHERE lower(u.email) IN ('admin@merchanthaus.io', 'darryn182@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.tenant_onboarding_state (tenant_id, current_step, completed_steps, completed_at)
SELECT t.id, 'complete', ARRAY['welcome','branding','team','integrations','complete'], now()
FROM public.tenants t
WHERE t.slug = 'merchanthaus'
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.tenant_audit_events (tenant_id, action, detail)
SELECT t.id, 'tenant.seeded', jsonb_build_object('phase', 'tenancy-foundation')
FROM public.tenants t WHERE t.slug = 'merchanthaus';