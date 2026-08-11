# Tenant Provisioning & Onboarding — Design

Covers §15–§23 of the brief. Design only; no SQL or application code is written
in this session (see `05-implementation-roadmap.md` for sequencing).

---

## 1. Provisioning state machine

```
                    ┌──────────────────────┐
                    │       PENDING        │  run row created, nothing executed
                    └──────────┬───────────┘
                               │ claim (atomic)
                    ┌──────────▼───────────┐
                    │    PROVISIONING      │  steps executing
                    └───┬──────────────┬───┘
              all steps │              │ any mandatory step failed
                     ok │              │
        ┌───────────────▼──┐        ┌──▼─────────────────────┐
        │ CONFIGURATION_   │        │ PROVISIONING_FAILED    │
        │ REQUIRED         │        │ (retryable)            │
        └───────┬──────────┘        └──┬─────────────────────┘
     onboarding │                      │ retry (same idempotency key)
       complete │                      └──────► PROVISIONING
        ┌───────▼──────────┐
        │      READY       │  readiness assertion passed
        └───────┬──────────┘
                │ first successful admin sign-in
        ┌───────▼──────────┐
        │      ACTIVE      │◄────────┐
        └───────┬──────────┘         │ reactivate
                │ suspend            │
        ┌───────▼──────────┐         │
        │    SUSPENDED     │─────────┘
        └───────┬──────────┘
                │ deprovision (soft, AS-3)
        ┌───────▼──────────┐      ┌────────────────┐
        │  DEPROVISIONING  │─────►│ DEPROVISIONED  │  terminal
        └──────────────────┘      └────────────────┘
```

### Legal transitions

| From | To | Trigger |
|---|---|---|
| `PENDING` | `PROVISIONING` | worker claims the run |
| `PROVISIONING` | `CONFIGURATION_REQUIRED` | all mandatory steps succeeded |
| `PROVISIONING` | `PROVISIONING_FAILED` | a mandatory step failed |
| `PROVISIONING_FAILED` | `PROVISIONING` | retry with the same idempotency key |
| `CONFIGURATION_REQUIRED` | `READY` | onboarding required steps complete **and** readiness assertion passes |
| `READY` | `ACTIVE` | first successful tenant-admin sign-in |
| `ACTIVE` | `SUSPENDED` | platform admin action |
| `SUSPENDED` | `ACTIVE` | platform admin action |
| `ACTIVE` \| `SUSPENDED` | `DEPROVISIONING` | platform admin action |
| `DEPROVISIONING` | `DEPROVISIONED` | terminal |

Everything else is illegal. Enforce with a `CHECK` constraint plus a
`BEFORE UPDATE` trigger that rejects transitions not in the table above — not in
application code alone, because 58 edge functions can write with the service
role and bypass any application guard (ADR-006).

**The invariant that matters (§59):** only `READY` and `ACTIVE` may serve
tenant traffic. `CONFIGURATION_REQUIRED` deliberately sits between "provisioned"
and "usable" so that a tenant whose mandatory setup is incomplete can never be
mistaken for an operational one.

---

## 2. Provisioning steps

Each step writes a row to `tenant_provisioning_steps` with
`(run_id, step_key, status, attempt, error_code, error_detail, started_at,
finished_at)`.

| # | Step | Mandatory | Idempotent by |
|---|---|---|---|
| 1 | Validate request (slug format, slug free, admin email shape) | ✅ | pure |
| 2 | Create `tenants` row | ✅ | unique slug |
| 3 | Create default tenant configuration | ✅ | unique `(tenant_id)` |
| 4 | Create default roles for the tenant | ✅ | unique `(tenant_id, role)` |
| 5 | Create or invite the initial tenant admin | ✅ | unique `(tenant_id, email)` |
| 6 | Assign plan / feature flags | ✅ | upsert on `tenant_id` |
| 7 | Seed required reference records (stages, default chat channel, doc sequence) | ✅ | unique `(tenant_id, key)` |
| 8 | Initialize storage prefixes | ✅ | idempotent by path |
| 9 | Create integration placeholders (NMI / Kurv / calendar — empty, disabled) | ➖ optional | unique `(tenant_id, provider)` |
| 10 | Write audit record | ✅ | append-only |
| 11 | **Readiness assertion** | ✅ | pure re-check |
| 12 | Mark `CONFIGURATION_REQUIRED` | ✅ | state guard |

Step 11 is the guard against false activation. It **re-queries** for the
artifacts of steps 2–8 rather than trusting that those steps reported success.
A step row saying `succeeded` and the artifact being absent is exactly the
corruption this exists to catch.

Step 9 is optional by design: a tenant can operate before its NMI credentials
exist. Marking it mandatory would block provisioning on a third party.

---

## 3. Idempotency (§17, §60)

**Key.** The caller supplies `Idempotency-Key`; if absent, derive it
deterministically as `sha256(lower(slug) || ':' || lower(admin_email))`.

**Storage.** `tenant_provisioning_runs.idempotency_key` carries a `UNIQUE`
constraint. This is the same pattern the codebase already uses on
`kurv_deal_submissions.idempotency_key` — reuse it rather than inventing a
second convention.

**Semantics.**

| Situation | Behaviour |
|---|---|
| First request | insert run, return `201` + run id |
| Duplicate while `PROVISIONING` | return `200` + existing run id, **do not** re-execute |
| Duplicate after `READY` | return `200` + existing tenant, no side effect |
| Duplicate after `PROVISIONING_FAILED` | resume from the first non-succeeded step |

**Race control.** Claiming a run must be a single atomic statement:

```
UPDATE tenant_provisioning_runs
   SET state = 'PROVISIONING', claimed_at = now(), claimed_by = :worker
 WHERE id = :id AND state IN ('PENDING','PROVISIONING_FAILED')
RETURNING id;
```

Zero rows returned means another worker owns it — exit, do not proceed. Two
concurrent submissions therefore produce one tenant and one admin (Gauntlet 5).

A `UNIQUE` index on `tenants.slug` is the backstop: even if the state machine
were bypassed entirely, the second insert fails.

---

## 4. Failure recovery (§18, §31)

Each step is individually recorded, so recovery is resumption, not restart:

- **Retryable** (`TRANSIENT`) — network, third-party 5xx, lock timeout. Retry
  with backoff; `attempt` increments; step re-runs.
- **Terminal** (`INVALID`) — slug taken, malformed admin email. Retry cannot
  help; surface to the platform admin for correction.

Steps 2–8 are each independently idempotent (table above), so re-running a
partially-completed run is safe by construction rather than by careful ordering.

**Not wrapped in one transaction, deliberately.** Steps 5, 8 and 9 have
side effects outside Postgres (auth user creation, storage, third-party APIs)
that no database transaction can roll back. A single transaction would produce
a rolled-back database with orphaned external artifacts — worse than a recorded
partial state. Checkpointing is the correct model here.

Observability per §31: every step row carries `error_code`, `error_detail`,
`attempt`, timestamps, and a `correlation_id` propagated from the request.
Nothing is swallowed.

---

## 5. Tenant onboarding wizard (§19–§21)

Steps derived from what this product actually needs, not a generic template:

| # | Step | Required for `READY` | Backed by |
|---|---|---|---|
| 1 | Organization details (legal name, slug, timezone) | ✅ | `tenants` |
| 2 | Administrator confirmation (verify email, set password) | ✅ | auth + `tenant_memberships` |
| 3 | Business profile (ISO/agency details, support contact) | ✅ | tenant config |
| 4 | Branding (logo, colors, sender identity) | ➖ | tenant config — replaces A10 build-time env |
| 5 | Team invitations | ➖ | `tenant_invitations` |
| 6 | Roles & permissions review | ➖ | `user_roles` (tenant-scoped) |
| 7 | Pricing / quote schedule defaults | ✅ | tenant config — the app cannot quote without it |
| 8 | Integrations (NMI, Kurv, Google Calendar, Resend) | ➖ | tenant integration records |
| 9 | Operational settings (business hours, SLA, notification routing) | ➖ | tenant config |
| 10 | Review & activate | ✅ | readiness assertion |

Steps 4, 5, 6, 8 and 9 are optional because the product demonstrably functions
without them today. Steps 1, 2, 3, 7 and 10 are mandatory because the quoting
engine — the core of this product — cannot produce a correct document without an
organization identity and a pricing schedule.

### Server-owned state (§20)

`tenant_onboarding_state` holds `(tenant_id, current_step, completed_steps[],
step_payloads jsonb, updated_at, version)`. The wizard renders from this.

Survives refresh, logout, and device change because none of it is client state.
Concurrent tabs are handled by optimistic concurrency on `version`: a stale
submission is rejected with `409`, not silently applied.

### Server-side validation (§21)

Enforced on every step submission:

1. Caller is an **active member** of the target tenant with an admin role.
2. Target tenant is in `CONFIGURATION_REQUIRED`.
3. The submitted step is the current step, or an already-completed step being
   revised — **never a later one**. This is the Gauntlet 7 defence.
4. Step payload validates against that step's schema (`zod` — already a
   dependency, matching existing convention).
5. Activation (step 10) re-runs the readiness assertion server-side and refuses
   if any mandatory step is incomplete.

The frontend may hide, grey out, or skip steps for UX. None of that is a
control. Every rule above is re-checked server-side on submission.

---

## 6. Administration surfaces

### Tenant admin (§22)

Tenant details, team & invitations, roles, configuration, branding,
integrations, plan (read-only), onboarding status. Every query filtered by
`current_tenant_id()`; a tenant admin never receives a tenant selector for a
tenant they are not a member of.

### Platform admin (§23)

List tenants, inspect status, suspend, reactivate, retry provisioning, inspect
provisioning failures, view platform audit.

Authorization comes from `platform_admins` membership **only** — never from a
tenant role, and never from an email literal. This is the concrete fix for A2
(`is_admin_email()` hardcoding two addresses across 28 policies). While that
function exists in its current form, those two accounts are effectively platform
superusers in every future tenant.

### Suspension semantics (§46)

`SUSPENDED` blocks tenant-user access at the RLS layer — `current_tenant_id()`
resolves only for tenants in `READY` or `ACTIVE`, so suspension is enforced in
the same chokepoint as isolation rather than in a separate check that could be
missed. Data is preserved untouched; platform admins retain access; scheduled
jobs must skip suspended tenants explicitly (see §7 below). Reactivation
restores access with no data migration.

---

## 7. Background jobs and tenant context (§24)

13 `pg_cron` jobs exist today, every one of them tenant-blind:

```
process-scheduled-campaigns  */5 * * * *     calendar-reminders          */15 * * * *
portal-merchant-status-sync  */15 * * * *    inactive-user-reminder      0 14 * * 1-5
quo-sync-calls-hourly        0 * * * *       gmail-poll-support-5min     */5 * * * *
archive-stale-closed-tickets 17 * * * *      backup-snapshot-hourly      0 * * * *
backup-flush-changes         10 seconds      purge-stale-documents-daily 15 8 * * *
nmi-partner-residuals-daily  0 13 * * *      prune-rate-limit-events     0 * * * *
prune-client-errors          30 3 * * *
```

Two classes:

- **Platform jobs** — `backup-*`, `prune-*`. Correctly cross-tenant. Leave alone.
- **Tenant jobs** — the other 8. Each must iterate tenants explicitly and
  resolve context per tenant, skipping any tenant not in `READY`/`ACTIVE`.

The failure mode to design against: a job that processes "all pending campaigns"
will happily send Tenant A's outreach using Tenant B's sender identity and
credentials. The fix is that the job loop is the tenant loop — payloads carry
`tenant_id`, and the per-tenant handler resolves credentials from that tenant,
never from a process-wide default. Retries must re-resolve context from the
persisted payload rather than inheriting whatever context the worker last held.

---

## 8. Cache, storage, search, webhooks

**Cache (§25).** 91 `queryKey` declarations in `src/`, none tenant-scoped —
e.g. `["billing-docs", accountId]`, `["profiles-map"]`. React Query caches are
per-browser-session, so cross-tenant poisoning requires one user switching
tenants in one session — which AS-1 makes a supported flow. Every key needs a
`tenantId` term, and the cache must be cleared on tenant switch. `AuthContext`
already holds a `queryClient` and clears on sign-out; extend that to switching.

**Storage (§26, §41).** 4 buckets: `avatars` (public), `chat-attachments`,
`opportunity-documents`, `scoping-documents`. Paths are not tenant-namespaced
today. Move to `tenants/{tenant_id}/...` and add storage RLS policies keyed on
the first path segment. Note that the app already uses short-lived
`createSignedUrl` (60s–3600s) — good, but a signed URL is a bearer capability:
namespacing changes what can be *requested*, not what an already-issued URL
grants. `avatars` being public means anything in it is world-readable
regardless of tenant.

**Search (§27, §44).** No dedicated search index (no Algolia/Elastic/`tsvector`
usage found). Search is Postgres `ilike` filtering inside normal queries, so it
inherits RLS isolation automatically. **Gate M is therefore NOT APPLICABLE** —
but only for as long as that stays true; introducing an external index would
create a new, separately-scoped isolation surface.

**Webhooks (§28, §43).** Inbound only. The 8 `verify_jwt = false` functions are
the surface. There is no per-tenant outbound webhook configuration, so
"Tenant A event delivered to Tenant B endpoint" is not currently reachable —
**Gate N is NOT APPLICABLE**. Inbound webhooks must resolve tenant from the
signed payload or a capability token, never from a request field (ADR-006).
