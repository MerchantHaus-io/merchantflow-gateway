# Phase 3 — Security & data integrity

**Goal:** an authenticated affiliate should not be able to call `export-data`.

**Rule: one session for the database, one for the edge functions, one for
auth. Never mixed.** This is a CLAUDE.md invariant, not a preference.

**Recon verdict: mostly done — but 3A's foundation exists in a *different
shape* than the plan describes, and that discrepancy will bite.**

---

## 3A — Roles in the database · DONE, with a caveat · adversarially upheld

The plan asks you to create `app_role`, `user_roles` and `has_role()`. **They
already exist** — `supabase/migrations/20251208191710_*.sql:1-40` creates all
three, with RLS enabled and `has_role()` correctly `STABLE SECURITY DEFINER
SET search_path = public`. The hostile verifier confirmed it is live, not dead
code.

**Live state, confirmed against the database 9 Aug 2026:**

| | Plan wants | Database has |
|---|---|---|
| `app_role` values | `'admin','internal','affiliate'` | `'admin','user','staff','finance'` |
| Row counts | — | admin **2**, staff **9**, finance **8** (10 Aug 2026) |
| `is_internal_staff()` | — | swapped — requires a `staff`/`admin` row |

So `20260807180000_staff_gate_via_user_roles.sql` **is applied.** The earlier
note calling it unexecuted was wrong.

The naming differs from the plan (`staff`/`finance` rather than
`internal`/`affiliate`) but the shape is what the RLS sweep needs, and
`finance` is deliberately *narrower* than `staff` — it gates
`commission_records`, which carries partner cost and margin. Do not collapse
them. Write the sweep against the roles that exist.

**Admin roles — resolved and APPLIED.** Confirmed 10 Aug 2026: `user_roles`
now holds **admin=2**, down from 4. The sweep can be written against the
intended role set.

The four admin rows were `admin@`, `darryn@`, `support@` (18:02:51) and
`jamie@` (18:13:18) — not the set `20260807180000` seeds. Per D5 as refined,
`admin@` (shared) and `darryn@` (operator) keep it;
`20260809170000_restrict_admin_role.sql` revokes `support@` and `jamie@`, who
keep staff and finance and lose admin surfaces only.

That is done, so the RLS sweep is now written against the role set you intend
to keep rather than the one that happened to accumulate.

### Remaining 3A work — read against the live database, 10 Aug 2026

The sweep was previously described as a list of tables to "express against
`has_role()`". That was a wish, not a work list. Here is what is actually
there, queried via `mcp__Lovable__query_database`.

**Already clean — do not spend a session on these:**

| Checked | Result |
|---|---|
| public tables with RLS disabled | **0** — every table has it on |
| `SECURITY DEFINER` functions in `public` without a pinned `search_path` | **0** |
| tables with RLS on and zero policies | 1 — `kurv_api_tokens`, deny-all to anon/authenticated, service-role only. Correct for a token store; not a finding. |

So the two categories an RLS sweep usually finds are already handled. **The
defect is the opposite shape: policies that exist, read plausibly, and do not
restrict.** 36 of them use `true` as their `USING` or `WITH CHECK` expression.

#### The real finding: `authenticated` is treated as "staff", and anyone can become `authenticated`

`handle_new_user` (the `on_auth_user_created` trigger) inserts a profile for
**any** new user with no domain restriction, and the sign-in screen offers a
**Register** tab. This is not theoretical — `auth.users` already holds 8
`@merchanthaus.io` accounts and **5 that are not**: 3 gmail, 1 yahoo.fr, and one
`@gnail.com`, a typo domain that reads like self-registration rather than
deliberate provisioning. (At least one gmail is the operator's own.)

Every policy below grants on `TO authenticated` with `USING (true)`, so it is
satisfied by any account that can complete a sign-up:

| Table | Grants | Rows now |
|---|---|---|
| `nmi_partner_residuals` | SELECT | 0 |
| `kurv_merchants`, `kurv_deal_submissions`, `kurv_transactions_daily`, `kurv_sync_logs` | SELECT | 0 |
| `billing_documents` | SELECT, UPDATE, **DELETE** | 1 |
| `scoping_submissions` | SELECT, UPDATE, **DELETE** | 1 |
| `message_logs`, `lead_referrers`, `sop_change_requests`, `shared_todos`, `billing_doc_sequences` | SELECT (+INSERT/UPDATE on some) | — |
| `cadence_steps` | ALL | — |

> **`nmi_partner_residuals` is the one to care about.** Its columns are
> `interchange_cost`, `processor_fees`, `gateway_fees`, `partner_residual` —
> precisely the partner cost and margin that CLAUDE.md's cardinal rule exists to
> protect. **It currently holds 0 rows, so nothing is leaking today.** State it
> that way; do not report an active breach. But the residual sync that fills it
> is already planned work (D7 — expected vs paid residuals do not reconcile),
> and on the day it runs this policy hands every registered account the cost
> book. Fix the policy before the data arrives, not after.
>
> Note this is a *different vector* from the CLAUDE.md rule, which governs
> rendered merchant-facing documents. Same commercial harm, different door —
> and `stripInternalCostRefs()` does nothing here, because nothing is being
> rendered. RLS is the only control on this path.

#### Two policies grant to `public`, which includes `anon`

Their names claim otherwise, which is why they have survived review:

| Table | Policy name | Actually granted to | Effect |
|---|---|---|---|
| `call_logs` | "**Service role** can insert call logs" / "…can update call logs" | `public` | anon key can INSERT and UPDATE |
| `documents` | "**Authenticated users** can insert documents" | `public` | anon key can INSERT |

`TO public` in Postgres covers every role including `anon`. The client UI is
irrelevant — PostgREST is directly callable with the anon key, so RLS is the
only boundary that exists.

`merchant_consents` (INSERT, `public`) and `client_errors` (INSERT,
`anon,authenticated`) are also open, but those are named honestly and are
plausibly intentional for public capture. Confirm intent; do not assume defect.

#### STATUS UPDATE, 10 Aug 2026 — the live exposure is closed; the structure is not

All four non-staff accounts were **affiliates**, not strays — active `referrers`
rows with `auth_user_id` linked, one of whom signed in 12 days prior. They held
bare `authenticated` with **no role**, which is exactly what the 33 policies
below grant on. So Phase 3's stated goal ("an authenticated affiliate should not
be able to call `export-data`") was live fact, not hypothesis.

**Action taken:** all four auth accounts revoked via `banned_until`, and all
four `referrers` rows KEPT. Revoked rather than deleted on purpose —
`referrers.auth_user_id` has no FK and `profiles` has no FK to `auth.users`, so
deleting would have left orphan profiles and dangling pointers, and the
`referrers` FKs are `ON DELETE SET NULL`, meaning a delete would have silently
nulled the referrer on **4 accounts and 4 opportunities** with no error.
Attribution preserved; 16 impersonation logs intact.

`urle.johnson@gnail.com` (typo domain, duplicate of the `@gmail.com` row) and
`gayle0608@gmail.com` (never signed in) are also `active = false`.

> **This bought time, it did not fix the design.** The 33 policies still say
> "any authenticated user". The moment an affiliate signs up again under the
> current scheme, the exposure returns in full. Do the `affiliate` role work
> before re-onboarding anyone — there are now zero live affiliate logins to
> disrupt, which is the cheapest this will ever be.
>
> Two migrations, not one: `ALTER TYPE app_role ADD VALUE 'affiliate'` cannot
> be referenced in the same transaction that adds it.

#### RECOMMENDATION, 10 Aug 2026 — do the cheap lever first

**Close public registration before rewriting 33 policies.** ⚠️ SUPERSEDED — see the status update above. Registration cannot simply be closed: the affiliate portal depends on it. The real lever is giving affiliates their own role.

The 33 policies are the symptom. The cause is that `authenticated` does not
mean staff: the sign-in screen offers **Register**, and `handle_new_user`
applies no domain restriction, so anyone who completes a sign-up satisfies
every one of them. Five non-`merchanthaus.io` accounts already exist, one on a
typo domain.

Restricting who can register is **one change** that shrinks the blast radius of
all 33 at once, and it does not depend on getting any individual policy right.
Rewriting policies first leaves the door open for however long the rewrite
takes; closing the door first makes the rewrite unhurried. Do both — this is
defence in depth, not either/or — but in that order.

Options, cheapest first: disable public sign-ups in Supabase Auth settings and
invite staff directly; or keep sign-up and have `handle_new_user` reject
addresses outside `merchanthaus.io` plus an allowlist (`src/types/opportunity.ts`
already has `EXTRA_ALLOWED_EMAILS` and `isEmailAllowed` doing exactly this
check **client-side** — the server-side equivalent is missing, which is the
whole problem).

> Check with the operator before disabling sign-ups: the affiliate/referrer
> portal may depend on self-registration. If it does, the domain-restriction
> route is the one, and referrers need their own role rather than bare
> `authenticated`.

**Then** rewrite the policies, worst first:

1. `nmi_partner_residuals` — cost and margin. Empty today; do it before the
   residual sync fills it, not after.
2. `billing_documents` and `scoping_submissions` — both currently allow any
   registered account to **DELETE**. Destructive, not just readable.
3. The `kurv_*` tables — merchant financial data, empty today.
4. Everything else.

#### The shape of the fix

Express the staff-only tables against `has_role()` using the roles that exist —
`staff`, `finance`, `admin` — rather than against `authenticated`. Keep
`finance` narrower than `staff`: it gates `commission_records`, which carries
cost and margin, and `nmi_partner_residuals` belongs behind the same gate.
Correct the two `public` grants to `service_role`, matching what their names
already claim.

**Do not touch the client in this session.** The email allowlist keeps
working; you are adding server-side enforcement underneath it.

**Gate — `EXECUTABLE`, but the old one was not.** It said "as an affiliate
user". There is no `affiliate` role: `app_role` is `admin, user, staff,
finance`. A gate naming a nonexistent role cannot be run, and the tempting
repair is to invent a mapping. Use a real account holding only `user`:

```sql
-- as a signed-in account with NO staff/finance/admin row in user_roles
select count(*) from nmi_partner_residuals;  -- must be 0 rows readable
select count(*) from billing_documents;      -- must be 0
select count(*) from google_calendar_tokens; -- must be 0
```

Run it through **`mcp__The_Ops_Terminal__*`, not `query_database`** — see the
connector table in CLAUDE.md. `query_database` bypasses RLS, so it will happily
return every row and tell you nothing about whether the policy bites. This gate
is only meaningful executed as a real user.

---

## 3B — Edge function auth sweep · MOSTLY DONE

**The plan says 52 functions. There are 73.** Any sweep written against the
plan's number will silently miss 21.

Audit 1 did most of this: `_shared/require-auth.ts` with `requireRole()`,
`_shared/cors.ts` with an origin allowlist, `_shared/webhook-verify.ts` with
timing-safe comparison, `_shared/rate-limit.ts` per-IP. `docs/EDGE_FUNCTION_AUTH_AUDIT.md`
is the decision record.

**Outstanding:** the CORS allowlist migration across the remaining ~63
functions that still send `Access-Control-Allow-Origin: "*"`.

**Gate — `EXECUTABLE` and this is the real one**
```bash
for fn in export-data sign-out-all-users force-password-reset encrypt-secrets; do
  curl -s -o /dev/null -w "$fn %{http_code}\n" -X POST \
    "$SUPABASE_URL/functions/v1/$fn" -H "Authorization: Bearer $AFFILIATE_JWT"
done
# every line must read 401 or 403. Any 200 fails the whole phase.
```

All four functions confirmed present. Get the affiliate JWT from the browser
console on the portal.

> **`tsc` does not cover `supabase/functions/`.** A clean typecheck proves
> nothing about an edge-function change. This has already caused one incident:
> a regex edit truncated the preflight return in five functions and every
> local check still passed. Read the bodies back.

---

## 3C — Auth client hardening · MOSTLY DONE

Audit 1 covered #9, #10, #14, #17, #18, #46, #47, #48. Recon found the
Google-token items (#12, #13, #49) as the main remaining work: real
`expires_in`, refresh handled server-side, and the token write moved out of
the browser.

**Gate — `EXECUTABLE`**
```bash
grep -rn "google_calendar_tokens" src/   # should be empty: no browser writes
```

**Gate (preview auth) — `NOT EXECUTABLE`.** Sign in on the Netlify deploy
preview and confirm you are not redirected to production. Human.

---

## Order

**Settle the conflicting migration → 3A (enum widen + RLS sweep) → 3B (CORS
migration) → 3C (Google tokens).**

Three sessions minimum, and genuinely do not merge them. This is the phase
where a mixed session costs you a weekend.
