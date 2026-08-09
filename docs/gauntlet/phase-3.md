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
| Row counts | — | admin **4**, staff **9**, finance **8** |
| `is_internal_staff()` | — | swapped — requires a `staff`/`admin` row |

So `20260807180000_staff_gate_via_user_roles.sql` **is applied.** The earlier
note calling it unexecuted was wrong.

The naming differs from the plan (`staff`/`finance` rather than
`internal`/`affiliate`) but the shape is what the RLS sweep needs, and
`finance` is deliberately *narrower* than `staff` — it gates
`commission_records`, which carries partner cost and margin. Do not collapse
them. Write the sweep against the roles that exist.

**Admin roles — resolved, migration written, not yet applied.**

The four admin rows were `admin@`, `darryn@`, `support@` (18:02:51) and
`jamie@` (18:13:18) — not the set `20260807180000` seeds. Per D5 as refined,
`admin@` (shared) and `darryn@` (operator) keep it;
`20260809170000_restrict_admin_role.sql` revokes `support@` and `jamie@`, who
keep staff and finance and lose admin surfaces only.

**Apply that before 3A**, so the RLS sweep is written against the role set you
intend to keep rather than the one that happened to accumulate.

**Remaining 3A work:** the RLS sweep across `opportunities`, `accounts`,
`contacts`, `documents`, `support_tickets`, `commissions`, `referrers`,
`scoping_submissions`, `google_calendar_tokens`, `profiles`, `user_sessions`
so every policy is expressed against `has_role()` rather than assumed.

**Do not touch the client in this session.** The email allowlist keeps
working; you are adding server-side enforcement underneath it.

**Gate — `EXECUTABLE`**
```sql
-- as an affiliate user
select count(*) from google_calendar_tokens;   -- must be 0
select count(*) from referrers;                -- must be their own row only
```

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
