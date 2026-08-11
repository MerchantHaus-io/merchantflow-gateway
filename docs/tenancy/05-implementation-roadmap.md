# Implementation Roadmap

Sequenced so that each phase is independently reviewable, independently
revertible, and respects the `CLAUDE.md` invariant that **database migrations
and client changes never ship in the same session**.

Phases alternate deliberately: schema, then the code that consumes it. Each
migration phase is additive and leaves the running single-tenant app working —
that property is what makes the sequence safe to stop at any point.

---

## Phase 0 — Preconditions (blocking; not code)

| # | Item | Why it blocks |
|---|---|---|
| 0.1 | Provision a **staging** Supabase project or branch | Nothing after Phase 1 is verifiable without it. This is blocker B2 and it gates every isolation gate (C–L, P). |
| 0.2 | Confirm `terminal_updates` classification | Blocker B4. Wrong answer = cross-tenant data leak. |
| 0.3 | Confirm AS-1…AS-6 defaults or override them | Cheap to confirm now, expensive to change after backfill. |

**Do not start Phase 1 before 0.1.** Authoring migrations that cannot be
exercised produces confidence without evidence, which is worse than no
migration.

---

## Phase 1 — Tenancy foundation (migration only)

New tables only. Touches no existing table, so it cannot regress the running app.

- `tenants`, `tenant_memberships`, `tenant_invitations`
- `platform_admins`
- `tenant_provisioning_runs`, `tenant_provisioning_steps`
- `tenant_onboarding_state`
- `tenant_audit_events`
- `current_tenant_id()`, `is_platform_admin()`, `is_tenant_admin()`
- State-machine `CHECK` + transition trigger
- Seed the legacy **MerchantHaus** tenant, state `ACTIVE`
- Backfill `tenant_memberships` from the 13 existing `auth.users` / 19
  `user_roles` rows

**Exit criteria.** Legacy tenant exists; every existing user has an active
membership; `current_tenant_id()` returns the legacy tenant for all of them;
existing app behaviour unchanged.

## Phase 2 — Adopt existing data (migration only)

The large, careful one. Split into reviewable batches rather than one migration.

1. `ALTER TABLE … ADD COLUMN tenant_id uuid` — **nullable at first**
2. Backfill to the legacy tenant, directly or via parent FK
3. Verify zero nulls, zero orphans, referential integrity intact
4. `SET NOT NULL` + FK + index on `tenant_id`
5. Apply the 10 uniqueness changes from ADR-007

Suggested batches, ordered by FK depth so parents are adopted before children:

| Batch | Tables |
|---|---|
| 2a | `accounts`, `opportunities`, `merchants`, `applications` (the anchors) |
| 2b | direct children — `contacts`, `principals`, `bank_accounts`, `beneficial_owners`, `documents`, … |
| 2c | activity/comms — `activities`, `tasks`, `notifications`, `chat_*`, `direct_messages`, `synced_emails` |
| 2d | quoting/billing/commissions + the uniqueness changes |
| 2e | integrations (`kurv_*`, `google_calendar_tokens`) |
| 2f | identity — `user_roles` → `(tenant_id, user_id, role)` |

**Validation scripts are part of the deliverable, not an afterthought** (§11):
every required row has a tenant; no orphans; no uniqueness violations. Run
before each `SET NOT NULL`.

Batch 2f is the highest-risk single change in the whole programme — it changes
what "admin" means. Ship it alone.

## Phase 3 — RLS tenantization (migration only)

1. Add the tenant predicate to the security-definer helpers (ADR-005) — covers
   ~67 delegating policies
2. Rewrite the ~70 permissive policies individually (`USING (true)`,
   `USING (auth.uid() IS NOT NULL)`) — **this is the bulk of the work**
3. Add tenant terms to the 50 `WITH CHECK`-only INSERT policies — without this,
   isolation blocks reads but permits writes into other tenants
4. Replace `is_admin_email()`'s hardcoded emails with `platform_admins` /
   tenant-admin membership (finding A2)
5. Make suspension enforceable at the chokepoint: `current_tenant_id()` resolves
   only for `READY`/`ACTIVE` tenants

**Exit criteria.** Gauntlets 1–4 run green in staging against real user JWTs.
This is the first phase where isolation is actually testable — and the first
where a mistake is a breach rather than a bug.

## Phase 4 — Edge functions (code only)

1. Refactor `requireAuth()` to return the resolved principal + tenant context
   instead of `null` (ADR-006)
2. Sweep all 58 service-role functions; add explicit tenant scoping
3. Harden the 8 `verify_jwt = false` entry points — tenant from signed payload
   or capability token only
4. Make the 8 tenant-scoped cron jobs iterate tenants, skipping non-active ones

**Read every edited edge function body back in full.** `CLAUDE.md` records that
a regex edit once truncated the preflight return in five functions and no local
check caught it — Deno files are in no tsconfig.

**Exit criteria.** Gauntlets 10 and 13 green.

## Phase 5 — Provisioning & onboarding service (code only)

Provisioning orchestrator, state machine enforcement, idempotency, step
checkpointing, readiness assertion, onboarding state API with server-side step
validation.

**Exit criteria.** Gauntlets 5, 6, 7 green.

## Phase 6 — Client tenantization (code only)

1. `TenantContext` provider alongside the existing `AuthContext`
2. Tenant switcher for multi-tenant users; clear the React Query cache on switch
3. Add a `tenantId` term to all 91 `queryKey` declarations
4. Replace `isEmailAllowed` / `EXTRA_ALLOWED_EMAILS` with membership checks (A1)
5. **Remove the `useUserRole` fail-open fallback** (A3) — a failed role query
   must mean "unknown", never "admin"
6. Move the team roster from `src/config/team.ts` to tenant-scoped `team_roster` (A4)
7. Move branding and sender identity from build-time env to tenant config (A10)

**Exit criteria.** Gauntlets 8 and 16 green; baseline regression comparison clean.

## Phase 7 — Storage (migration + code, sequenced)

Namespace buckets to `tenants/{tenant_id}/…`, add storage RLS on the first path
segment, migrate existing objects, and resolve the `avatars` bucket being
public. **Exit criteria.** Gauntlet 9 green.

## Phase 8 — Platform & tenant admin UI (code only)

Platform console (list/inspect/suspend/reactivate/retry, provisioning failure
inspection, platform audit) and the tenant admin surface. **Exit criteria.**
Gauntlets 3, 14, 15 green.

## Phase 9 — Certification

Full gauntlet re-run, all 16. Regression comparison against the baseline.
Complete the ledger. Only then is a certification status other than
`NOT READY` defensible.

---

## Sequencing constraints

| Constraint | Source | Effect |
|---|---|---|
| Migrations and client changes never in one session | `CLAUDE.md` | Phases alternate; never merge a migration phase with a code phase |
| Diffs >15 files need explicit sign-off | `CLAUDE.md` | Phases 2, 3, 4, 6 exceed this — confirm scope before each |
| Never remove a `verify_jwt` guard | `CLAUDE.md` | Phase 4 may only *add* guards |
| `stripInternalCostRefs` untouched without running `npx vitest run redactCost` | `CLAUDE.md` | Phase 6 touches quote rendering — run it and report |
| Gauntlet loops capped at 3 iterations per item | `CLAUDE.md` | On the third failure, stop and report the blocker |
| `npm run build && npm run lint` after any change | `CLAUDE.md` | Every phase |

---

## Honest effort estimate

| Phase | Scale | Risk |
|---|---|---|
| 0 | — | blocking |
| 1 | ~1 migration, 8 tables | low |
| 2 | ~6 migrations, ~69 tables | **high** — data migration on live data |
| 3 | ~3 migrations, 220 policies | **highest** — a miss here is a breach |
| 4 | ~74 files | high |
| 5 | ~10 files | medium |
| 6 | ~100+ files | medium (broad, shallow) |
| 7 | 1 migration + ~15 files | medium |
| 8 | ~25 files | low |
| 9 | — | — |

Total realistic surface: **250+ files across ~11 migrations**. This is a
multi-month programme, not a single change. Anyone proposing to compress
Phases 1–3 into one pass should be asked how they intend to verify Phase 3
without Phase 0.1.
