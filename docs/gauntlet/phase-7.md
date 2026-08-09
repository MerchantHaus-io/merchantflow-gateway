# Phase 7 — Design system

**Recon verdict: mostly done. Two concrete gaps, both small.**

The plan describes this phase as though the design system is broken — "seven
font families", "black table headers in light mode and dark dialogs". Audits 1
and 2 fixed all of that. Do not run this phase as written; you will spend a
session confirming finished work.

---

## Already done

| Plan item | State |
|---|---|
| `--info` undefined but used | **DONE** — `index.css:26-27`, consumed on account-name links |
| `--badge-alert` replacing four hardcoded `#c81030` | **DONE** — `index.css:574-576` |
| `--chrome` | **DONE** — `--chrome` and `--chrome-rail`, derived per variant via `color-mix()` |
| Hardcoded `hsl(217 33% …)` in table/dialog/tablist/recharts/scrollbar (#81) | **DONE** |
| Seven font families, three double-loaded via `@import` (#85, #86, #155) | **DONE** — self-hosted DM Sans / Space Mono / Playfair via `@fontsource`; all seven CDN `<link>`s removed |
| Focus rings clipped by `overflow: hidden` (#88) | **DONE** — back to `outline` + `outline-offset` |
| Duplicate `.light` block | **DONE** |
| `.stagger-children` delay typo | **DONE** — `index.css:2052-2057`, strictly increasing 0/50/100/150/200/250ms |

Brand reconciliation is written down in `docs/BRAND_TYPOGRAPHY.md`: DM Sans /
Space Mono per the guide, Playfair retained deliberately, `--primary` held at
`#DB143C` by your decision.

---

## Gap 1 — `--chrome-foreground` was never defined

`--chrome` and `--chrome-rail` exist; **`--chrome-foreground` does not.** The
chrome surfaces currently set `color: hsl(var(--foreground))` directly in
`.chrome-surface` / `.chrome-rail-surface`.

That works today because chrome and page background are close in every theme.
It stops working the moment a variant wants chrome that contrasts with its
page — which is exactly what a `--chrome-foreground` token is for.

**Gate — `EXECUTABLE`**
```bash
grep -c -- "--chrome-foreground" src/index.css   # currently 0, must be ≥ 2 (dark + light)
```

---

## Gap 2 — two competing stagger utilities, both live

| Utility | Where | Steps | Used by |
|---|---|---|---|
| `.animate-stagger` | `index.css:1878-1889` | 0/40/80/…/280ms, plus an `nth-child(n+9)` catch-all | `PipelineColumn.tsx:156` |
| `.stagger-children` | `index.css:2051-2060` | 0/50/100/150/200/250ms, **no catch-all past 6** | `Outreach.tsx:688`, `Documents.tsx:388`, `Contacts.tsx:744`, `Accounts.tsx:479`, `Reports.tsx:288`, `Opportunities.tsx:990` |

Two implementations of one concept, different timings, both actively
referenced. The missing catch-all on `.stagger-children` means item 7 onward
in any list of more than six animates with **no delay at all** — which is the
visible bug hiding inside this tidy-up.

**Gate — `EXECUTABLE`**
```bash
grep -c '^\.animate-stagger' src/index.css
grep -c '^\.stagger-children' src/index.css
# PASS when exactly one of these is non-zero
```

---

## The theme cut belongs here, not in Phase 1A

D8 says four themes. The subtraction is cheaper once you are already in
`index.css` for the two gaps above, and #128 means the fourteen are no longer
*broken* — just excess. Name the four first.

---

## Critic warning

This is the phase where the critic is weakest: almost every remaining
judgement is visual, and no Playwright means it cannot see. The two gaps above
are deliberately specified as `grep` gates so at least those are objective.

For anything beyond them — the blind comparison against the Stripe dashboard,
whether the four surviving themes look right — **take the critic seat
yourself.** A critic reasoning about CSS it cannot render will tell you it
looks fine.
