# Gauntlet Ledger

Findings from the DISCOVER phase. These are defects and risks found by reading
the existing system — none were introduced by this work, and none are fixed yet
(this session wrote no code).

Severity is stated **under multi-tenancy** unless marked *(today)*, which means
the finding is a live defect in the current single-tenant application.

Status vocabulary per §4A of the brief. All findings are `OPEN` because the
agreed scope for this session was plan and architecture only.

---

| ID | Area | Sev | Finding |
|---|---|---|---|
| **F-01** | RLS | CRITICAL | 27 policies use `USING (true)` — no row restriction at all. |
| **F-02** | RLS | CRITICAL | 43 policies use `USING (auth.uid() IS NOT NULL)` — any authenticated principal reads every row. |
| **F-03** | RLS | CRITICAL | 50 INSERT policies are `WITH CHECK`-only with a `null` `USING`. Read isolation alone would still permit writing rows into another tenant. |
| **F-04** | AuthZ | CRITICAL | `is_admin_email()` hardcodes two email literals in SQL and is used by **28 policies**. Under multi-tenancy those two accounts become platform superusers in every tenant. |
| **F-05** | Edge fn | CRITICAL | **58 of 74** edge functions use `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS entirely. A tenant-aware database with tenant-blind service-role callers is not isolated. |
| **F-06** | Edge fn | HIGH | `requireAuth()` returns `Response \| null` — on success it discards the identity it just resolved, leaving callers with no principal to scope by. Root cause of F-05's shape. |
| **F-07** | AuthZ | HIGH *(today)* | `useUserRole` falls back to a hardcoded admin email list when the `user_roles` query **errors** — a fail-open path. Under multi-tenancy, a network blip becomes a cross-tenant admin grant. |
| **F-08** | Integrations | HIGH | `kurv_api_tokens` has **zero RLS policies** — the only such table. RLS is enabled so it is currently deny-all to clients, but any future permissive policy leaks integration credentials. |
| **F-09** | Uniqueness | HIGH | 10 `UNIQUE` constraints are globally scoped but semantically tenant-local (`quote_number`, `doc_number`, `ticket_number`, `chat_channels.name`, `user_roles`, …). Tenant B's first quote fails to insert; worse, `user_roles (user_id, role)` makes role a global property. |
| **F-10** | Entry points | HIGH | 8 edge functions run `verify_jwt = false`. Unauthenticated entry points must derive tenant from a signed payload or capability token, never a request field. |
| **F-11** | Jobs | HIGH | 13 `pg_cron` jobs, all tenant-blind. 8 are tenant-scoped work and could send Tenant A's outreach with Tenant B's credentials. |
| **F-12** | Storage | HIGH | 4 buckets, no tenant namespacing. `avatars` is **public** — world-readable regardless of tenant. |
| **F-13** | Cache | MEDIUM | 91 `queryKey` declarations, none tenant-scoped (`["profiles-map"]`, `["billing-docs", accountId]`). Cross-tenant collision on tenant switch. |
| **F-14** | AuthZ | MEDIUM | Access control is an email-domain check (`isEmailAllowed`, `@merchanthaus.io` + literal allowlist) rather than membership. |
| **F-15** | Config | MEDIUM | Team roster is a compile-time constant (`src/config/team.ts`). |
| **F-16** | Ops | MEDIUM | `isTrustedAuthHost` and `DEFAULT_REDIRECT_URL` are literal single-origin assumptions — blocks per-tenant domains. |
| **F-17** | Branding | MEDIUM | Branding, bank details and sender identity come from build-time `VITE_*` env — one brand per deployment. |
| **F-18** | Audit | MEDIUM | `audit_entries` mixes tenant-visible and platform audit. Needs splitting or a platform flag, else tenant admins read platform audit. |
| **F-19** | Analytics | MEDIUM | Aggregates (`Reports`, `Commissions`, `export-data`) not yet audited for tenant predicates. `export-data` uses the service role, so it bypasses RLS by construction. |
| **F-20** | Messaging | MEDIUM | `direct_messages` needs a same-tenant assertion on **insert**, not only on read — otherwise a crafted insert addresses a user in another tenant. |
| **F-21** | Docs | LOW *(today)* | `CLAUDE.md` baseline table is stale: records 92 tests / 6 files, actual is 112 / 7. Count moved up (unrelated commits), so it is drift, not regression — but a stale baseline makes a critic report regressions that did not happen. |

---

## Notes on two findings worth separating from the tenancy work

**F-07** and **F-21** are live issues in the application as it stands today,
independent of multi-tenancy:

- F-07 is a genuine fail-open in the current product. A failed role lookup
  should mean "role unknown", never "grant admin". Worth fixing on its own
  merits, ahead of any tenancy work. Note the codebase already got this right
  elsewhere — `AuthContext` carefully distinguishes "lookup errored" from "no
  row" via `roleUnavailable`, with a comment explaining why. `useUserRole`
  simply does not follow that precedent.
- F-21 is a one-line documentation fix, and `CLAUDE.md` itself asks for the
  table to be re-dated when it drifts.

Neither was changed in this session, because the agreed scope was documents
only.

---

## Iteration log

**GAUNTLET ITERATION 0 — DISCOVER / MODEL / PLAN.** Baseline established
(all four checks pass, no pre-existing failures). Tenancy audit completed
against live schema. Tenant model chosen and confirmed. All 75 tables
classified. Provisioning, onboarding, and test plans designed. 21 findings
recorded. **No code written; no gauntlet executed; no gate claimed.**

Iteration 1 begins with Phase 0 of `05-implementation-roadmap.md`.
