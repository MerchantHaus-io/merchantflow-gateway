# Brand typography & colour — decisions of record

Written 2026-08-07, resolving items #85 and #86 of the Ops Terminal audit.
This exists so the same questions don't get re-opened by the next review.

## Typefaces

| Role | Family | Token | Tailwind |
|---|---|---|---|
| UI / body | **DM Sans** | `--font-sans` | `font-sans` |
| Display, headers, tabs, chart labels | **Space Mono** | `--font-display` | `font-display`, `font-mono` |
| Editorial accent | **Playfair Display** | `--font-serif` | `font-serif` |

All three are **self-hosted** via `@fontsource`, imported in `src/main.tsx`.
There are no `@import url()` font requests and no third-party CDN in the
critical path.

### Playfair Display is a deliberate exception

The brand guide codifies DM Sans and Space Mono only. Playfair is retained
anyway, by decision, because it is genuinely used for editorial accents in
`Home.tsx` and the Quote Generator, and dropping it would change those
surfaces for no benefit.

**This is not an oversight.** Don't remove it on the grounds that it's
off-guide.

### What this replaced

Worth recording, because the previous state looked intentional and wasn't:

- `--font-display` was **never defined**. Every use read
  `var(--font-display, 'Syne', …)` and **Syne was never imported**, so headers,
  tabs and chart legends fell through to General Sans or the generic
  sans-serif. The display face was an accident.
- `.font-pipeline-mono` asked for `'JetBrains Mono', 'DM Mono'` — neither
  imported, so it rendered in the system monospace.
- `.font-pipeline-sans` hardcoded `'Geist'`, bypassing the token system.
- General Sans was fetched from `fonts.cdnfonts.com` — a third-party CDN with
  no SLA, render-blocking — and **nothing used it**.

Every `font-family` in `src/index.css` now resolves through a token, so a
theme variant can override typography the same way it overrides colour. If you
add a rule, use a token; don't hardcode a family.

## Primary brand colour

**`--primary` is `348 83% 47%` — `#DB143C`. This is correct and stays.**

The brand guide records MH Red as `#C8102E`. That divergence was raised and
resolved in favour of the code: **the guide should be updated to `#DB143C`**,
not the other way round.

> Action outside this repo: update the brand guide so the two agree. Until
> that happens the guide is the stale copy, not `index.css`.

Note the `dark-doom` variant deliberately uses its own `0 85% 45%` (`#D41111`)
— a theme-specific choice, not drift.

## Adding a font weight

`src/main.tsx` imports specific weights. Using a weight that isn't imported
falls back to a synthesised bold/oblique, which looks subtly wrong rather than
obviously broken. Currently loaded:

- DM Sans — 400, 500, 600, 700
- Space Mono — 400, 700
- Playfair Display — 400, 600

Add the matching `@fontsource/<family>/<weight>.css` import before using one.
