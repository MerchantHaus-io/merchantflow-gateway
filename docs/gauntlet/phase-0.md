# Phase 0 — Safety net

**Goal:** be able to tell when you've broken something, and be able to get back.

**Recon verdict: half of this is already done, and the half that isn't is not
what the plan says it is.** Do not run this phase as written.

---

## 0.1 — Rollback point · PARTIAL

**Already done, and better than asked for.** `supabase/functions/backup-snapshot-to-drive`
is not a manual button — it is a **live hourly cron**, registered at
`supabase/migrations/20260623151837_*.sql:139` via
`cron.schedule('backup-snapshot-hourly','0 * * * *', ...)`. It zips ~70 tables
to Google Drive and records each run in `backup_runs`.

**Outstanding:** only the Lovable remix checkpoint, which is a console action
with no repo artifact.

**Gate — `EXECUTABLE`**
```sql
select status, started_at from backup_runs order by started_at desc limit 1;
-- PASS requires status='success' within the last 2 hours
```

**Gate (remix) — `NOT EXECUTABLE`.** A human confirms in the Lovable project
history that a checkpoint was taken. Nothing in git can prove it.

---

## 0.2 — Error telemetry (#56) · PARTIAL — **the plan is wrong here**

The plan says "wire Sentry". **Sentry was deliberately not used.** There is a
home-grown replacement already wired end to end:

- `src/main.tsx:10,37` — `installGlobalErrorHandlers()` runs before mount
- `src/components/ErrorBoundary.tsx:47` — `componentDidCatch` calls `reportError()`
- `src/lib/telemetry.ts:70-120` — writes to the `client_errors` table
- `src/lib/telemetry.ts:13` — a `forwardTo()` seam documented as
  *"the seam for adding Sentry later"*

So the item is **not** "install Sentry". It is **"finish the telemetry you
already have"**, which is two concrete gaps:

**(a) The release is never a commit SHA.** `src/lib/telemetry.ts:33-35` reads
`VITE_RELEASE` and falls back to `import.meta.env.MODE`. `.github/workflows/ci.yml`
sets only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — never
`VITE_RELEASE`. Every error is therefore tagged `production`, and you cannot
tell which deploy broke it. **This is the item that matters.**

**(b) Nothing alerts.** No edge function reads `client_errors`. Errors land in
a table nobody watches — the same failure mode as the scoping form in Phase 2.

**Gate (a) — `EXECUTABLE`**
```bash
grep -n VITE_RELEASE .github/workflows/ci.yml   # must produce a SHA-setting step
```

**Gate (b) — `EXECUTABLE`**
```bash
grep -rl client_errors supabase/functions/       # must be non-empty
```

> **Decide first:** finish the home-grown path, or adopt Sentry and use the
> `forwardTo()` seam? Cheaper to finish what exists. Adopting Sentry buys
> grouping, alerting and release health you would otherwise build.

---

## 0.3 — Smoke test · DONE (as a checklist)

Written up in `smoke.md`. Three paths plus a mobile pass.

**Gate — `NOT EXECUTABLE`.** Requires a signed-in browser. `npx vitest run`
covers 92 unit tests across route matching, redaction and notification
routing — none of it drives a browser. Automating this is the strongest
argument for installing Playwright.

---

## 0.4 — Feature freeze · NOT ENFORCED

**Gate — `NOT EXECUTABLE`.** A policy, not a property of the repo.

Worth stating plainly: recon found unrelated feature and refactor commits
continuing to land on `main` after the audits merged. Whatever the intent, the
freeze is not in force. That is your call, not an agent's.

---

## Suggested session

Only one thing here is worth a Gauntlet session, and it is small:

1. Set `VITE_RELEASE` to the commit SHA in CI, so `client_errors.release`
   becomes useful.
2. Add an alert path off `client_errors` — an edge function on a cron that
   emails you on a new `message` value not seen in N days.

Everything else in Phase 0 is done, manual, or a decision.
