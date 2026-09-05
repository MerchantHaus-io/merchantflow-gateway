# The Ops Terminal — Prototype-to-GA Productization Assessment

Assessment only. **No application code, schema or configuration was changed to
produce this document.**

Evidence basis, all re-verified on 5 Sep 2026 in this session unless marked
*Requires verification*:

| Measurement | Command / query | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | silent (PASS) |
| Unit tests | `npx vitest run` | 230 passing, 18 files |
| Public tables | `pg_tables` | 78 |
| RLS policies | `pg_policies` | 228 |
| `USING (true)` policies | `pg_policies` | 27 |
| `USING (auth.uid() IS NOT NULL)` policies | `pg_policies` | 43 |
| INSERT-only (`WITH CHECK` only) policies | `pg_policies` | 51 |
| `auth.users` | count | 12 |
| `accounts` / `merchants` / `opportunities` / `referrers` | counts | 115 / 58 / 95 / 4 |
| Storage buckets | `storage.buckets` | 4 (1 public: `avatars`) |
| Scheduled jobs | `cron.job` | 13 |
| Edge functions | `supabase/functions/` | 76 |
| Functions holding a service-role key | `grep -rl SERVICE_ROLE` | 60 |
| Functions with `verify_jwt = false` | `supabase/config.toml` | 9 |
| Migrations in repo | `supabase/migrations/` | 186 |
| Frontend source files | `src/**/*.ts(x)` | 370 (66 pages, 90 components dirs) |
| Test files | `src/**/*.test.ts` | 18 |

This document supersedes and extends `docs/tenancy/` (which covers tenancy
only) by adding product definition, CI/CD, testing, commercialization, beta,
production-readiness and backlog dimensions. Where `docs/tenancy/` already
holds the deeper analysis it is cited rather than duplicated.

---

## 1. Executive Summary

The Ops Terminal is **not a prototype**. It is a working, daily-operated,
single-tenant business system: a payments-ISO CRM that runs MerchantHaus's
entire merchant lifecycle — prospect, statement analysis, quote, Merchant
Services Agreement, underwriting, processor/gateway boarding, live billing,
residual reconciliation, rep commission, affiliate payouts and support
ticketing — on 78 tables, 76 edge functions, 13 scheduled jobs and live
integrations with NMI, Kurv/EMS, Google Workspace, Quo/OpenPhone, Resend and a
separate Client Portal project.

The gap between here and a sellable SaaS product is **not feature work**. The
functional surface already exceeds what most competitors ship. The gap is
structural, and it reduces to five things:

1. **There is no tenant dimension anywhere.** 78 tables, 228 policies, zero
   tenant columns. The tenant is implicit and hardcoded: MerchantHaus. 70 of
   228 policies are `USING (true)` or `USING (auth.uid() IS NOT NULL)` — safe
   today only because every principal belongs to one company, a mass
   cross-tenant read the moment a second tenant exists.
2. **RLS is only half the access model.** 60 of 76 edge functions hold the
   service-role key and bypass RLS entirely. Tenant scoping in those handlers
   is not a follow-up task; it is the other half of isolation.
3. **Identity is an email domain, not a membership.** Access is
   `@merchanthaus.io` or a literal allowlist (`src/types/opportunity.ts`);
   admin is two email literals inside a SQL function used by 28 policies; and
   `useUserRole` **fails open to a hardcoded admin list when the role query
   errors** — a defect in the single-tenant app today, not only under tenancy.
4. **There is no environment below production.** One Supabase project serves
   preview and published. No staging, no seeded test tenant, no isolation test
   can be executed. This is the binding blocker on every security claim.
5. **Nothing commercial exists.** No plans, entitlements, subscription
   billing, trials, ToS/DPA, SLA, or self-serve signup for an ISO customer.

Honest sequencing consequence: **multi-tenancy is a multi-month programme**
(~250 files, ~11 migrations, per `docs/tenancy/05`), and it cannot be
compressed or verified without a staging environment first. The shortest
credible path to a first paying external ISO runs Staging → Tenancy schema →
RLS tenantization → edge-function tenant scoping → client tenant context →
provisioning → onboarding → security review → private beta. Everything
commercial (pricing, billing, ToS) can run fully in parallel and is not on the
critical path until Gate 7.

A second, cheaper option exists and should be an explicit business decision
rather than an unexamined default: **sell single-tenant instances** (one
Supabase project per ISO, provisioned from this repo) to the first two or three
customers, deferring true multi-tenancy. That trades per-customer operational
cost for roughly six months of calendar time. See Decision D1.

---

## 2. What Exists Today

### 2.1 Functional surface (observed, not inferred)

| Domain | What is there | Maturity |
|---|---|---|
| Pipeline / CRM | Two pipelines (`processing`, `gateway_only`), 10 stages, 5 terminal outcomes, kanban + list, stage-entry timestamps, SLA aging, attention signals (`src/lib/pipeline*.ts`, `dealAttention.ts`) | Production-ready |
| Accounts / contacts | `accounts` (115), `contacts`, `principals`, `beneficial_owners`, `bank_accounts` | Production-ready |
| Statement analysis | Competitor statement ingest → savings proposal PDF (`statementProposalPdf.ts`) | Functional, needs hardening |
| Quoting | `quotes` (38 cols), schedule/pricing config, acceptance flow (`accept-quote`), `quote_acceptances` | Functional, needs hardening |
| Contracts | MSA + Exhibit A generated from a persisted line snapshot; cost redaction enforced at render (`redactCost.ts`, tested) | Production-ready |
| Underwriting | AI rubric 0–100, `validation_reports`, `website_scrutiny_reports`, high-risk MCC + OFAC checks, gateway-only gate | Functional, needs hardening |
| Boarding | NMI v3/v4 partner APIs (`nmi-board-merchant`, `nmi-boarding-submissions`), Kurv/EMS deal submission + status | Functional, needs hardening |
| Live book & billing | `billing_documents`, doc sequences, invoice/receipt PDFs, billing estimates | Functional, needs hardening |
| Residuals & commission | `nmi_partner_residuals`, `commission_records`, `commission_periods`, reconciliation + variance reporting (`residualReconciliation.ts`, tested) | Functional, needs hardening |
| Affiliate programme | `referrers`, ledger, payout runs, partner portal, impersonation with audit, activity tracking | Functional, needs hardening |
| Support | `support_tickets` + comments, inbound email → ticket, sanitization, SLA escalation, auto-archive after 1 week closed | Functional, needs hardening |
| Internal comms | `chat_channels`, `direct_messages`, notice board, reactions, push subscriptions, tri-tab dock | Functional — candidate for descoping (see §4.4) |
| Calendar | Google Calendar OAuth + sync, `calendar_events`, reminders | Functional, needs hardening |
| Telephony | Quo/OpenPhone proxy, `call_logs`, webhook with shared secret | Prototype-to-functional |
| Public intake | `/merchant-apply`, `/scope`, `/support-request`, affiliate signup — 9 unauthenticated edge functions | Functional, needs hardening |
| Agent/MCP | OAuth-protected MCP server, ES256 keys, consent UI, 6 tools, `mcp_audit_log` | Prototype implementation |
| Observability (in-app) | `client_errors`, `rate_limit_events`, `/admin/observability` | Prototype implementation |
| Backups | `backup_runs`, `backup_change_queue`, hourly Drive snapshot + 10-second flush | Functional, needs hardening |
| Theming | 16 palettes, token-driven | Production-ready |
| Mobile | Capacitor iOS/Android wrapper, bottom nav, dock | Incomplete (Requires verification: whether either store build is currently shipped) |

### 2.2 User types today

Staff (sales rep, account manager, support, admin) via `user_roles`
(`app_role`: `admin | user | staff | finance`), plus **external referrers** with
a dedicated portal. Admin resolution is split across `is_admin()`,
`is_admin_email()` (two email literals) and `src/lib/adminRole.ts`.

### 2.3 Administrative functionality

`/admin/*` covers web submissions, scoping submissions, deletion requests, team
roster, referrers/affiliates, payout runs, observability, terminal updates,
user roles, data export, CSV import, migration checklist. This is a genuinely
strong base for a **tenant** admin surface. There is **no platform admin
surface** (cross-tenant console) — it does not exist.

### 2.4 Configuration mechanisms

- Compile-time TypeScript config: `src/config/{team,pricing,quoteSchedule,
  paymentInstructions,scopingFields,navigation}.ts` — this is where most
  "configuration" lives, and it is **code**, not data.
- Build-time env: `VITE_SUPABASE_*`, `VITE_MH_ACTIVATION_*` (branding, bank
  details, sender identity).
- Runtime DB config: `team_roster`, `billing_doc_sequences`,
  `internal_cron_tokens`, `admin_popups`, `kurv_api_tokens`.
- Per-user runtime: `localStorage` (theme, transparency, dock state).

### 2.5 Hardcoded assumptions (inventory A1–A10)

Carried forward verbatim from `docs/tenancy/00` §3.5 and re-confirmed:
email-domain access (A1), SQL admin email literals across 28 policies (A2),
**client fail-open admin fallback (A3)**, compile-time roster (A4), literal
trusted-auth-host set (A5), single default redirect origin (A6), 27 `true`
policies (A7), 43 `authenticated`-only policies (A8), 9 unauthenticated edge
functions (A9), build-time branding/sender/bank identity (A10).

### 2.6 Manual processes and developer dependencies

- New staff user: `create-team-user` edge function + manual role insert.
- New affiliate: signup → **manual admin approval**.
- Migrations: authored in-repo, applied through the Lovable tool with human
  approval; `scripts/apply-migrations.sh` requires a DB password no agent has.
- Secrets: set by the owner through the platform; no rotation schedule observed.
- Pricing / roster / branding changes: **code edit + redeploy**.
- Onboarding a company: does not exist. Today it is "the company is already in
  the code."
- Support diagnosis: partly in-app (`/admin/observability`), partly requires
  direct SQL. `CLAUDE.md` records that the connector is production and
  SELECT-only for agents.

---

## 3. Current Architecture

```text
                    ┌──────────────────────────────────────────┐
  Browser / iPad /  │  Vite 5 + React 18 + TS SPA              │
  Capacitor shell   │  react-router v6 · TanStack Query        │
                    │  Tailwind 3 + shadcn · 16 theme palettes  │
                    │  jsPDF (quote/MSA/invoice/proposal)       │
                    └───────────────┬──────────────────────────┘
                                    │ supabase-js (anon key, RLS)
                    ┌───────────────▼──────────────────────────┐
   Netlify (SPA     │  Supabase project cuqjaddtmkotgvfsgcol   │
   redirect only)   │  ┌────────────┬───────────┬────────────┐ │
                    │  │ Postgres   │ Auth      │ Storage    │ │
                    │  │ 78 tables  │ email+    │ 4 buckets  │ │
                    │  │ 228 RLS    │ Google    │ 1 public   │ │
                    │  │ 55 fns     │ OAuth     │            │ │
                    │  └────────────┴───────────┴────────────┘ │
                    │  76 Deno edge functions (60 service-role,│
                    │  9 verify_jwt=false)                     │
                    │  pg_cron: 13 jobs → edge fns via x-cron- │
                    │  secret                                  │
                    └───────┬──────────────────────────────────┘
                            │
   ┌────────────────────────┼─────────────────────────────────────┐
   │ NMI (gateway: boarding, residuals, txns, webhook)            │
   │ Kurv / EMS (processor: board, status, merchants, txns)       │
   │ Google Workspace (Gmail poll → tickets/leads, Calendar, Drive│
   │   backup snapshots)                                          │
   │ Quo / OpenPhone (calls + SMS, shared-secret webhook)         │
   │ Resend (transactional + outreach email)                      │
   │ Lovable AI Gateway (underwriting, classification, assistant) │
   │ Client Portal — separate Supabase project csusakykwlxixwiimrld│
   │   (milestone webhooks in; no shared data)                    │
   └──────────────────────────────────────────────────────────────┘
```

**Queues:** none as such. `backup_change_queue` is a table drained by a
10-second cron job; everything else is synchronous edge invocation or cron.

**CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci` → `npm run
lint` → `npm run build` on push to `main`/`work`/`master`/`develop` and on PRs.
**Vitest is not in CI** — 230 tests exist and none of them gate a merge. No
deploy job; publishing goes through Lovable, and edge functions deploy by tool
invocation. No staging environment, no migration step, no release tagging.

**Secrets:** Supabase function secrets + Vite build env. No rotation policy
observed. Service-role key and DB password are inaccessible by design.

**Logging/monitoring:** edge function logs (platform-retained),
`client_errors`, `rate_limit_events`, `mcp_audit_log`, `audit_entries`,
`commission_sync_logs`, `kurv_sync_logs`, `referrer_impersonation_logs`. No
metrics, no alerting, no tracing, no uptime checks, no error budget.

---

## 4. Product Maturity Assessment

Classification of every major capability. "Hardening" means it works in
production for one company but lacks the tests, isolation, error handling or
operational visibility a paying external customer implies.

| Capability | Class | Basis |
|---|---|---|
| Pipeline, accounts, contacts, opportunities | **Production-ready** | Daily use, 95 opportunities, unit-tested libs |
| Cost redaction (`stripInternalCostRefs`) | **Production-ready** | Enforced at render in every merchant-facing generator, guarded by tests |
| Theming across 16 palettes | **Production-ready** | Token-driven |
| RLS *enabled* on all tables | **Production-ready** | `relrowsecurity = true` on 78/78 |
| Quoting → MSA → acceptance | Functional, needs hardening | Snapshot correctness relies on one code path; thin tests |
| Billing documents & sequences | Functional, needs hardening | `next_billing_doc_number` sequence contention unproven under concurrency |
| Residual reconciliation & commission | Functional, needs hardening | Tested helpers; `CLAUDE.md` records a wrong `$15.00` constant in migration `20260904203347` and `referrers.commission_rate = 0.5000` being double the programme rate — **known live data divergence** |
| Affiliate ledger & payout runs | Functional, needs hardening | Same divergence; `build_referrer_ledger()` accrues from any period rather than first gateway invoice |
| NMI / Kurv boarding | Functional, needs hardening | No retry/idempotency evidence on partner calls |
| Support ticketing + inbound email | Functional, needs hardening | Sanitization has already regressed once (links/snippets stripped) |
| Google Workspace sync | Functional, needs hardening | Token refresh failure handling unproven |
| Backups to Drive | Functional, needs hardening | Batching added after a 504; **no restore procedure has ever been exercised** |
| Public intake (apply/scope/support) | Functional, needs hardening | 9 unauthenticated entry points; rate limiting present but unmeasured |
| Quo telephony | Prototype | Shared-secret webhook, no HMAC (`CLAUDE.md` names this) |
| MCP / agent integration | Prototype | Recent, one 503 incident from upstream auth |
| In-app observability | Prototype | Error/rate-limit browsing only; no metrics or alerts |
| Mobile (Capacitor) | Incomplete | Wrapper + layouts exist; release state *Requires verification* |
| **Multi-tenancy** | **Missing** | Zero tenant columns |
| **Tenant provisioning** | **Missing** | — |
| **Customer onboarding** | **Missing** | `onboarding_wizard_states` exists but is a *merchant* preboarding wizard, not tenant onboarding |
| **Platform admin console** | **Missing** | — |
| **Plans / entitlements / subscription billing** | **Missing** | Billing here bills *merchants*, not ISO customers |
| **Staging environment** | **Missing** | Binding blocker |
| **Tests in CI** | **Missing** | 230 tests, zero gating |
| Hardcoded roster / email-domain auth | **Technical debt** | A1, A2, A4 |
| `useUserRole` fail-open | **Technical debt (security)** | A3 |
| 60 service-role edge functions | **Technical debt** | Half the access model sits outside RLS |
| Restore procedure | **Unknown / requires investigation** | Never tested |
| Concurrency on doc sequences & ledger builds | **Unknown / requires investigation** | Needs a load test |

---

## 5. What Can Be Preserved

Explicitly **do not rewrite**:

1. **The domain model.** `accounts → opportunities → merchants` with quoting,
   billing, commission and support hanging off it is correct for an ISO. It
   needs a `tenant_id` added, not a redesign.
2. **The security-definer helper chokepoint.** ~67 policies delegate to
   `is_internal_staff()`, `is_admin_email()`, `referrer_owns()`,
   `referrer_owns_account()`, `has_role()`. Introducing the tenant predicate in
   the helpers converts a 67-policy rewrite into one reviewable change. This is
   the highest-leverage asset in the codebase.
3. **The referrer portal mechanism.** Row-ownership isolation, a separate
   portal, impersonation with an audit trail — proof the team can express
   scoped access, and the pattern to copy for tenancy.
4. **Cost redaction at render time.** Already the right architecture: enforced
   at the boundary, not trusted to clean data. Keep untouched.
5. **The PDF generation stack.** Quotes, MSA/Exhibit A, invoices, statement
   proposals all work and carry real business rules.
6. **The integration layer.** NMI, Kurv, Google, Quo, Resend wiring is the
   product's actual moat and is expensive to rebuild. It needs per-tenant
   credential storage, not replacement.
7. **The admin surface.** `/admin/*` becomes the tenant admin surface with a
   tenant filter; it does not need reinventing.
8. **The 230 tests, 18 lib modules with pure logic, and the token/theming
   system.**
9. **`docs/tenancy/` and `docs/gauntlet/`.** The tenancy analysis is done and
   correct; treat it as the design input to Gates 3–4.

---

## 6. Major Gaps

Ordered by whether they block a first external customer.

| # | Gap | Exists? | Blocks GA? |
|---|---|---|---|
| G1 | No staging/test environment | Does not exist | **Yes — blocks verification of everything else** |
| G2 | No tenant dimension (78 tables) | Does not exist | Yes (unless D1 chooses single-tenant instances) |
| G3 | 70 permissive RLS policies | Exists, wrong for tenancy | Yes |
| G4 | 60 service-role edge functions not tenant-aware | Exists, incomplete | Yes |
| G5 | Identity = email domain; admin = SQL email literals; client fail-open | Exists, incomplete | Yes |
| G6 | No tenant provisioning | Does not exist | Yes |
| G7 | No tenant onboarding | Does not exist | Yes |
| G8 | Storage not tenant-namespaced; `avatars` bucket public | Exists, wrong for tenancy | Yes |
| G9 | Tests not in CI; no deploy pipeline; no rollback | Partially exists | Yes |
| G10 | Backup restore never exercised | Unknown | Yes |
| G11 | No monitoring/alerting/metrics | Does not exist | Yes |
| G12 | No plans/entitlements/subscription billing | Does not exist | Yes (for self-serve; No for invoiced design partners) |
| G13 | No ToS / DPA / privacy policy / SLA for an ISO customer | Does not exist | Yes |
| G14 | Per-tenant branding, sender identity, bank details | Build-time only | Yes |
| G15 | Per-tenant integration credentials (NMI, Kurv, Google, Quo) | Single set | Yes |
| G16 | Known commission-rate / gateway-cost data divergence in production | Exists, wrong | Yes (billing correctness) |
| G17 | Webhook HMAC (Quo, NMI, portal milestones) | Shared secret only | No — hardening |
| G18 | Cron jobs iterate one tenant | Exists, incomplete | Yes |
| G19 | No platform admin console | Does not exist | Yes (operability) |
| G20 | Mobile release state | Unknown | No |

---

## 7. Target SaaS Architecture

Minimal delta from today. No new runtime, no new datastore, no service split.

```text
  Tenant-branded SPA (same codebase)
    TenantContext ── resolves membership → tenant_id
    every TanStack queryKey carries tenantId
    branding/config read from tenant_settings, not build env
            │ anon key + JWT
  ┌─────────▼───────────────────────────────────────────────┐
  │ Supabase: shared Postgres, pooled multi-tenant           │
  │  • tenant_id on ~69 tables, NOT NULL + FK + index        │
  │  • current_tenant_id() chokepoint in every helper        │
  │  • 228 policies carry a tenant term (USING and WITH CHECK)│
  │  • tenants, tenant_memberships, tenant_invitations,      │
  │    tenant_settings, tenant_integrations (vault refs),    │
  │    tenant_entitlements, platform_admins,                 │
  │    tenant_provisioning_runs/steps,                       │
  │    tenant_onboarding_state, tenant_audit_events          │
  │  • storage: tenants/{tenant_id}/… + path-segment RLS     │
  │  • edge functions: requireAuth() returns principal +     │
  │    tenant; service-role handlers scope explicitly        │
  │  • cron: jobs iterate active tenants                     │
  └──────────┬──────────────────────────────────────────────┘
             │ per-tenant credentials from vault
     NMI · Kurv · Google · Quo · Resend  (per tenant)
  ┌──────────────────────────┐  ┌──────────────────────────┐
  │ Platform console          │  │ Billing (Stripe)         │
  │ (platform_admins only)    │  │ plans, subs, entitlements│
  └──────────────────────────┘  └──────────────────────────┘
```

Deliberately **not** proposed, and why: schema-per-tenant or
database-per-tenant (228 policies already exist and work; per-schema would
multiply 186 migrations by tenant count for no isolation gain RLS cannot give);
a backend API tier in front of Postgres (the SPA-direct-to-Postgres model with
RLS is load-bearing across 370 files — replacing it is a rewrite, not a
refactor); a message broker (13 cron jobs and one queue table meet current
throughput; revisit at >20 tenants).

---

## 8. Multi-Tenancy Strategy

`docs/tenancy/01`–`03` hold the ADRs and the 78-table matrix. Summary of the
decisions that bind:

- **Tenant = the ISO / agency.** Existing data becomes one legacy
  "MerchantHaus" tenant. Merchants and referrers live *inside* a tenant. This
  is what keeps the conversion additive.
- **`account_id` is not a tenant key.** It appears on 16 tables and means
  *merchant account* — a customer of the tenant.
- **Membership, not email.** `tenant_memberships(tenant_id, user_id, role)`
  replaces `isEmailAllowed`, `EXTRA_ALLOWED_EMAILS` and `is_admin_email()`.
  `user_roles` becomes `(tenant_id, user_id, role)` — the highest-risk single
  migration in the programme; ship it alone.
- **Isolation = tenant predicate in the helper chokepoint + individual rewrite
  of the 70 permissive policies + tenant terms on the 51 `WITH CHECK`-only
  INSERT policies.** Omitting the third blocks reads while permitting writes
  into other tenants.
- **Context propagation:** JWT → `current_tenant_id()` in SQL;
  `TenantContext` + `tenantId` in all query keys in the client; resolved
  principal from `requireAuth()` in edge functions.
- **Per-tenant configurable:** branding, sender identity/domain, bank/payment
  instructions, users/roles/invitations, integration credentials, pricing and
  quote schedule, workflow/stage labels, SLA thresholds, email templates,
  feature flags, API keys, custom domain, billing plan.
- **Global:** MCC/high-risk tables, supported-processor catalog, product
  documentation, platform admins, plan catalog, `terminal_updates`
  (**classification unconfirmed — blocker B4 in `docs/tenancy/05`; a wrong
  answer here is a cross-tenant leak**).
- **Suspension chokepoint:** `current_tenant_id()` resolves only for
  `READY`/`ACTIVE` tenants, so suspension is enforced once rather than in 228
  places.

Refactor surface: ~69 tables, 228 policies, 76 edge functions, ~100 client
files, 4 storage buckets, 13 cron jobs.

---

## 9. Provisioning Strategy

Target: a new ISO is provisioned with **no code edit, no migration, no env
var, no infrastructure change**.

State machine (`docs/tenancy/03`): `PENDING → PROVISIONING → READY → ACTIVE`,
with `FAILED` (retryable) and `SUSPENDED`. Enforced by CHECK + transition
trigger, and recorded in `tenant_provisioning_runs` / `_steps` so each step is
independently checkpointed, idempotent and resumable.

| Step | Automated by | Currently |
|---|---|---|
| Tenant row + slug | orchestrator | manual (does not exist) |
| Default settings / branding | seed from plan template | code edit |
| Roles + permissions | seed `user_roles` for tenant | manual SQL |
| Default workflows (stages, SLA, outcome reasons) | seed from `src/config` defaults moved to data | compile-time constants |
| Storage prefix `tenants/{id}/` | orchestrator | shared buckets |
| API credentials / tenant API key | generated, hashed at rest | none |
| Integrations (NMI, Kurv, Google, Quo) | tenant-supplied during onboarding, stored in vault | single global set |
| Email sender + domain verification | Resend domain API | build-time env |
| Feature flags / entitlements | from plan | none |
| Billing plan / subscription | Stripe customer + subscription | none |
| Custom domain | DNS + auth redirect allowlist made dynamic | literal host set (A5/A6) |
| Admin invitation | `tenant_invitations` + email | `create-team-user` |
| Audit events | `tenant_audit_events` on every step | partial |

Readiness assertion before `READY`: tenant row exists, settings seeded, at
least one tenant admin membership, storage prefix reachable, entitlements
resolved, no `FAILED` steps.

---

## 10. Onboarding Strategy

Provisioning prepares infrastructure; onboarding gets the ISO productive.
Resumable, server-validated, tracked in `tenant_onboarding_state`.

| Step | Inputs | Backend action | Skippable? | Changeable later? |
|---|---|---|---|---|
| 1 Welcome | — | mark started | n/a | n/a |
| 2 Organization | legal name, DBA, address, timezone, currency | write `tenant_settings`; timezone replaces the hardcoded America/Chicago default | No | Yes |
| 3 Admin setup | name, MFA enrolment prompt | confirm membership; enforce MFA if plan requires | No | Yes |
| 4 Branding | logo, primary color, theme palette, email sender name | upload to tenant storage prefix; write settings | Yes (defaults) | Yes |
| 5 Email domain | sending domain | Resend domain create + DNS records shown; poll verification | Yes (platform fallback sender) | Yes |
| 6 Gateway/processor credentials | NMI partner key, Kurv creds | store in vault; live credential test call | Yes — but boarding is unusable until done | Yes |
| 7 Pricing & fee schedule | resale prices, tier selection | write tenant pricing (replaces `quoteSchedule.ts` constants); **cost fields internal-only, never rendered** | Yes (platform defaults) | Yes |
| 8 Operational settings | pipeline stages/labels, SLA thresholds, outcome reasons, doc requirements | write tenant workflow config | Yes | Yes |
| 9 Invite users | emails + roles | `tenant_invitations` + email | Yes | Yes |
| 10 Import existing book | CSV (reuse `CsvImport.tsx`) | staged import with validation report | Yes | Yes |
| 11 Test & validate | — | run a self-test: create a test opportunity, generate a quote PDF, send a test email, ping each configured integration | No | n/a |
| 12 Go live | confirmation | `READY → ACTIVE`; audit event | No | n/a |

Retry behavior: every step is a PUT of validated state; failures surface the
field-level error and never advance the step pointer. Steps 5, 6 and 10 are
long-running and must report progress rather than block.

---

## 11. Security Assessment

Mapped to OWASP where it applies. **Launch blockers** first.

### 11.1 Launch blockers

| ID | Finding | OWASP | Evidence |
|---|---|---|---|
| S1 | 70 policies permit any authenticated principal to read (27 `true`, 43 `auth.uid() IS NOT NULL`) | A01 Broken Access Control | `pg_policies` |
| S2 | 51 INSERT policies validate only `WITH CHECK` with no tenant/owner term → writes into other tenants | A01 | `pg_policies` |
| S3 | 60 edge functions hold service-role and bypass RLS with no tenant scoping | A01 | `grep -rl SERVICE_ROLE` |
| S4 | `useUserRole` falls back to a hardcoded admin email list when the role query fails — **fail-open privilege escalation, live today** | A01 / A04 | `src/hooks/useUserRole.ts` (A3) |
| S5 | Authorization identity is an email domain (`@merchanthaus.io`) and two SQL email literals | A01 / A07 | `src/types/opportunity.ts`, `is_admin_email()` used by 28 policies |
| S6 | `avatars` bucket is public; no bucket is tenant-namespaced | A01 | `storage.buckets` |
| S7 | 9 `verify_jwt = false` functions accept unauthenticated input, including `submit-merchant-application` which handles PII | A01 / A04 | `supabase/config.toml` |
| S8 | Backup restore has never been exercised | A09-adjacent | no restore run recorded |
| S9 | No MFA requirement for tenant admins | A07 | `configure_auth` state *Requires verification* |
| S10 | No dependency vulnerability gate in CI | A06 | `.github/workflows/ci.yml` |

### 11.2 Recommended future improvements

| ID | Finding | Note |
|---|---|---|
| S11 | Webhook authenticity is a shared secret, not HMAC (Quo, NMI, portal milestones) | `CLAUDE.md` records this as known debt |
| S12 | No CSP / security headers (`netlify.toml` has only the SPA redirect) | A05 |
| S13 | File uploads: size limit on one bucket only (`scoping-documents`, 5 MB); no server-side content-type/AV scan | A04 |
| S14 | SSRF surface in URL-fetching functions (website scrutiny, AI assistant internal URL access) needs an egress allowlist | A10 |
| S15 | Rate limiting exists (`rate_limit_events`) but coverage across the 9 public functions is unverified | A04 |
| S16 | Audit logging is fragmented across 7 tables with no unified admin view or retention policy | A09 |
| S17 | Secret rotation has no schedule or runbook | — |
| S18 | Impersonation (`impersonate-referrer`) lifts active bans and mints sessions — audited, but needs time-boxing and platform-admin-only gating | A01 |
| S19 | PII in logs: edge functions log request context; no scrubber observed | A09 |

Encryption: in transit is TLS everywhere by platform default; at rest is
Supabase-managed, plus AES-256-GCM application-level encryption on application
secrets. XSS: React escaping plus `react-markdown`; **`html2canvas`/markdown
render paths require verification** for unsanitized HTML. CSRF: bearer-token
auth, not cookie-session, so largely N/A — except the 9 unauthenticated
functions, where origin checks should be asserted. SQL injection: PostgREST +
parameterized queries; `run_sql`-style paths are platform-tool-only.

---

## 12. Operational Readiness

| Dimension | Today | Required for GA |
|---|---|---|
| Logging | Edge function logs; `client_errors`; scattered sync logs | Structured JSON with `tenant_id` + `request_id` on every edge invocation; PII scrubbing; retention policy |
| Metrics | None | Per-tenant: request volume, error rate, p95 latency, job success rate, boarding success rate, email delivery rate, ledger build outcome |
| Monitoring / alerting | None | Alerts on: cron job missed or failing, backup run failure, edge function error-rate spike, integration auth failure (NMI/Kurv/Google token expiry), payout run variance, DB connection saturation, public endpoint abuse |
| Tracing | None | `request_id` propagated SPA → edge → integration; correlate a boarding failure end to end |
| Audit | 7 tables, no unified view | `tenant_audit_events` with actor, tenant, action, before/after; admin-visible; retained per plan |
| Health checks | None | `/health` edge function asserting DB, storage, auth, and each integration's credential validity per tenant |
| Incident management | Ad hoc, owner-driven | Severity ladder, on-call, runbooks for: restore, integration outage, cross-tenant leak suspicion, payout error, email deliverability |
| Supportability | `/admin/observability` | Platform console: tenant list, provisioning state, entitlement view, impersonate-with-audit, recent errors per tenant, job history — **so diagnosis never requires production SQL** |

---

## 13. Testing Strategy

Today: **230 unit tests across 18 files**, all pure-logic libraries
(`redactCost`, `affiliatePayouts`, `residualReconciliation`, `pipeline*`,
`dealAttention`, `adminRole`, `notification-routes`, `lossReasons`,
`partnerActivity`, `referrerAssignment`, `nextPath`, `routeMatch`,
`edgeScroll`, `navigation`, `scopingRouting`). Excellent quality, narrow scope.
**Zero** integration, API, RLS, permission, provisioning, onboarding, migration
or E2E tests. **None run in CI.** `supabase/functions/` is in no tsconfig, so
Deno code passes every local check while broken — this has already happened
once.

Priority order, by business risk rather than coverage percentage:

| Pri | Layer | What | Why |
|---|---|---|---|
| P0 | CI | Add `npx vitest run` and `deno check supabase/functions/**` to the workflow | 230 tests gate nothing; Deno is untypechecked |
| P0 | RLS / isolation | Two-tenant fixture; for every table assert cross-tenant read **and write** denial, incl. the 51 INSERT-only policies | The breach case |
| P0 | Permission | Each role × each surface, asserted server-side; explicit test that a failed role query yields "unknown", never admin (S4) | Fail-open exists today |
| P0 | Money | Property tests on gateway margin, affiliate share, cap, payout run selection, billing doc sequence uniqueness under concurrency | Real money; a known live divergence (G16) |
| P0 | Cost redaction | Keep `npx vitest run redactCost` mandatory | Hardest product rule |
| P1 | Provisioning | Idempotency (same request twice), resumability, failure injection per step | Provisioning is the product's front door |
| P1 | Migration | Apply all 186 migrations to an empty DB in CI; then apply tenancy migrations to a production-shaped snapshot | 186 files, never replayed from zero |
| P1 | API / edge | Contract tests per function, incl. authz negative cases for all 9 public ones | 76 functions, no tests |
| P1 | E2E (Playwright) | Prospect→quote→MSA→boarding→live→invoice; onboarding wizard; affiliate portal | Core journeys |
| P2 | Smoke | Post-deploy: login, load pipeline, generate a PDF, ping health | Deploy confidence |
| P2 | Performance | Pipeline at 10k opportunities; ledger build across many tenants | Scale unproven |
| P2 | Regression | Lock the baseline table in `CLAUDE.md` to CI output | Baseline drift already caused false regressions |

---

## 14. Commercialization Requirements

Separated as requested.

**Technical productization (engineering owns):** plan catalog and entitlement
enforcement; Stripe subscription integration; trial expiry; usage metering
(seats, merchants, boarded accounts, storage); in-app plan/limit UI; tenant
signup; per-tenant custom domain; product analytics instrumentation;
demo/sandbox tenant with seeded illustrative data (**labelled illustrative — no
invented merchant names, volumes, savings or approval rates**, per `PRODUCT.md`).

**Business / commercial (owner owns):** pricing and packaging (undecided per
`PRODUCT.md`); Terms of Service; DPA and sub-processor list (NMI, Kurv, Google,
Resend, Supabase, Stripe, Lovable AI); privacy policy; SLA and support tiers;
security questionnaire pack and — likely, given payments — SOC 2 posture;
PCI scope statement (the system touches merchant applications and bank details;
**PCI applicability requires verification with a QSA**); implementation
guide/runbook per ISO; customer success motion; sales collateral; reseller/ISO
agreement.

Note: nothing in the repository is customer-facing marketing today, and
`PRODUCT.md` explicitly records that no testimonials, case studies, benchmarks
or pricing exist. They must not be invented.

---

## 15. Prototype-to-GA Roadmap

Alternating migration/code sessions, honoring `CLAUDE.md` ("never migrations
and client changes in one session", ">15 files needs sign-off", "never remove
`verify_jwt`").

| Wave | Content | Depends on |
|---|---|---|
| W0 | Staging environment; Vitest + Deno check in CI; migration replay in CI; restore drill; fix S4 fail-open; fix G16 commission divergence (migration-only session) | — |
| W1 | Tenancy foundation migration: `tenants`, memberships, invitations, settings, entitlements, `platform_admins`, provisioning/onboarding/audit tables, `current_tenant_id()`, state machine, legacy tenant seed + membership backfill | W0 |
| W2 | Adopt existing data: `tenant_id` on ~69 tables in 6 batches (anchors → children → activity → billing → integrations → `user_roles` alone), nullable → backfill → verify → NOT NULL + FK + index, plus the 10 uniqueness changes | W1 |
| W3 | RLS tenantization: helper predicates, 70 permissive rewrites, 51 INSERT `WITH CHECK` terms, replace `is_admin_email()`, suspension chokepoint | W2 |
| W4 | Edge functions: `requireAuth()` returns principal+tenant; sweep 60 service-role handlers; harden the 9 public entry points; make 13 cron jobs iterate tenants | W3 |
| W5 | Provisioning orchestrator + platform console skeleton | W3 |
| W6 | Client tenantization: `TenantContext`, tenant switcher + cache reset, `tenantId` in all query keys, remove `isEmailAllowed`/roster/branding-from-env, move `src/config` constants to tenant data | W3 |
| W7 | Storage: tenant-prefix namespacing, path-segment RLS, object migration, resolve the public `avatars` bucket | W2 |
| W8 | Onboarding wizard (12 steps), per-tenant integration credential vault, email domain verification | W5, W6 |
| W9 | Hardening: observability, alerting, health checks, HMAC webhooks, CSP, upload scanning, egress allowlist, audit consolidation | W4 |
| W10 | Commercialization: plans, Stripe, entitlements, trials, ToS/DPA/SLA, docs, demo tenant | parallel from W0 |
| W11 | Private beta with 2–3 design-partner ISOs | W8, W9 |
| W12 | PRR → GA | W11 |

Realistic surface: **250+ files across ~11 migrations**. This is a multi-month
programme. Anyone proposing to compress W1–W3 should be asked how they intend
to verify W3 without W0.

---

## 16. Stage Gates

Each gate: objective · retain · work · dependencies · blockers · risks ·
decisions · acceptance/exit.

**Gate 0 — Current state understood.** Objective: an evidence-based baseline.
Retain: `docs/tenancy/`, `docs/gauntlet/`, the 230 tests. Work: this document;
confirm `terminal_updates` classification; confirm mobile release state; confirm
PCI scope question owner. Blockers: none. Exit: owner signs off on §2–§6 and
answers B4 (`terminal_updates`).

**Gate 1 — Product definition validated.** Objective: agree what ships to the
first external ISO. Retain: `PRODUCT.md`. Work: decide D1 (multi-tenant vs
single-tenant instances), D2 (pricing model), MVP scope cut (§4.4 below), which
integrations are mandatory vs optional per tenant. Decisions required: D1, D2,
D5. Exit: a signed MVP scope list where every item maps to existing code or an
explicit build.

**Gate 2 — Architecture path validated.** Objective: prove the shared-Postgres
+ RLS + helper-chokepoint approach on real shapes. Retain: the whole stack.
Work: staging project; replay 186 migrations into it; load a production-shaped
snapshot; prototype `tenant_id` + tenantized helper on 3 anchor tables; measure
query plans. Blockers: **G1 staging**. Risks: index bloat, plan regressions on
`accounts`/`opportunities`. Exit: two-tenant staging where a tenantized helper
demonstrably filters, with no material query-plan regression.

**Gate 3 — Multi-tenancy enabled.** Retain: 228 policies as the starting
point. Work: W1–W4, W6, W7. Blockers: Gate 2; the `user_roles` migration must
ship alone. Risks: a missed `WITH CHECK` term = silent cross-tenant write; a
missed query key = cross-tenant cache bleed. Exit: isolation gauntlets 1–4, 8,
9, 10 green in staging against real JWTs; zero nulls/orphans on `tenant_id`;
baseline regression clean.

**Gate 4 — Provisioning automated.** Work: W5. Exit: a new tenant is created
end-to-end from the platform console with **no code, migration, env or
infrastructure change**; the same request replayed produces no duplicate; a
step failed mid-run resumes to `READY`.

**Gate 5 — Onboarding operational.** Work: W8. Exit: a new ISO admin who has
never seen the product reaches "first quote generated" unaided; the wizard
resumes after a browser close; every step is server-validated.

**Gate 6 — Product/security hardening complete.** Work: W9 + all §11.1
blockers. Exit: S1–S10 closed; restore drill passed with a documented RTO/RPO;
alerts firing on a deliberately broken cron job; dependency scan clean of
criticals.

**Gate 7 — Private beta ready.** Work: W10 essentials (ToS, DPA, invoiced
billing, support channel, docs). Exit: 2–3 design partners provisioned in
production, each isolated, each with signed agreements.

**Gate 8 — PRR passed.** Exit: §22 checklist with no FAIL, and every PARTIAL
carrying a named owner and date.

**Gate 9 — GA.** Exit: self-serve signup + subscription billing live; two
consecutive months of beta with no SEV-1 and no isolation incident; support SLA
met; runbooks exercised at least once each.

### 4.4 Scope to descope, defer or simplify (deferred from Phase 1)

- **Internal chat / DMs / notice board / reactions / presence / tri-tab dock**
  (`chat_*`, `direct_messages`, `message_reactions`, push): a large tenant-aware
  surface with real cost and no differentiation against Slack/Teams. Recommend
  **defer to post-MVP**, keep for MerchantHaus's own tenant.
- **Games/splash theming, DOOM/PS1 palettes, 3D carousel home, office
  avatars/desk slots:** charming, MerchantHaus-specific. Keep but do not
  tenantize; exclude from MVP entitlements.
- **MCP/agent server:** genuinely differentiating but prototype-grade and
  security-sensitive. Defer to post-MVP behind an entitlement.
- **Capacitor mobile apps:** defer; the responsive SPA covers iPad.
- **Backup-to-Drive:** replace with platform PITR for tenants rather than
  tenantizing a Drive integration.
- **Quo telephony, Google Gmail/Calendar sync:** keep, but make them optional
  per-tenant integrations rather than assumed.

---

## 17. Critical Path

Shortest dependency chain, current state → first production customer:

```text
W0 staging + CI gates + restore drill
   → Gate 2 tenancy prototype validated on staging
      → W1 tenancy foundation migration
         → W2 tenant_id adoption (6 batches; user_roles alone)
            → W3 RLS tenantization (helpers + 70 permissive + 51 WITH CHECK)
               → W4 edge-function tenant scoping (60 service-role handlers)
                  → W6 client TenantContext + query keys   ─┐
                  → W7 storage namespacing                  ├→ W5 provisioning
                                                            ┘   → W8 onboarding
                                                                   → Gate 6 security
                                                                      → Gate 7 beta
```

**Parallel, off the critical path:** commercialization (W10 — pricing, ToS,
DPA, Stripe integration design), observability/alerting build (W9 minus the
tenant-aware parts), documentation, demo-tenant content, descoping decisions,
mobile, MCP hardening, HMAC webhooks, CSP.

**Cannot start until predecessors complete:** any isolation *verification*
before staging exists; RLS tenantization before `tenant_id` is NOT NULL;
edge-function scoping before the helpers carry the tenant predicate;
provisioning before RLS isolates; onboarding before provisioning; beta before
security blockers close.

**Launch-preventing regardless of feature completeness:**

1. No staging environment → no isolation evidence → no defensible security claim.
2. Any single un-tenantized `USING (true)` policy or un-scoped service-role
   handler → cross-tenant breach.
3. Untested restore → an unrecoverable data-loss event in a system holding
   merchant bank details.
4. No ToS/DPA → cannot legally onboard a second company's PII.
5. The known commission/gateway-cost divergence (G16) → billing a customer
   incorrectly on day one.

---

## 18. Implementation Backlog

Dependency-ordered. Effort XS–XL, priority P0–P3.

### EPIC A — Verification foundation (unblocks everything)

**Capability A1: environments**
- A1.1 Provision staging Supabase project (or branch) with seeded two-tenant
  fixture. *Files:* new `.env.staging`, `supabase/config.toml`. *Risk:* none.
  *M / P0.* **AC:** staging reachable; production untouched; agents can write
  there.
- A1.2 Replay all 186 migrations into an empty staging DB. *L / P0.* **AC:**
  clean apply from zero, documented failures fixed.
- A1.3 Load a production-shaped, PII-scrubbed snapshot. *M / P0.* **AC:**
  row counts within an order of magnitude of production; no real PII.

**Capability A2: CI gates**
- A2.1 Add `npx vitest run` to `.github/workflows/ci.yml`. *XS / P0.* **AC:**
  a failing test fails the build.
- A2.2 Add `deno check supabase/functions/**/*.ts`. *S / P0.* **AC:** a
  syntactically broken edge function fails CI (the regression `CLAUDE.md`
  records would have been caught).
- A2.3 Add dependency scan (`npm audit --audit-level=high` or Dependabot).
  *XS / P1.*
- A2.4 Add migration-replay job. *M / P1.*
- A2.5 Publish CI output as the `CLAUDE.md` baseline table source. *S / P2.*

**Capability A3: live defects**
- A3.1 Remove the `useUserRole` fail-open fallback; failed role query ⇒
  "unknown". *Files:* `src/hooks/useUserRole.ts`, `src/lib/adminRole.ts`.
  *S / P0.* **AC:** test asserts non-admin on query error.
- A3.2 Migration-only session: correct `referrers.commission_rate` (0.5000 →
  programme rate), fix the `$15.00` gateway cost in `20260904203347`, re-derive
  affected ledger entries. *Files:* new migration. *Risk:* **restates money
  already shown to partners — needs owner sign-off.* *M / P0.* **AC:** the
  `/admin/affiliates` programme audit reports zero divergences.
- A3.3 Backup restore drill into staging; document RTO/RPO. *M / P0.*

### EPIC B — Tenancy schema

- B1.1 Tenancy foundation migration (tenants, memberships, invitations,
  settings, entitlements, platform_admins, provisioning runs/steps, onboarding
  state, audit events, `current_tenant_id()`, `is_platform_admin()`,
  `is_tenant_admin()`, state machine, legacy tenant seed, membership backfill
  from 12 users / 19 role rows). *L / P0.* **AC:** every existing user has an
  active membership; `current_tenant_id()` returns the legacy tenant; app
  behavior unchanged.
- B2.1–B2.6 `tenant_id` adoption batches 2a–2f per `docs/tenancy/05`, each:
  add nullable → backfill → validate (zero nulls, zero orphans) → NOT NULL +
  FK + index. *XL total / P0.* **AC per batch:** validation script output
  attached to the migration.
- B2.7 The 10 uniqueness changes from ADR-007. *M / P0.*
- B2.8 `user_roles` → `(tenant_id, user_id, role)` — **shipped alone**.
  *M / P0.* **AC:** admin resolution unchanged for the legacy tenant.

### EPIC C — Isolation

- C1.1 Add the tenant predicate to the 5–7 security-definer helpers.
  *M / P0.* **AC:** ~67 delegating policies filter by tenant with no policy
  edits.
- C1.2 Rewrite the 27 `USING (true)` policies. *L / P0.*
- C1.3 Rewrite the 43 `auth.uid() IS NOT NULL` policies. *L / P0.*
- C1.4 Add tenant terms to the 51 INSERT-only `WITH CHECK` policies.
  *L / P0.* **AC:** cross-tenant INSERT denied for every table.
- C1.5 Replace `is_admin_email()` with membership/platform-admin lookup;
  remove `isEmailAllowed` / `EXTRA_ALLOWED_EMAILS`. *M / P0.*
- C1.6 Suspension enforced in `current_tenant_id()`. *S / P0.*
- C2.1 `requireAuth()` returns principal + tenant instead of null.
  *M / P0.* **AC:** every caller updated; read each edited Deno file back.
- C2.2 Sweep 60 service-role functions for explicit tenant scoping.
  *XL / P0.*
- C2.3 Harden the 9 `verify_jwt = false` functions: tenant from signed payload
  or capability token; **add guards only, never remove**. *L / P0.*
- C2.4 Make the 13 cron jobs iterate active tenants. *M / P0.*
- C3.1 Storage: `tenants/{tenant_id}/…` prefixes + first-path-segment RLS +
  object migration; resolve public `avatars`. *L / P0.*
- C4.1 Two-tenant isolation test suite (read, write, storage, cache, webhook,
  cron). *L / P0.* **AC:** gauntlets 1–4, 8–10 green.

### EPIC D — Client tenantization
- D1.1 `TenantContext` alongside `AuthContext`. *M / P0.*
- D1.2 Tenant switcher + React Query cache reset on switch. *S / P0.*
- D1.3 Add `tenantId` to every `queryKey`. *L / P0.* **AC:** lint rule or test
  forbids a tenant-scoped key without it.
- D1.4 Move `src/config/{team,pricing,quoteSchedule,paymentInstructions,
  navigation}.ts` constants to tenant-scoped data with platform defaults.
  *XL / P0.* **AC:** changing a tenant's pricing requires no deploy;
  `stripInternalCostRefs` still passes (`npx vitest run redactCost`).
- D1.5 Branding, sender identity, bank details from `tenant_settings`, not
  `VITE_MH_*`. *M / P0.*
- D1.6 Dynamic auth redirect host allowlist (replaces A5/A6). *M / P1.*

### EPIC E — Provisioning & platform console
- E1.1 Provisioning orchestrator with checkpointed, idempotent steps.
  *L / P0.*
- E1.2 Platform console: tenant list, state, provisioning failure inspection,
  suspend/reactivate/retry, platform audit. *L / P1.*
- E1.3 Platform-admin impersonation with time-boxed, audited sessions
  (generalize `impersonate-referrer`). *M / P1.*

### EPIC F — Onboarding
- F1.1 `tenant_onboarding_state` API with server-side step validation.
  *M / P0.*
- F1.2 12-step resumable wizard UI. *L / P0.*
- F1.3 Per-tenant integration credential vault + live credential test.
  *L / P0.*
- F1.4 Resend domain verification flow. *M / P1.*
- F1.5 Self-test step (opportunity → quote PDF → email → integration ping).
  *M / P1.*

### EPIC G — Operability
- G1.1 Structured logging with `tenant_id` + `request_id`, PII scrubbing.
  *M / P0.*
- G1.2 `/health` per-tenant integration check. *S / P1.*
- G1.3 Metrics + alerting (cron misses, backup failures, error-rate spikes,
  integration token expiry, payout variance). *L / P0.*
- G1.4 Consolidate 7 audit tables behind one admin view + retention. *M / P1.*
- G1.5 Runbooks: restore, integration outage, suspected cross-tenant leak,
  payout error, deliverability. *M / P0.*

### EPIC H — Hardening
- H1.1 HMAC on Quo / NMI / portal webhooks. *M / P1.*
- H1.2 CSP + security headers in `netlify.toml`. *S / P1.*
- H1.3 Upload content-type/size/AV validation across all buckets. *M / P1.*
- H1.4 Egress allowlist for URL-fetching functions (SSRF). *M / P1.*
- H1.5 Rate-limit coverage audit of the 9 public functions. *S / P0.*
- H1.6 MFA requirement for tenant admins. *M / P1.*
- H1.7 Concurrency test + fix for `next_billing_doc_number` and ledger builds.
  *M / P1.*

### EPIC I — Commercialization (parallel)
- I1.1 Plan catalog + `tenant_entitlements` + enforcement helper. *L / P1.*
- I1.2 Stripe subscriptions, trials, seat/usage metering. *L / P1.*
- I1.3 Tenant self-serve signup. *M / P2.*
- I1.4 ToS, DPA, sub-processor list, privacy policy, SLA. *M / P0* (business).
- I1.5 Demo/sandbox tenant with **labelled illustrative** data. *M / P2.*
- I1.6 Product analytics + admin/implementation documentation. *M / P2.*
- I1.7 Custom domain per tenant. *M / P2.*

### EPIC J — Descoping
- J1.1 Gate chat/DM/notice board behind an entitlement; exclude from MVP.
  *M / P2.*
- J1.2 Gate MCP behind an entitlement; defer hardening. *S / P2.*
- J1.3 Decide the fate of Drive backups vs platform PITR. *S / P1.*

---

## 19. Technical Debt Register

| # | Current implementation | Why it exists | Risk now | Fix before launch? | Remediation | When |
|---|---|---|---|---|---|---|
| T1 | `useUserRole` fails open to hardcoded admin emails | defensive coding against a flaky query | **High — privilege escalation today** | **Yes** | fail closed to "unknown" | W0 |
| T2 | `is_admin_email()` = two email literals, used by 28 policies | fastest way to gate admin early | High under tenancy | Yes | membership + `platform_admins` | W3 |
| T3 | `isEmailAllowed` / `@merchanthaus.io` domain check | single-company product | High under tenancy | Yes | membership | W6 |
| T4 | Team roster in `src/config/team.ts` + `EMAIL_TO_USER` | roster was stable and small | Medium | Yes (partial) | `team_roster` is already DB-backed; finish the cutover | W6 |
| T5 | 27 `USING (true)` + 43 `authenticated`-only policies | correct for one tenant | **Critical under tenancy** | Yes | rewrite individually | W3 |
| T6 | 51 INSERT policies with no owner/tenant term | reads were the focus | **Critical under tenancy** | Yes | add tenant terms | W3 |
| T7 | 60 edge functions with service-role keys | convenience; bypasses RLS friction | **Critical under tenancy** | Yes | explicit tenant scoping | W4 |
| T8 | `supabase/functions/` in no tsconfig; Deno unchecked | Deno vs Vite tooling split | High — has already shipped a break | Yes | `deno check` in CI | W0 |
| T9 | 230 tests not in CI | tests added ad hoc | High | Yes | add to workflow | W0 |
| T10 | Shared-secret webhooks, no HMAC | speed | Medium | No | HMAC + replay window | W9 |
| T11 | `commission_rate` = 0.5000 (double) and `$15.00` gateway cost in migration `20260904203347` | drifted across five copies | **High — money** | **Yes** | migration-only correction + re-derive | W0 |
| T12 | `build_referrer_ledger()` accrues from any period, not first gateway invoice | initial simplification | Medium — money | Yes | rewrite accrual start | W0 |
| T13 | Branding/sender/bank from build-time env | one brand | Medium | Yes | `tenant_settings` | W6 |
| T14 | Trusted-auth-host literal set; single default redirect | one domain | Medium | Yes (for custom domains) | dynamic allowlist | W6 |
| T15 | `avatars` bucket public | avatar convenience | Medium | Yes | signed URLs + tenant prefix | W7 |
| T16 | 186 migrations never replayed from zero | incremental history | Medium | Yes | replay job | W0 |
| T17 | `prefer-const` downgraded to warning for `previewAuthStorage.ts` | file is regenerated and reverts fixes | Low — deliberate | No | keep the override; documented | — |
| T18 | 7 separate audit tables | grew per feature | Low | No | unified view | W9 |
| T19 | No CSP; `netlify.toml` is a redirect only | SPA default | Low–Medium | No | headers | W9 |
| T20 | Chat/notice/dock surface must be tenantized or gated | internal-tool heritage | Low | No | entitlement gate | W10 |
| T21 | `scripts/apply-migrations.sh` needs a DB password no agent holds | manual escape hatch | Low | No | keep as break-glass; document | — |
| T22 | Baseline table in `CLAUDE.md` drifts and causes false regression reports | manual maintenance | Low | No | generate from CI | W0 |

---

## 20. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A missed policy or service-role handler leaks tenant data after launch | Medium | **Catastrophic** (payments PII, bank details) | exhaustive per-table read+write isolation suite; helper chokepoint; staged beta with 2–3 tenants only |
| R2 | Tenancy programme is estimated at 250+ files and stalls half-migrated | High | High | strict batching; each batch leaves the app working; no batch merged without validation output |
| R3 | Verification is attempted on production because staging slipped | Medium | Catastrophic | Gate 2 hard-blocks on staging; connector is SELECT-only for agents |
| R4 | Money divergence (T11/T12) reaches a paying customer | Medium | High | fix in W0, before any external tenant |
| R5 | `terminal_updates` misclassified global → cross-tenant leak | Medium | High | resolve blocker B4 at Gate 0 |
| R6 | Unexercised restore fails during a real incident | Medium | Catastrophic | restore drill in W0; documented RTO/RPO |
| R7 | Integration credentials are per-platform, so one ISO's NMI key boards another's merchant | Low | Catastrophic | per-tenant vault credentials before any second tenant boards |
| R8 | Regenerated files (`previewAuthStorage.ts`, `client.ts`, `types.ts`) silently revert fixes | High | Low–Medium | never fix in generated files; encode in `eslint.config.js` as already done |
| R9 | PCI/compliance obligation discovered late | Medium | High | QSA scoping conversation before beta |
| R10 | Query-plan regression from `tenant_id` indexes on hot tables | Medium | Medium | measure at Gate 2 on a production-shaped snapshot |
| R11 | Cache bleed across tenants via a missed React Query key | Medium | High | cache reset on switch + key lint/test |
| R12 | Single-developer knowledge concentration | High | High | runbooks, decision register, CI-encoded process |
| R13 | Lovable platform coupling (client/types generation, deploy path, MCP) constrains CI/CD choices | Medium | Medium | keep generated files untouched; document the deploy path; verify a repo-only build path exists |

---

## 21. Decision Register

| # | Decision | Why it matters | Options | Recommended | Trade-offs | Decide by |
|---|---|---|---|---|---|---|
| D1 | Multi-tenant shared DB vs single-tenant instance per ISO | Determines whether the critical path is ~6 months or ~6 weeks | (a) shared multi-tenant; (b) one Supabase project per customer, provisioned from this repo; (c) (b) now, (a) later | **(c)** — sell instances to the first 2–3 design partners while building (a) | (b) has per-tenant ops cost and migration fan-out; (a) has the breach surface; (c) carries both briefly | **Gate 1 — blocks all sequencing** |
| D2 | Pricing and packaging | Gates entitlements, metering, Stripe design | per-seat; per-merchant-boarded; per-volume; flat tiers | per-seat + boarded-merchant tier (matches ISO economics) | volume pricing needs metering integrity | Gate 1 |
| D3 | `terminal_updates` — global or tenant-scoped | Wrong answer = cross-tenant leak | global platform changelog; tenant-scoped; both | global, with tenant-scoped announcements added separately | two surfaces to maintain | **Gate 0** |
| D4 | Whether internal chat/notice board is part of the product | Large tenantization cost, no differentiation | MVP; post-MVP entitlement; MerchantHaus-only | post-MVP entitlement | some ISOs will ask for it | Gate 1 |
| D5 | Are NMI/Kurv mandatory per tenant, or is the CRM usable without them | Determines onboarding blocking steps and TAM | mandatory; optional; NMI mandatory only | optional with degraded boarding, clearly signposted | optional weakens the core pitch | Gate 1 |
| D6 | Restate historical affiliate credits when fixing T11 | Real money already reported to partners | restate and correct; correct forward only; correct forward + goodwill | correct forward + explicit partner communication | restating damages trust; not restating leaves wrong history | W0 |
| D7 | PCI/SOC 2 posture and timing | Enterprise ISOs will ask; scope may constrain architecture | defer; SOC 2 Type I before GA; full Type II | scoping conversation now, Type I before GA | audit cost and calendar | Gate 2 |
| D8 | Custom domain per tenant at GA or later | Affects auth redirects and DNS automation | GA; post-GA | post-GA; platform subdomain per tenant at GA | some buyers expect their own domain | Gate 5 |
| D9 | Backups: keep Drive snapshots or rely on platform PITR | Restore credibility | keep; replace; both | replace with PITR + documented restore; retain Drive for MerchantHaus only | Drive gives an offsite copy | Gate 6 |
| D10 | Mobile apps in scope | Store review overhead | ship; defer; drop | defer | iPad-in-landscape already works responsively | Gate 1 |

---

## 22. Production Readiness Checklist

Assessed against **multi-tenant GA**. A single-tenant-instance launch (D1 option
b) would upgrade several rows — noted where it changes.

| Criterion | Status | Remediation if FAIL |
|---|---|---|
| Architecture documented | **PARTIAL** | this doc + `docs/tenancy/`; keep the architectural map current |
| Tenant isolation | **FAIL** | no tenant dimension; EPICs B, C |
| Authentication | **PARTIAL** | email + Google OAuth work; MFA absent (H1.6) |
| Authorization | **FAIL** | S4 fail-open, S5 email-literal admin, 70 permissive policies |
| Backend-enforced authz (not UI-only) | **PARTIAL** | RLS is real, but 60 service-role handlers bypass it (C2.2) |
| Service/API accounts, API keys | **FAIL** | no tenant API keys; MCP OAuth is prototype |
| Database schema & constraints | **PARTIAL** | strong model; missing tenant FKs/indexes and 10 uniqueness changes |
| Migrations | **PARTIAL** | 186 files, never replayed from zero; not applied in CI (A2.4, A1.2) |
| Backup | **PARTIAL** | hourly Drive snapshots + change queue; platform PITR *Requires verification* |
| Recovery | **FAIL** | restore never exercised; no RTO/RPO (A3.3) |
| Scalability | **PARTIAL** | fine at 115 accounts; unproven multi-tenant (Gate 2 measurement) |
| Performance | **PARTIAL** | no slow-query review, no N+1 audit, chunk-size warnings on build |
| Monitoring | **FAIL** | none (G1.3) |
| Alerting | **FAIL** | none (G1.3) |
| Logging | **PARTIAL** | platform + `client_errors`; no structure, no `tenant_id`/`request_id`, no PII scrub |
| Tracing | **FAIL** | none; add `request_id` propagation |
| Deployment | **PARTIAL** | CI builds; no deploy job, no env promotion, no versioning |
| Rollback | **FAIL** | no tagged releases, no migration-down strategy |
| Environments | **FAIL** | production only (A1.1) |
| Automated tests in CI | **FAIL** | 230 tests gate nothing (A2.1, A2.2) |
| Isolation / permission tests | **FAIL** | none exist (C4.1) |
| Provisioning | **FAIL** | manual (EPIC E) |
| Onboarding | **FAIL** | does not exist (EPIC F) |
| Support tooling | **PARTIAL** | `/admin/observability` good; no platform console (E1.2) |
| Documentation | **PARTIAL** | strong internal docs; no customer-facing admin guide |
| Billing (of ISO customers) | **FAIL** | none (I1.1, I1.2) |
| Entitlements / usage limits | **FAIL** | none |
| Compliance (ToS, DPA, privacy, SLA) | **FAIL** | none (I1.4) |
| Incident response | **FAIL** | no severity ladder, no on-call, no runbooks (G1.5) |
| Secrets management | **PARTIAL** | platform-managed; no rotation policy or runbook |
| Encryption in transit / at rest | **PASS** | TLS + platform at-rest + AES-256-GCM on application secrets |
| Cost/margin redaction rule | **PASS** | enforced at render, test-guarded |
| Rate limiting | **PARTIAL** | exists; coverage of the 9 public functions unverified (H1.5) |
| Dependency vulnerability management | **FAIL** | no scan in CI (A2.3) |
| Audit logging | **PARTIAL** | 7 tables, fragmented, no retention |
| Mobile | **NOT APPLICABLE** for GA | deferred per D10 |

---

## 23. Recommended Immediate Next Actions

In order. None of these begin the tenancy implementation.

1. **Answer D1** — multi-tenant shared database, or single-tenant instances for
   the first customers. Every date downstream depends on it.
2. **Answer D3** (`terminal_updates` scope) and D6 (whether historical affiliate
   credits get restated).
3. **Provision staging.** Nothing about isolation is verifiable until it
   exists, and `CLAUDE.md` correctly forbids exercising it on production.
4. **Close the two live defects** in W0, in separate sessions:
   T1 (`useUserRole` fail-open — client) and T11/T12 (commission rate and
   gateway cost — migration-only).
5. **Put the existing tests to work:** add `vitest` and `deno check` to CI.
   One afternoon; it converts 230 tests and 76 unchecked Deno files from
   decoration into a gate.
6. **Run a restore drill** into staging and write down the RTO/RPO.
7. **Start the commercial track in parallel** — pricing model, ToS, DPA,
   sub-processor list — since none of it depends on engineering.
8. **Then, and only then, open Gate 2:** prototype `tenant_id` plus a
   tenantized helper on `accounts`, `opportunities` and `merchants` in staging
   and measure the query plans.

Items requiring verification, and how: platform PITR availability and retention
(check the Cloud project's backup settings); current auth MFA configuration
(`supabase configure_auth` state); mobile release status (app store consoles);
PCI applicability (QSA scoping call); rate-limit coverage per public function
(read each of the 9 handlers); whether a repo-only build/deploy path exists
independent of the Lovable pipeline (attempt a clean-clone deploy to staging).
