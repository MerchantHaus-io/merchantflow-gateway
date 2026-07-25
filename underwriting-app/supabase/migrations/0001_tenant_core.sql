-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_tenant_core.sql
-- Multi-tenant foundation: orgs, memberships, settings, invites.
-- Every downstream app table is scoped by org_id and isolated with the SAME RLS
-- shape driven by public.user_orgs(). This is the load-bearing security layer —
-- see 0003 for storage and the underwriting-review edge function for the
-- service-role self-enforcement that complements these policies.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.orgs (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text not null unique,
  stripe_customer_id   text,
  plan                 text not null default 'trial',
  subscription_status  text not null default 'trialing',
  trial_ends_at        timestamptz,
  created_at           timestamptz not null default now()
);

create table public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'viewer'
             check (role in ('owner','admin','underwriter','viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);
create index org_members_org_idx  on public.org_members(org_id);

create table public.org_settings (
  org_id        uuid primary key references public.orgs(id) on delete cascade,
  logo_url      text,
  primary_color text,
  product_name  text not null default 'Underwriting',
  -- Underwriting thresholds/rules that were hardcoded in the origin CRM prompt.
  house_rules   jsonb not null default jsonb_build_object(
    'foundation_tier_threshold', 50000,
    'required_doc_types', jsonb_build_array(
      'Articles of Organization','EIN','Voided Check / Bank Confirmation Letter',
      'Bank Statement','Passport/Drivers License'
    ),
    'gateway_required_doc_types', jsonb_build_array(
      'Voided Check / Bank Confirmation Letter','VAR/Tear Sheet'
    ),
    'bank_statement_months', 3
  ),
  feature_flags jsonb not null default jsonb_build_object(
    'website_scrutiny', true,
    'statement_analysis', false,
    'quote_builder', false
  ),
  llm_model     text not null default 'google/gemini-2.5-flash',
  updated_at    timestamptz not null default now()
);

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  email       text not null,
  role        text not null default 'underwriter'
              check (role in ('owner','admin','underwriter','viewer')),
  token       text not null unique,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index org_invites_email_idx on public.org_invites(lower(email));

-- ── Helpers (SECURITY DEFINER so they bypass RLS and avoid policy recursion) ──

-- The single source of truth for "which orgs does the caller belong to".
create or replace function public.user_orgs()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- Role gate for privileged mutations (settings, members, invites).
create or replace function public.is_org_admin(p_org uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

-- ── updated_at trigger ───────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger org_settings_touch
  before update on public.org_settings
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.orgs         enable row level security;
alter table public.org_members  enable row level security;
alter table public.org_settings enable row level security;
alter table public.org_invites  enable row level security;

-- orgs: members can read their orgs; only admins can update; inserts happen via
-- bootstrap_org() (security definer), never directly from the client.
create policy orgs_select on public.orgs
  for select using (id in (select public.user_orgs()));
create policy orgs_update on public.orgs
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- org_members: members can see co-members; only admins manage rows.
create policy org_members_select on public.org_members
  for select using (org_id in (select public.user_orgs()));
create policy org_members_admin_write on public.org_members
  for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- org_settings: members read; admins write.
create policy org_settings_select on public.org_settings
  for select using (org_id in (select public.user_orgs()));
create policy org_settings_admin_write on public.org_settings
  for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- org_invites: admins only.
create policy org_invites_admin_all on public.org_invites
  for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- ── Atomic org bootstrap (create org + owner membership + default settings) ──
-- SECURITY DEFINER so it can insert the first membership before any RLS grant
-- exists for the caller. Always attributes ownership to the authenticated user.
create or replace function public.bootstrap_org(p_name text, p_slug text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.orgs (name, slug, trial_ends_at)
  values (p_name, p_slug, now() + interval '14 days')
  returning id into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org, v_uid, 'owner');

  insert into public.org_settings (org_id, product_name)
  values (v_org, p_name);

  return v_org;
end;
$$;

-- Accept an invite token: adds the caller as a member of the invited org.
create or replace function public.accept_invite(p_token text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.org_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_inv from public.org_invites
  where token = p_token and accepted_at is null and expires_at > now();

  if v_inv.id is null then
    raise exception 'invite invalid or expired';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;

  update public.org_invites set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end;
$$;

grant execute on function public.bootstrap_org(text, text) to authenticated;
grant execute on function public.accept_invite(text)       to authenticated;
grant execute on function public.user_orgs()               to authenticated;
grant execute on function public.is_org_admin(uuid)        to authenticated;
