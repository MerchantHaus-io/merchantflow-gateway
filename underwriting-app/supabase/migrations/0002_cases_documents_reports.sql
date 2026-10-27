-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_cases_documents_reports.sql
-- The lean underwriting data model. Replaces the origin CRM's
-- opportunities/accounts/contacts/beneficial_owners with a single `case`
-- aggregate that the underwriting tool reviews, plus tenant-scoped documents,
-- validation_reports (ported schema), and usage metering.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── cases: one merchant application under review ─────────────────────────────
create table public.cases (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  status       text not null default 'draft'
               check (status in ('draft','in_review','complete')),
  service_type text not null default 'processing'
               check (service_type in ('processing','gateway_only')),
  legal_name   text,
  dba_name     text,
  website_url  text,
  address      jsonb not null default '{}'::jsonb,          -- {address1,city,state,zip}
  contact      jsonb not null default '{}'::jsonb,          -- {first,last,email,phone}
  application  jsonb not null default '{}'::jsonb,          -- MCC, volumes, ticket, mixes
  owners       jsonb not null default '[]'::jsonb,          -- [{name, pct}] for OFAC
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index cases_org_idx on public.cases(org_id);

create trigger cases_touch
  before update on public.cases
  for each row execute function public.touch_updated_at();

-- ── documents: metadata; bytes live in the private storage bucket (0003) ─────
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  case_id       uuid not null references public.cases(id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,                              -- "{org_id}/{case_id}/{uuid}-{name}"
  document_type text,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index documents_case_idx on public.documents(case_id);
create index documents_org_idx  on public.documents(org_id);

-- ── validation_reports: ported from the CRM, now org+case scoped ─────────────
-- Spec fields promoted to columns; full LLM output kept in raw_report so the UI
-- never loses fields to schema drift.
create table public.validation_reports (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs(id) on delete cascade,
  case_id                  uuid not null references public.cases(id) on delete cascade,
  triggered_by             uuid references auth.users(id) on delete set null,
  readiness_score          text,   -- ready | needs_attention | not_ready
  score                    numeric,
  website_score            numeric,
  confidence               text,
  recommendation           text,
  risk_tier                text,
  summary                  text,
  document_completeness    jsonb not null default '[]'::jsonb,
  classification_issues    jsonb not null default '[]'::jsonb,
  data_gaps                jsonb not null default '[]'::jsonb,
  red_flags                jsonb not null default '[]'::jsonb,
  recommended_actions      jsonb not null default '[]'::jsonb,
  score_breakdown          jsonb not null default '[]'::jsonb,
  hard_stops               jsonb not null default '[]'::jsonb,
  public_checks_performed  jsonb not null default '[]'::jsonb,
  validity_conclusion      text,
  validity_justification   text,
  raw_report               jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);
create index validation_reports_case_idx on public.validation_reports(case_id, created_at desc);

-- ── usage_events: per-org LLM metering → plan limits + billing ───────────────
create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  kind       text not null,        -- e.g. 'underwriting_review'
  tokens     integer,
  cost_cents integer,
  created_at timestamptz not null default now()
);
create index usage_events_org_idx on public.usage_events(org_id, created_at desc);

-- ── RLS: identical tenant-isolation shape on every table ─────────────────────
alter table public.cases              enable row level security;
alter table public.documents          enable row level security;
alter table public.validation_reports enable row level security;
alter table public.usage_events       enable row level security;

-- cases + documents: members read/write within their org only. The WITH CHECK
-- blocks writing rows into an org the caller does not belong to.
create policy cases_tenant_isolation on public.cases
  for all
  using (org_id in (select public.user_orgs()))
  with check (org_id in (select public.user_orgs()));

create policy documents_tenant_isolation on public.documents
  for all
  using (org_id in (select public.user_orgs()))
  with check (org_id in (select public.user_orgs()));

-- reports + usage: read-only for members. Writes come exclusively from the
-- underwriting-review edge function (service-role key, which bypasses RLS and
-- self-enforces org ownership from the caller's JWT).
create policy validation_reports_select on public.validation_reports
  for select using (org_id in (select public.user_orgs()));

create policy usage_events_select on public.usage_events
  for select using (org_id in (select public.user_orgs()));
