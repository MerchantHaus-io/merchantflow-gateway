# Phase 4 — Persistent chrome

## ✅ Complete. Do not run a session on this phase.

Every item verified DONE by recon and **adversarially upheld** by a hostile
verifier that re-ran the evidence. Shipped in PR #103.

Kept as a record so a later phase does not rediscover it.

---

## 4A — Fix persistence

| Item | Where |
|---|---|
| #102 Suspense inside `AppShell` around `<Outlet />`, content skeleton | `AppShell.tsx:214-216`, `PageSkeleton.tsx` — scoped to the content area, below the header and rail |
| #103 scroll reset on navigation, save/restore on POP | `useScrollRestoration.ts` |
| #104 focus `#main-content` + `aria-live` announcer | `AppShell.tsx`, `RouteTitle.tsx` |
| #105 `newApplicationRef` in an effect with cleanup, header falls back | `AppLayout.tsx`, fallback in `AppShell.tsx` |
| #111 document title per page | `RouteTitle.tsx`, `lib/pageTitle.ts` |
| #107 `PageTransition` deleted | Not replaced with a CSS fade — see below |
| #118 skeleton not a full-screen spinner | `PageSkeleton.tsx` |

**One deliberate divergence from the plan.** The plan says "delete
`PageTransition`, replace with a CSS fade". It was deleted; **no fade
replaced it.** Re-triggering a CSS animation on navigation needs either a
`key` — which remounts the page, the exact thing the refactor removed — or an
imperative class-reflow hack. Neither is worth 200ms of fade. If you want the
fade back, that is a new item, and it needs a mechanism that does not remount.

**Two audit claims were investigated and found false:**

- **#106** "the header slot misses first paint" — it does not. `setHeaderSlot`
  is a callback ref; ref callbacks run in the commit phase, so the `setState`
  flushes before the browser paints, same timing as `useLayoutEffect`.
- **#112** "`useAcceptedQuotesCount` fires three requests" — it is a React
  Query hook on a shared key. The three call sites dedupe to one.

---

## 4B — One navigation source

| Item | Where |
|---|---|
| #115 single tree | `src/config/navigation.ts`, guarded by `navigation.test.ts` |
| #108 segment-aware longest-match | `lib/routeMatch.ts` + `activeGroupFor()` |
| #109 `/support-request` no longer matches `/support` | `lib/routeMatch.ts` |
| #119 breadcrumb in the persistent header | `HeaderBreadcrumb.tsx` |
| #121/#122 `DropdownMenu` instead of `HoverCard` | `IconRailSidebar.tsx` |

**Gate — `EXECUTABLE`, and it is a real regression guard**
```bash
npx vitest run navigation
```

`navigation.test.ts` parses `App.tsx`'s route table and asserts every nav URL
resolves to a declared route, no two destinations share a label, shortened
mobile labels stay unique, and **each group's landing page is its own first
menu item** — the invariant that makes #121 lossless. If a future phase adds a
nav entry pointing at a route that doesn't exist, this fails.

**Gate (visual) — `EXECUTABLE`.** Screenshot each frame during a navigation
and diff the header and rail regions; any frame where they are absent is a
FAIL. Worth running once as a regression guard even though the phase is
closed — it is the assertion that #102 stays fixed.
