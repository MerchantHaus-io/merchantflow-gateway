# Gauntlet Test Plan & Acceptance Gate Status

Covers §32–§52. This session produced **architecture and plan only** — no schema
or application code was changed. Therefore **no gauntlet has been executed and
no gate is claimed as PASS.** Every gate below reads `NOT RUN` or
`NOT APPLICABLE`, with the specific precondition needed to run it.

Stating otherwise would be fabrication: the gauntlets that matter require a live
two-tenant environment, and this repository has no staging database (see
`00-baseline-and-audit.md` §4).

---

## Test fixtures required (§57)

Every isolation test needs these seven principals. They do not exist yet;
building them is the first implementation task after the schema lands, because
nothing else is testable without them.

| Fixture | Description |
|---|---|
| `platform_admin` | row in `platform_admins`, no tenant membership |
| `tenant_a` | tenant, state `ACTIVE` |
| `tenant_a_admin` | active membership in A, admin role |
| `tenant_a_member` | active membership in A, member role |
| `tenant_b` | tenant, state `ACTIVE` |
| `tenant_b_admin` | active membership in B, admin role |
| `tenant_b_member` | active membership in B, member role |

Plus, for negative cases: `suspended_member` (membership `status='suspended'`),
`no_membership_user` (authenticated, belongs to nothing), and `anon`.

**Critical fixture requirement.** Isolation tests must run through a **real
user JWT against PostgREST**, not through the service role. `CLAUDE.md` makes
this point precisely: `query_database` bypasses RLS and so is "querying
underneath the thing being tested". A policy that reads correctly and does not
bite is exactly the defect these tests exist to find, and the service role
cannot see it.

---

## The canonical test matrix (§56)

Applied to **every** tenant-scoped resource in `02-tenantization-matrix.md`:

| Actor | Target | Expected |
|---|---|---|
| Tenant A member | Tenant A resource | PASS |
| Tenant A member | Tenant B resource | **DENIED** |
| Unauthenticated | Tenant A resource | **DENIED** |
| Tenant A member | admin-only operation in A | **DENIED** |
| Tenant A admin | authorized operation in A | PASS |
| Tenant A admin | any operation in B | **DENIED** |
| Platform admin | platform operation | PASS |
| Suspended member | any operation in A | **DENIED** |
| Member of suspended tenant | any operation | **DENIED** |

---

## Gauntlet status

| # | Gauntlet | Status | Precondition to run |
|---|---|---|---|
| 1 | Cross-tenant IDOR | **NOT RUN** | schema + RLS deployed; two tenants seeded; tests issue real user JWTs |
| 2 | Tenant enumeration | **NOT RUN** | as above; needs error-shape and timing comparison |
| 3 | Privilege escalation | **NOT RUN** | `platform_admins` + tenant-scoped `user_roles` deployed |
| 4 | Tenant context forgery | **NOT RUN** | `current_tenant_id()` deployed |
| 5 | Provisioning races | **NOT RUN** | provisioning service deployed; needs concurrent invocation |
| 6 | Failure injection | **NOT RUN** | provisioning steps deployed; needs fault injection hooks |
| 7 | Onboarding manipulation | **NOT RUN** | onboarding state + server validation deployed |
| 8 | Cache leakage | **NOT RUN** | tenant-scoped query keys deployed |
| 9 | File access | **NOT RUN** | storage namespacing + storage RLS deployed |
| 10 | Background job leakage | **NOT RUN** | cron jobs made tenant-aware |
| 11 | Webhook isolation | **N/A** | no per-tenant outbound webhooks exist (`03` §8) |
| 12 | Search leakage | **N/A** | no external search index; search is RLS-inherited (`03` §8) |
| 13 | Reporting / analytics | **NOT RUN** | requires aggregate query audit post-RLS |
| 14 | Tenant suspension | **NOT RUN** | suspension deployed |
| 15 | Deletion / deprovisioning | **NOT RUN** | soft-delete deployed (AS-3) |
| 16 | Regression | **NOT RUN** | any implementation at all |

Gauntlets 11 and 12 are `NOT APPLICABLE` on evidence, not by assumption —
justification is in `03-provisioning-and-onboarding.md` §8. Both become
applicable the moment an external search index or outbound webhook config is
introduced.

---

## Gauntlet designs (executable specifications)

### G1 — Cross-tenant IDOR

For each of the 60 tenant-scoped tables, authenticated as `tenant_a_member`,
attempt `SELECT` / `UPDATE` / `DELETE` against a known Tenant B row id, and
`INSERT` a row carrying `tenant_id = tenant_b`.

Highest-value targets, ranked by blast radius from the audit:

1. `accounts` — 111 rows, root of 16 FK chains
2. `notifications` — 16,053 rows
3. `synced_emails` — 3,503 rows, email bodies
4. `bank_accounts`, `principals`, `beneficial_owners` — financial PII
5. `direct_messages` — 1,882 rows, private messages
6. `kurv_api_tokens` — integration credentials

The insert case is the one usually missed: RLS `USING` governs reads, and only
a `WITH CHECK` clause stops a user writing a row *into another tenant*. 50 of
the 220 existing policies are `WITH CHECK`-only INSERT policies with a `null`
`USING` — each needs a tenant term added.

Any success = **CRITICAL**, blocks certification (§51).

### G2 — Tenant enumeration

Confirm that a wrong-tenant id and a nonexistent id are indistinguishable —
same status code, same body, comparable timing. Check paginated list endpoints
for total counts that include other tenants' rows, and check that
`tenants.slug` uniqueness cannot be used as an existence oracle during
provisioning (a "slug taken" error discloses that a tenant exists). Recommended
mitigation: return the same response shape for taken-and-invalid, and rate-limit
slug checks via the existing `rate_limit_events` machinery.

### G3 — Privilege escalation

- Member writes `user_roles` row granting themselves `admin` → must be denied by
  RLS `WITH CHECK`, not merely hidden in the UI.
- Tenant admin writes a `platform_admins` row → must be denied.
- Tenant A admin sets `tenant_id = tenant_b` on their own membership → denied.
- Invitation flow: invite accepted for a different tenant than the one it was
  issued for → denied; invitation must bind tenant, email, and role at creation
  and be single-use.
- JWT tampering: forged `tenant_id` claim → ignored, because context resolves
  from `tenant_memberships` (ADR-004), not from claims.

**Regression test worth writing first:** the `useUserRole` fail-open path (A3).
It grants admin from a hardcoded email list when the role query *errors*. Under
multi-tenancy that is a cross-tenant admin grant triggered by a network blip.

### G4 — Context forgery

Send `X-Tenant-Id`, a mismatched `Host`, an altered subdomain, a tampered JWT
claim, and a modified cookie — each while authenticated as `tenant_a_member`
targeting Tenant B. All must resolve to Tenant A. Assert that no code path reads
a tenant identifier from the request as an authorization input.

### G5 — Provisioning races

Fire 10 concurrent identical provisioning requests (same idempotency key), and
separately 10 with the same slug but different keys. Assert: exactly one
`tenants` row, exactly one admin membership, exactly one of each default record,
and one deterministic final state. Repeat with a worker killed mid-run to
simulate queue redelivery.

### G6 — Failure injection

For each mandatory step, inject a failure and assert: run lands in
`PROVISIONING_FAILED`, the failed step is identified with an error code, the
tenant is **not** in `READY`/`ACTIVE`, and retry resumes rather than duplicates.
The specific assertion that catches false activation: a tenant whose step 5
(admin creation) failed must never be reachable by any user.

### G7 — Onboarding manipulation

Submit step 10 first; submit step 7 while on step 3; replay a completed step;
submit with another tenant's id; submit from two tabs with a stale `version`.
Expected: `409`/`422`, state unchanged, and activation refused while any
mandatory step is incomplete.

### G13 — Reporting / analytics

Audit every aggregate (`Reports.tsx`, `Commissions.tsx`, dashboards, exports,
`export-data`) for `COUNT`/`SUM` computed without a tenant predicate. Aggregates
are the classic leak: individual row access is denied while a total silently
includes every tenant. Note that `export-data` runs with the service role and
so bypasses RLS entirely — it needs an explicit tenant filter in code.

### G16 — Regression

Compare against the recorded baseline:

| Check | Baseline | Fail condition |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | silent | any output |
| `npm run lint` | 0 errors, 330 warnings | any error; warning rise attributable to changed files |
| `npx vitest run` | 112 passing, 7 files | any failure or reduced count |
| `npm run build` | succeeds | failure |
| `npx vitest run redactCost` | passes | any failure — mandatory whenever the cost-redaction path is touched |

Per `CLAUDE.md`: edge functions are not covered by `tsc`. Any edited edge
function must be read back in full after editing.

---

## Acceptance gates (§52)

| Gate | Subject | Status |
|---|---|---|
| A | Architecture — tenant model defined | ✅ **PASS** — ADR-001…010, confirmed with owner |
| B | Ownership — every resource classified | ✅ **PASS** — all 75 tables in `02`, one ambiguity flagged not guessed |
| C | Isolation — cross-tenant tests pass | ⛔ **NOT RUN** |
| D | Authorization — server-side enforcement | ⛔ **NOT RUN** |
| E | Provisioning — fresh tenant provisions | ⛔ **NOT RUN** |
| F | Idempotency — retries do not corrupt | ⛔ **NOT RUN** |
| G | Recovery — interrupted provisioning recoverable | ⛔ **NOT RUN** |
| H | Onboarding — tenant can complete it | ⛔ **NOT RUN** |
| I | Persistence — onboarding survives interruption | ⛔ **NOT RUN** |
| J | Background systems — context preserved | ⛔ **NOT RUN** |
| K | Storage — tenant files isolated | ⛔ **NOT RUN** |
| L | Cache — isolation verified | ⛔ **NOT RUN** |
| M | Search — isolation verified | ➖ **NOT APPLICABLE** (evidence in `03` §8) |
| N | Webhooks — isolation verified | ➖ **NOT APPLICABLE** (evidence in `03` §8) |
| O | Regression — none from baseline | ✅ **PASS (trivially)** — no code changed; baseline re-verified this session |
| P | Automated testing — tenancy covered | ⛔ **NOT RUN** — no tenancy tests exist |

Gates A, B and O pass on their merits. Gate O passes only in the trivial sense
that this session changed no code; it carries no information about the eventual
implementation.

---

## Certification status

> ### NOT READY — BLOCKERS REMAIN

Not a defect in the plan — the correct and expected outcome of a
planning-only session. Multi-tenancy is designed, not implemented.

### Blockers (§53)

| # | Blocked | Why | Minimum to unblock |
|---|---|---|---|
| B1 | All isolation/provisioning gauntlets (C–L, P) | No schema exists to attack | Implement Phase 1–2 of `05-implementation-roadmap.md` |
| B2 | Any live verification | No staging database. `CLAUDE.md`: the Lovable connector is production and SELECT-only for agents | Provision a staging Supabase project, or a Supabase branch, seeded with the seven fixtures |
| B3 | Migration + client work in one pass | `CLAUDE.md` forbids shipping migrations and client changes in the same session | Sequence across sessions per `05` — this is a process constraint, not a technical one |
| B4 | `terminal_updates` classification | Not derivable from schema; both readings are plausible and one is a data-leak risk | One answer from the product owner (`02` §"Ambiguity flagged") |

### Zero-tolerance conditions (§51)

None triggered — and none *testable* yet. The four conditions (cross-tenant
exposure, tenant privilege escalation, platform privilege escalation,
provisioning corruption, false activation) all require a running implementation.
Their absence here reflects no implementation, not a clean bill of health.
