# Phase 6 — Scale

**Goal:** stop the CRM getting slower every month.

**Do this before the opportunity count passes ~800.** At 1,000 Supabase
silently truncates and your KPIs go quietly wrong.

**Recon verdict: NOT_STARTED, and the current state is worse than the plan
implies.**

---

## The finding that should move this phase up your list

`src/pages/Opportunities.tsx:335-380` — `fetchOpportunities()` pages through
**every row** client-side in a loop of `.range(from, from+999)` up to
`MAX_ROWS = 5000`, then holds the entire set in React state. Filtering,
sorting and searching all happen in the browser over that array.

So today, opening the list page is up to **five sequential round trips**
before first paint, and every filter keystroke re-runs over the whole set in
memory. At 800 opportunities it is slow. At 5,000 it stops loading rows
entirely — silently, with no error, and your counts quietly become wrong.

---

## 6A — Data layer · NOT_STARTED (#20, #21, #22, #64, #65)

- Server-side pagination, filtering and sorting on `/opportunities` and the
  sibling list pages that share the pattern.
- Debounce the realtime handler; patch single rows instead of refetching the
  whole table.
- Unique realtime channel names (fixed names collide under StrictMode's
  double-mount in dev — this has already bitten twice: `rail-profile-sync`
  and `bell-profile-avatar`, fixed in #113).
- Filter state mirrored to the URL so views are shareable.
- 300ms debounce on search; search DBA, phone, MID and opportunity ID (#73).

**Fold in here** (#23, #24, #31): the unguarded `STAGE_CONFIG` lookup, the
missing refetch, the unchecked activity inserts. They live in
`Opportunities.tsx` and this is the session that touches it.

> This is a **plan-mode item**. Widest blast radius in the document after 3A.
> Read the plan, approve, then execute in a second turn.

**Gate — `EXECUTABLE`**
```bash
grep -n "MAX_ROWS\|range(from" src/pages/Opportunities.tsx
# PASS: no client-side paging loop remains
grep -n "\.channel(" src/pages/Opportunities.tsx
# PASS: channel name includes a per-session or per-user discriminator
```

**Gate (time-to-first-row < 500ms) — `EXECUTABLE`.** Seed 5,000 synthetic
opportunities, then measure with Playwright. Also assert the request count:
**one, not five.** The request count is the more honest number here, because
it cannot be gamed by a fast machine.

---

## 6B — Render layer · NOT_STARTED (#63, #66, #69, #74, #75)

- **Virtualise the table** (#63) — the item deferred twice now as "larger than
  its audit line implies". It is the right call to do it here, after 6A, when
  the row set is already bounded.
- Render the four inline `Select`s only on row hover/focus.
- Ship the bulk actions the selection UI promises — **partly done**: `runBulk`,
  `exportSelection`, `bulkConfirm` landed in Audit 1. Clearing selection when
  filters change did not.
- Sticky header and first column.
- Horizontal scroll container — **done**, `overflow-x-auto`.

**Gate — `EXECUTABLE`**
```bash
grep -n "react-window\|@tanstack/react-virtual" package.json   # a virtualiser exists
grep -n "setSelectedIds(new Set())" src/pages/Opportunities.tsx # selection clears on filter change
```

**Gate (60fps scroll, no long task > 50ms) — `EXECUTABLE`** via Playwright
tracing, against the same 5,000-row seed. All three numbers — first row,
sustained frame rate, and the longest task during a 200-row bulk stage change
— reported as figures, not impressions.

---

## The data-model cleanup (#25) — do it first, it's small

`'dead'` and `'archived'` mean three different things in one file. Audit 1
pinned down what is actually legal:

```ts
const ARCHIVED_STATUS = 'dead';           // 'archived' is not a legal status
const CLOSED_STAGES: string[] = ['closed_won'];  // only stage surviving migrateStage()
```

Those constants document the confusion; they do not resolve it. Pick one
representation, write the migration, update every reference.

**Its own session** — it is a migration, and CLAUDE.md forbids mixing.

**Gate — `EXECUTABLE`**
```bash
grep -rn "'archived'" src/ | grep -v ARCHIVED_STATUS   # empty once resolved
```

---

## Order

**#25 migration → 6A (plan mode) → 6B.** Three sessions.
