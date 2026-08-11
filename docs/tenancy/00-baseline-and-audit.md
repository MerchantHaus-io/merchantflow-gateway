# Multi-Tenancy — Baseline Report & Current-State Tenancy Audit

Produced during DISCOVER. No application code was modified to produce this
document. Every claim below is backed by a command or query run against this
repository or the live Postgres (via the Lovable connector, project
`d4e766df-1ab4-4f95-a16a-4c8c4222778a`).

---

## 1. Baseline Report (pre-change)

Established after `npm install` (dependencies were absent on a fresh clone —
the first `npm run build` failed with `vite: not found`, which is an
environment artifact, not a repo defect).

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | **PASS** — silent |
| Lint | `npm run lint` | **PASS** — 0 errors, 330 warnings |
| Unit tests | `npx vitest run` | **PASS** — 112 passing, 7 files |
| Build | `npm run build` | **PASS** — chunk-size warnings only |

Notes:

- `CLAUDE.md` records the test baseline as *92 passing, 6 files* as of 9 Aug
  2026. Actual is **112 passing, 7 files**. This is drift from unrelated work
  landing on `main`, not a regression — the count moved **up** and no test
  fails. The `CLAUDE.md` baseline table should be re-dated.
- There is no `npm test` script, as `CLAUDE.md` warns. `npx vitest run` is the
  real entry point.
- `tsc` does not cover `supabase/functions/` (Deno, in no tsconfig). Edge
  function changes pass every local check while being syntactically broken.

**Pre-existing failures: none.** Any failure appearing after this point is
attributable to tenantization work.

---

## 2. What this application actually is

`merchantflow-gateway` is the **Ops Terminal**: a single-company internal CRM
for MerchantHaus, a payments ISO. It is a Vite + React + TypeScript SPA backed
by Supabase (Postgres + Auth + Storage + 80 Deno edge functions), deployed to
Netlify, with a Capacitor mobile wrapper.

Live data scale (real counts, not estimates):

| Entity | Rows |
|---|---|
| `auth.users` | 13 |
| `profiles` | 12 |
| `user_roles` | 19 |
| `accounts` (merchant accounts) | 111 |
| `merchants` | 56 |
| `referrers` (external partners) | 4 |

Surface area: **75 public tables**, 2 views, **220 RLS policies**, **179 migrations**, **80 edge functions**,
~350 files under `src/`.

---

## 3. Current-state tenancy audit — the finding that matters

> **There is no tenant dimension anywhere in this system.**

This is not "partially tenanted" or "tenanted by convention". It is a
deliberately single-tenant application in which the tenant is *implicit and
hardcoded*: the tenant **is** MerchantHaus.

### 3.1 No tenant column exists

A scan of every column in `public` for `tenant|org|workspace|company|owner_id`
returns **zero** tenant-like ownership columns:

| Column found | Tables | What it actually means |
|---|---|---|
| `account_id` | 16 | FK to `accounts` — a **merchant account** (a customer of MerchantHaus). Not a tenant. |
| `company_name` | 5 | Free-text label on an application/commission row. Not a key. |
| `company` | 1 | Free-text field on `outreach_contacts`. |

`account_id` is the single most dangerous false friend here: it looks like a
tenant key, is named like one in many SaaS codebases, and is not one. Treating
it as the tenant boundary would scope the CRM *per merchant customer*, which is
not what the product is.

### 3.2 RLS is enabled everywhere, and isolates nothing tenant-wise

All 75 tables have `relrowsecurity = true`. That is a genuine strength — the
groundwork for policy-based isolation is already laid. But the predicates
themselves carry no tenant term. Distribution of `USING` expressions across all
policies:

| Predicate | Policies | Effective meaning |
|---|---|---|
| `null` (INSERT-only `WITH CHECK`) | 50 | — |
| `is_internal_staff()` | 35 | "you are MerchantHaus staff" |
| `is_admin_email()` | 28 | "you are one of two hardcoded people" |
| `(auth.uid() IS NOT NULL)` | 43 | **"you are logged in at all"** |
| `true` | 27 | **no restriction at the row level** |
| `(auth.uid() = user_id)` | 10 | per-user, tenant-agnostic |
| `referrer_owns(referrer_id)` | 4 | per-partner (see 3.4) |

The two rows in bold are the ones that make this a single-tenant database:
`auth.uid() IS NOT NULL` on 43 policies and `true` on 27 means that for a large
part of the schema, **any authenticated principal can read every row**. That is
correct and safe today precisely *because* every authenticated principal
belongs to the same company. It becomes a mass cross-tenant data breach the
moment a second tenant exists.

### 3.3 Isolation funnels through six security-definer functions

This is the single most important architectural fact for the conversion. The
policies do not each hand-roll their predicate; they delegate:

```sql
is_internal_staff()   -- auth.uid() is not null AND not a referrer
                      -- AND user_roles has 'staff' or 'admin'
is_admin_email()      -- email IN ('admin@merchanthaus.io','jamie@merchanthaus.io')
is_merchanthaus_staff() -- has_role(auth.uid(), 'finance')
has_role(uuid, app_role)
referrer_owns(uuid)   -- _referrer_id = current_referrer_id()
referrer_owns_account(uuid)
current_user_email()
```

All are `STABLE SECURITY DEFINER SET search_path TO 'public'` — correctly
written. Because ~110 policies delegate to these seven functions, **the tenant
predicate can be introduced in the functions rather than in every policy.**
That converts a 110-policy rewrite into a much smaller, reviewable change with
a single chokepoint to test. This is the highest-leverage finding in the audit.

Caveat, and it is a real one: a `USING (true)` or `USING (auth.uid() IS NOT
NULL)` policy delegates to *nothing*, so it cannot inherit a tenant predicate
from a helper. Those 70 policies must be edited individually. The helper
chokepoint covers the `is_internal_staff` / `is_admin_email` / `referrer_owns`
population (~67 policies), not the permissive population.

### 3.4 The one existing multi-party mechanism

`referrers` (4 rows) are external partners who log in and see only their own
referred accounts, via `referrer_owns()` / `referrer_owns_account()` and a
dedicated portal (`src/pages/portal/`). Supporting machinery already exists:
`impersonate-referrer`, `referrer_impersonation_logs`,
`src/integrations/supabase/impersonationClient.ts`.

This is the closest thing to tenancy in the codebase and it is a useful proof
that the team can express row-ownership isolation. It is **not** a tenant
boundary: referrers are a *role within* MerchantHaus's data, they share the
same `accounts` table, and their scoping is per-row-FK rather than per-tenant.

### 3.5 Hardcoded single-tenant assumptions (inventory)

| # | Assumption | Location | Risk class |
|---|---|---|---|
| A1 | Access = email is `@merchanthaus.io` or on a literal allowlist | `src/types/opportunity.ts` `isEmailAllowed`, `EXTRA_ALLOWED_EMAILS` | Authorization |
| A2 | Admin = two hardcoded email literals, **in SQL** | `is_admin_email()`, used by 28 policies | Authorization |
| A3 | Admin fallback = two hardcoded emails, **in the client** | `src/hooks/useUserRole.ts` — falls back to an email list when the DB query errors | Authorization / fail-open |
| A4 | Team roster is a compile-time constant | `src/config/team.ts`, `src/types/opportunity.ts` | Isolation / UX |
| A5 | Auth redirect host allowlist is a literal set | `AuthContext.tsx` `isTrustedAuthHost` | Operational (blocks custom domains) |
| A6 | Default redirect is one fixed origin | `AuthContext.tsx` `DEFAULT_REDIRECT_URL` | Operational |
| A7 | 27 policies are `USING (true)` | see 3.2 | **Isolation — critical under multi-tenancy** |
| A8 | 43 policies are `USING (auth.uid() IS NOT NULL)` | see 3.2 | **Isolation — critical under multi-tenancy** |
| A9 | 8 edge functions run with `verify_jwt = false` | `supabase/config.toml` | Isolation (unauthenticated entry points) |
| A10 | Branding, bank details, sender identity from build-time env | `.env.example` (`VITE_MH_ACTIVATION_*`) | UX / correctness |

`A3` deserves emphasis independent of tenancy: `useUserRole` treats a *failed*
role query as a reason to consult a hardcoded admin email list. That is a
fail-open path in the current single-tenant app.

### 3.6 Risk map summary

| Risk class | Severity under multi-tenancy | Driver |
|---|---|---|
| Cross-tenant read | **CRITICAL** | A7, A8 — 70 permissive policies |
| Authorization | **CRITICAL** | A1, A2, A3 — identity is an email domain, not a membership |
| Isolation via async paths | **HIGH** | 80 edge functions, several with service-role keys, none tenant-aware |
| Storage isolation | **HIGH** | buckets are not tenant-namespaced |
| Migration risk | **MEDIUM** | 111 accounts / 56 merchants / 2.1k activities must be adopted by a legacy tenant without orphaning |
| Operational | **MEDIUM** | A5, A6, A10 — single-origin, single-brand assumptions |

---

## 4. Verification constraints on this work

Two constraints bound what can honestly be certified, and both are properties
of the environment rather than choices:

1. **There is no staging database.** `CLAUDE.md` is explicit: the Lovable
   connector is production, and is SELECT-only for agents. Migrations can be
   *authored* here; they cannot be *applied* or *exercised* here.
2. **`CLAUDE.md` forbids shipping database migrations and client changes in the
   same session** ("NEVER put database migrations and client changes in the
   same session").

Consequence: the adversarial gauntlet phases that require a live two-tenant
environment (cross-tenant IDOR, enumeration, privilege escalation, provisioning
races, cache/storage/webhook leakage) **cannot be executed in this session**.
Claiming them as PASS would be fabrication. They are recorded as BLOCKED with
the specific unblock condition stated, per §53 of the brief.
