# Multi-Tenancy Conversion — Document Set

Planning and architecture for converting the Ops Terminal from a single-company
CRM into a multi-tenant SaaS platform with automated tenant provisioning.

**Status: planning complete, implementation not started.** No schema or
application code was changed in producing these documents.

| Doc | Contents |
|---|---|
| [`00-baseline-and-audit.md`](00-baseline-and-audit.md) | Pre-change baseline (build/lint/test/typecheck) and the current-state tenancy audit |
| [`01-architecture-decisions.md`](01-architecture-decisions.md) | ADR-001…010 and the recorded business assumptions |
| [`02-tenantization-matrix.md`](02-tenantization-matrix.md) | All 75 tables classified: scope, owner, isolation, migration |
| [`03-provisioning-and-onboarding.md`](03-provisioning-and-onboarding.md) | Provisioning state machine, idempotency, recovery, onboarding wizard, jobs, cache/storage/search/webhooks |
| [`04-gauntlet-test-plan.md`](04-gauntlet-test-plan.md) | The 16 gauntlets as executable specs, fixtures, acceptance gate status, certification |
| [`05-implementation-roadmap.md`](05-implementation-roadmap.md) | Phases 0–9, sequencing constraints, effort estimate |
| [`06-gauntlet-ledger.md`](06-gauntlet-ledger.md) | 21 findings from discovery, with severity |

## The four things worth knowing

1. **There is no tenant dimension anywhere.** 75 tables, 220 RLS policies, zero
   tenant columns. The tenant today is implicit and hardcoded: MerchantHaus.

2. **The tenant is the ISO / agency** (ADR-001). Existing data becomes one
   legacy tenant. Referrers and merchants stay *inside* a tenant, which is what
   keeps the conversion additive rather than a rewrite.

3. **RLS alone will not isolate this system.** 58 of 74 edge functions hold the
   service-role key, which bypasses RLS entirely. Tenant scoping in those
   handlers (ADR-006) is not a follow-up task — it is half the security model.

4. **`account_id` is not a tenant key.** It appears on 16 tables and means
   *merchant account* — a customer of the tenant. Mistaking it for the tenant
   boundary would scope the CRM per merchant.

## Certification

> **NOT READY — BLOCKERS REMAIN**

The expected outcome of a planning-only session. Gates A (architecture),
B (ownership) and O (regression, trivially — no code changed) pass. Gates C–L
and P are `NOT RUN`; M and N are `NOT APPLICABLE` on evidence. Nothing is
claimed as verified that was not run.

The binding blocker is **no staging database** — `CLAUDE.md` records that the
Lovable connector is production and SELECT-only for agents, so no isolation
gauntlet can be executed until a staging project or Supabase branch exists.
