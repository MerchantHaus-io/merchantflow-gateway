# Tenantization Matrix

Every base table in `public`, classified. Derived from a live column scan
(ownership columns), the RLS policy inventory, and the unique-constraint
inventory — not from table names.

**Scope legend**

- **T** — Tenant Scoped. Needs `tenant_id uuid not null` + FK + RLS predicate.
- **UT** — User Scoped Within Tenant. Row belongs to a user, but must still be
  constrained by tenant membership.
- **P** — Platform Scoped. Deliberately shared across tenants. Must be
  *unreachable* by tenant users, or read-only to them.
- **D** — Derived. Gets its tenant transitively via an FK; may not need its own
  column if the parent is enforced and joins are always through it. Adding the
  column anyway is recommended where the table is queried directly.

**Isolation mechanism legend**

- `RLS-direct` — policy compares `tenant_id = current_tenant_id()`
- `RLS-join` — policy resolves tenant through parent FK
- `SR-code` — reached primarily by service-role edge functions; RLS does not
  apply, so isolation must be enforced in handler code (ADR-006)
- `platform-only` — no tenant principal may reach it at all

---

## A. Core CRM — tenant scoped

| Table | Scope | Tenant owner via | Isolation | Migration | Notes |
|---|---|---|---|---|---|
| `accounts` | T | direct | RLS-direct | add col + backfill | 111 rows. Root of 16 `account_id` FKs — the anchor table. |
| `opportunities` | T | direct | RLS-direct | add col + backfill | 93 rows |
| `merchants` | T | direct | RLS-direct | add col + backfill | 56 rows |
| `applications` | T | direct | RLS-direct | add col + backfill | 89 rows, 49 cols |
| `contacts` | D→T | `account_id` | RLS-direct | add col + backfill | |
| `principals` | D→T | `application_id` | RLS-join | add col | PII |
| `beneficial_owners` | D→T | `opportunity_id` | RLS-join | add col | PII |
| `bank_accounts` | D→T | `application_id` | RLS-join | add col | **PII/financial** — unique on `application_id` |
| `merchant_consents` | D→T | `application_id` | RLS-join | add col | legal record |
| `application_documents` | D→T | `application_id` | RLS-join | add col | |
| `application_secrets` | D→T | `application_id` | SR-code | add col | secrets |
| `activities` | T | direct | RLS-direct | add col + backfill | 2,173 rows |
| `action_items` | T | direct | RLS-direct | add col | 271 rows |
| `tasks` | T | direct | RLS-direct | add col | 568 rows |
| `shared_todos` | T | direct | RLS-direct | add col | currently `USING (true)` |
| `agenda_items` | T | direct | RLS-direct | add col | currently `auth.uid() IS NOT NULL` |
| `comments` | T | direct | RLS-direct | add col | |
| `documents` | D→T | `opportunity_id` | RLS-join | add col | |
| `client_interactions` | D→T | `account_id` | RLS-direct | add col | 926 rows |
| `call_logs` | D→T | `account_id` | RLS-direct | add col | 207 rows |
| `calendar_events` | D→T | `account_id` | RLS-direct | add col | 209 rows |
| `validation_reports` | D→T | `opportunity_id` | RLS-join | add col | 219 rows |
| `website_scrutiny_reports` | D→T | `opportunity_id` | RLS-join | add col | 219 rows |
| `scoping_submissions` | T | direct | RLS-direct | add col | 83 cols |
| `onboarding_wizard_states` | D→T | `opportunity_id` | RLS-join | add col | **merchant** onboarding — not tenant onboarding (ADR-010) |
| `nmi_boarding_submissions` | D→T | `account_id` | RLS-direct | add col | |
| `terminal_updates` | T | direct | RLS-direct | add col | ⚠️ **Ambiguous** — see §D |

## B. Quoting, billing, commissions — tenant scoped, uniqueness-sensitive

| Table | Scope | Isolation | Migration | Notes |
|---|---|---|---|---|
| `quotes` | T | RLS-direct | add col; **`quote_number` → `(tenant_id, quote_number)`**; `acceptance_token` stays global | ADR-007. Only 1 policy today. |
| `quote_acceptances` | D→T | RLS-join | add col | reached unauthenticated via `accept-quote` |
| `billing_documents` | T | RLS-direct | add col; **`doc_number` → `(tenant_id, doc_number)`** | |
| `billing_doc_sequences` | T | RLS-direct | **add col + PK change** | Numbering counter — per tenant or numbers collide |
| `commission_periods` | T | RLS-direct | add col; **`(period_start, period_end)` → `(tenant_id, …)`** | |
| `commission_records` | T | RLS-direct | add col; `(period_id, nmi_gateway_id)` → `(tenant_id, …)` | |
| `commission_sync_logs` | T | SR-code | add col | |
| `nmi_partner_residuals` | T | SR-code | add col; `(period_month, nmi_merchant_id)` → `(tenant_id, …)` | `USING (true)` today |
| `referrers` | T | RLS-direct | add col; **`email` → `(tenant_id, email)`**; `auth_user_id` stays global | ADR-007 |
| `referrer_impersonation_logs` | T | RLS-direct | add col | audit of a sensitive capability |
| `lead_referrers` | T | RLS-direct | add col | |

## C. Communications, collaboration, notifications

| Table | Scope | Isolation | Migration | Notes |
|---|---|---|---|---|
| `chat_channels` | T | RLS-direct | add col; **`name` → `(tenant_id, name)`** | every tenant has a `#general` |
| `chat_messages` | T | RLS-direct | add col | 2,346 rows |
| `direct_messages` | T | RLS-direct | add col | 1,882 rows. **Both parties must be in the same tenant** — assert on insert, not just read |
| `message_reactions` | UT | RLS-join | add col | |
| `message_logs` | D→T | RLS-direct | add col | `USING (true)` today |
| `synced_emails` | UT | SR-code | add col | 3,503 rows; `user_email = current_user_email()` today |
| `notifications` | UT | RLS-direct | add col | 16,053 rows — largest tenant-scoped table |
| `push_subscriptions` | UT | RLS-direct | add col | device tokens; `USING (true)` today |
| `broadcast_acknowledgments` | UT | RLS-join | add col | |
| `admin_popups` | T | RLS-direct | add col | |
| `admin_popup_acknowledgments` | UT | RLS-join | add col | |
| `outreach_campaigns` | T | RLS-direct | add col | |
| `outreach_contacts` | T | RLS-direct | add col | marketing PII |
| `cadence_steps` | D→T | RLS-join | add col | `USING (true)` today |
| `office_avatars` | T | RLS-direct | add col; **`(desk_x, desk_z)` → `(tenant_id, …)`** | per-tenant floor plan |

## D. Support

| Table | Scope | Isolation | Migration | Notes |
|---|---|---|---|---|
| `support_tickets` | T | RLS-direct | add col; **`ticket_number` → `(tenant_id, ticket_number)`** | only 1 policy today |
| `support_ticket_comments` | D→T | RLS-join | add col | `USING (true)` today, 1 policy |

## E. Identity, roles, membership

| Table | Scope | Isolation | Migration | Notes |
|---|---|---|---|---|
| `profiles` | P (identity) | own-row | none | One human = one profile. Tenant linkage lives in `tenant_memberships`, per AS-1. |
| `user_roles` | T | RLS-direct | **`(user_id, role)` → `(tenant_id, user_id, role)`** | **Highest-risk single change.** Without it, admin in tenant A = admin everywhere. |
| `team_roster` | T | RLS-direct | add col | replaces the compile-time roster (A4) |
| `user_favorites` | UT | RLS-direct | add col | |
| `user_sessions` | UT | RLS-direct | add col (tag) | 14,543 rows |
| `google_calendar_tokens` | UT | SR-code | add col; `user_email` → `(tenant_id, user_email)` | OAuth tokens |
| `deletion_requests` | T | RLS-direct | add col | GDPR-ish workflow |
| `sop_change_requests` | T | RLS-direct | add col | |

## F. Integrations — tenant-owned credentials (ADR-008)

| Table | Scope | Isolation | Migration | Notes |
|---|---|---|---|---|
| `kurv_api_tokens` | T | SR-code | add col; `environment` → `(tenant_id, environment)` | 🔴 **Zero RLS policies — the only such table in the database.** RLS is *enabled*, so it is currently deny-all to clients and reachable only by service role. Adding a tenant column without adding policies keeps that property; adding a permissive policy here would be a credential leak. |
| `kurv_merchants` | T | SR-code | add col; `mid` stays global | |
| `kurv_deal_submissions` | T | SR-code | add col; `idempotency_key` → `(tenant_id, …)` | already has an idempotency key — reuse this pattern for provisioning |
| `kurv_sync_logs` | T | SR-code | add col | |
| `kurv_transactions_daily` | T | SR-code | add col; `(mid, business_date)` stays global | |

## G. Platform-scoped — must be unreachable by tenant principals

| Table | Scope | Isolation | Migration | Notes |
|---|---|---|---|---|
| `backup_change_queue` | P | platform-only | tag only | 39,943 rows — infrastructure |
| `backup_runs` | P | platform-only | tag only | 29,162 rows |
| `internal_cron_tokens` | P | platform-only | none | already `USING (false)` — correct |
| `rate_limit_events` | P | platform-only | tag with tenant for observability | abuse control must be cross-tenant |
| `client_errors` | P | platform-only | tag with tenant | observability |
| `mcp_audit_log` | P | platform-only | tag with tenant | |
| `audit_entries` | T + P | RLS-direct | add col | **Split required**: tenant-visible audit vs platform audit. A tenant admin must not read platform audit rows. |

---

## Ambiguity flagged, not guessed

**`terminal_updates` (67 rows).** Classified **T** provisionally. It is not
resolvable from the schema whether this means *payment-terminal* updates sent to
merchants (tenant-scoped) or *Ops Terminal* product release notes (platform
announcements). Evidence points both ways: a `send-terminal-update-email` edge
function suggests outbound merchant comms, while the page reads like a
changelog. **Tenant-scoping is the safe default** — a platform announcement
wrongly scoped to a tenant is a missing feature; a merchant comms table wrongly
made platform-wide is a cross-tenant data leak. Confirm before implementing.

---

## Counts

| Classification | Tables |
|---|---|
| Tenant Scoped (T, incl. D→T) | 60 |
| User Scoped Within Tenant (UT) | 9 |
| Platform Scoped (P) | 6 |
| Identity (own-row, unchanged) | 1 |

**Uniqueness changes required: 10.** **Tables needing a new `tenant_id`: ~69.**

---

## New tables introduced by this work

| Table | Purpose |
|---|---|
| `tenants` | the tenant entity; slug, name, status, plan |
| `tenant_memberships` | user ↔ tenant ↔ role, with status (AS-1) |
| `tenant_invitations` | pending membership by email |
| `tenant_provisioning_runs` | provisioning state machine + idempotency key |
| `tenant_provisioning_steps` | per-step outcome, retry count, failure reason |
| `tenant_onboarding_state` | server-owned wizard progress (ADR-010) |
| `platform_admins` | platform-level principals, separate from tenant roles |
| `tenant_audit_events` | tenant lifecycle audit |

`platform_admins` being a **separate table** rather than a role value in
`user_roles` is deliberate: it makes platform privilege impossible to obtain by
writing a row into a tenant-scoped table, which is the Gauntlet 3 escalation
path.
