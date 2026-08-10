# Phase 1 — Subtraction

**Goal:** make the app smaller before you make it better.

**Depends on:** D1 ✅, D2 ✅, D8 ✅ — all answered in `decisions.md`.

**Recon verdict: barely started.** Three items are done (#114, #59, #140); the
decorative deletions are all outstanding.

---

## 1A — Decorative layers

| Item | Status | Note |
|---|---|---|
| `OfficeSimulatorOverlay` | NOT_STARTED | Still rendered, `AppShell.tsx:13,237` |
| `Starfield.tsx` | NOT_STARTED | Still rendered, `AppShell.tsx:29,132` — gating was tightened by #173, the component was not removed |
| `GameSplash.tsx` | **NOT_STARTED — and do not delete blind** | Actively used in **three** places: `Index.tsx:24,990`, `OpportunityDetail.tsx:72,1424`, `OpportunityDetailModal.tsx:51,1800`. This is a feature, not a decoration. Confirm before deleting. |
| Animated grid / noise / mesh gradients / horizon glow | NOT_STARTED | |
| 14 themes → **4** (D8) | NOT_STARTED | Not 2. Name the four before the session starts or it will guess. |
| 9 unused favicons, duplicate logos | NOT_STARTED | |

**Gate — `EXECUTABLE`**
```bash
npm run build && du -sh dist/     # record before, then after
# Count DISTINCT theme variants, not matching lines. Verified 10 Aug 2026:
# `grep -c` returns 23 because each variant has ~2 selector lines, so it could
# never read 4 even after the cut — the gate was uncheckable as written.
grep -o "^  \.\(dark\|light\)-[a-z-]*" src/index.css | sort -u | wc -l
# 12 distinct today (7 dark + 5 light). Target 4 per D8 (2 dark + 2 light).
```

**Gate (perf) — `EXECUTABLE`.** Playwright can trace the plan's 10s scroll
on `/opportunities` and report frame times before and after. PASS requires
**both** numbers down — bundle size and frame time. Report them unlabelled
first and say which build you would ship, then reveal.

> **#128 changed the calculus.** Chrome colour now derives per variant via
> `color-mix()`, so the fourteen themes are no longer visually broken — they
> were, before. The subtraction still pays in CSS weight, asset weight and
> every future design change costing a quarter as much. It is just no longer
> urgent.

---

## 1B — Structural duplicates

| Item | Status | Evidence |
|---|---|---|
| #114 header dead code | **DONE** — adversarially upheld | `grep -n "NavigationMenu\|navMain\|RouterNavLink\|useAcceptedQuotesCount" src/components/MegaMenuHeader.tsx` returns one doc-comment line and nothing else |
| #59 four broadcasts → one | **DONE** | `src/components/Broadcasts.tsx`, table-driven |
| #140 dead `hidden` state | **DONE** | Removed with the dock rewrite |
| #35 "Intelligence View" button with no `onClick` | NOT_STARTED | |
| #198 one intake form dies | NOT_STARTED | **D1: `/apply` is dead, `/merchant-apply` survives.** Redirect, don't just delete — a 404 on the merchant side is a lost application |
| #197 office chat removal | NOT_STARTED | **D2 says remove.** ~5,200 lines. See `decisions.md` for the full knock-on list — `appEvents.ts`, the dock fan, the tri-tab dock, `useChatNotifications`, `IncomingMessageToast`, the `/chat` route |

**Gate — `EXECUTABLE`**
```bash
npx tsc --noEmit -p tsconfig.app.json    # silent
npm run lint                             # 0 errors
npx vitest run                           # 92+ passing
npm run build                            # succeeds
grep -rn "FloatingChat\|OfficeChat" src/ # empty once #197 lands
curl -sI localhost:8080/apply | head -1  # 301/302 to /merchant-apply, never 404
```

---

## Sequencing within the phase

Do **1B first**. It is behaviour-bearing and the office-chat removal touches
`appEvents.ts`, which several other surfaces import — landing it before the
cosmetic deletions means the scouts for 1A see the smaller tree.

The office chat is one item, not eight. It cannot be parallelised: every file
in that list imports from the others, and parallel builders editing them will
clobber each other. Serialize it, or give it its own worktree.
