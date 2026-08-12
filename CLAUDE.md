# MerchantHaus Gateway — Project Memory

## RULE: Never expose partner cost or markup in merchant-facing output

**MerchantHaus quotes, contracts, and any document we generate or send to a
merchant must show only the merchant's *resale* price.** They must never
reveal:

- NMI (or any other supplier's) **partner / wholesale / underlying cost**
- Our **markup / margin** (the spread between cost and resale)
- Anything from which the merchant could back out our cost or margin
  (e.g. showing partner cost *and* resale side by side)

This applies to every merchant-facing surface: the Quote Generator preview,
the quote PDF (`src/lib/quotePdf.ts`), the Merchant Services Agreement /
Exhibit A, line-item **descriptions**, disclaimers, and email bodies.

### Where cost/margin are allowed
Cost and margin are **internal only**. They may live in:
- Structured config fields used for internal math — `cost`, `resale`,
  `margin`/`monthlyMargin` in `src/config/quoteSchedule.ts` and
  `src/config/pricing.ts`.
- The internal Quote Generator UI columns (rep-facing cost/margin editors).
- Internal reference material such as `NMI_GATEWAY_FEATURES.partnerCost`,
  `NMI_SCHEDULE_A_RATES`, and the NMI Guide.

Those internal fields must **never** be piped verbatim into a rendered,
merchant-facing string. In particular, **line-item `description` text is
merchant-facing** — keep it a plain feature description with no cost figures.

### When adding or editing quote lines
- Put the underlying cost in the `cost` field only.
- Keep `description` free of partner-cost / "NMI partner cost $…" language.
- If you need the wholesale figure for reference, use the internal NMI
  reference tables — do not embed it in a quote/contract string.

### Enforcement — applies to contracts and re-rendered documents too
Cleaning the source strings only protects *new* data. Accepted quotes and
drafts persist a **snapshot** of their line descriptions (`lines_snapshot` /
`extras_snapshot`), and the **Merchant Services Agreement / Exhibit A** and any
re-rendered quote or invoice are built from that snapshot. A quote captured
before a source string was cleaned still carries the old cost text.

So every merchant-facing PDF generator scrubs descriptions through
`stripInternalCostRefs()` (`src/lib/redactCost.ts`) at render time — the last
line of defense. It is wired into `src/lib/quotePdf.ts` (quote **and** MSA
Exhibit A) and `src/lib/billingDocPdf.ts` (invoices/receipts). Any new
merchant-facing document generator MUST run line descriptions through this
helper. It only cleans the rendered string; internal `cost`/`margin` fields are
untouched.

> Note: `src/lib/statementProposalPdf.ts` legitimately shows a **markup over
> cost** figure — that is the *merchant's current processor's* markup (a
> savings talking point), not MerchantHaus's. That is fine and not covered by
> this rule.

---

## Gauntlet invariants — never violate, in any phase

- NEVER put database migrations and client changes in the same session.
- NEVER touch `stripInternalCostRefs` or the cost-redaction path without
  running `npx vitest run redactCost` and reporting the result.
- NEVER remove a `verify_jwt` guard. Adding them is fine; removing needs my
  say-so.
- After ANY change, run: `npm run build && npm run lint`. Report failures
  before claiming done.
- If a diff would touch more than 15 files and I did not ask for that, STOP
  and tell me why before writing.
- Cap Gauntlet loops at 3 iterations per item. On the third failure, stop and
  report exactly what is blocking it. Do not keep going silently.

### Commands that actually exist here

There is **no `npm test` script**. `npm test -- redactCost` fails with a
missing-script error, which reads like a passing run to a careless agent.

```bash
npx tsc --noEmit -p tsconfig.app.json   # typecheck — must be silent
npm run lint                            # eslint . — 0 errors, ~305 inherited warnings
npx vitest run                          # full suite
npx vitest run redactCost               # the cost-redaction guard specifically
npm run build                           # vite build
```

`tsc` does **not** cover `supabase/functions/` — those are Deno and sit in no
tsconfig. A change there passes every local check while being syntactically
broken. This has already happened once: a regex edit truncated the preflight
return in five edge functions and nothing caught it. Read edge-function bodies
back after editing them.

### Baselines, so a critic can tell a regression from inherited noise

| Check | Current state | As of |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | silent | 12 Aug 2026 |
| `npm run lint` | **0 errors**, 330 warnings | 12 Aug 2026 |
| `npx vitest run` | 118 passing, 8 files | 12 Aug 2026 |
| `npm run build` | succeeds; chunk-size warnings are expected | 12 Aug 2026 |

A rise in the lint **error** count is a regression. Inherited warnings are not.

**Re-date this table when you notice it drifting.** The warning count was ~305
and is now 330 — not from any Gauntlet work (checked: `npx eslint` on the
changed files reported zero), but from unrelated commits landing on `main`. A
stale baseline is worse than none: it makes a critic report a regression that
did not happen, which is exactly the false signal these numbers exist to
prevent. When a count moves, confirm the cause before assuming blame — run
eslint on the changed files alone.

The test count moved the same way: the table read 92 passing / 6 files and the
suite actually ran 112 / 7 — again from unrelated commits, since every test
passed and the count only rose. It is 118 / 8 as of this re-dating, the last 6
being `src/lib/adminRole.test.ts`.

---

## Which connector to ask about data

**Use the Lovable connector. Use The Ops Terminal connector only when the
question is specifically about what a signed-in user can see. Both when the
question needs both.**

| Connector | Reaches | Respects RLS? | Use it for |
|---|---|---|---|
| `mcp__Lovable__query_database` | the app's real Postgres, raw SQL | **No — bypasses RLS** | schema, column types, policy definitions, row counts, orphan checks |
| `mcp__The_Ops_Terminal__*` | the CRM API as the signed-in user | **Yes** | what a real user actually sees |
| `mcp__Supabase__*` | **a different project** (`cuqjaddtmkotgvfsgcol`) | — | **nothing here. Not this app's database.** |

Project id for Lovable calls: `d4e766df-1ab4-4f95-a16a-4c8c4222778a`.

The split matters most for RLS work, and the two are not interchangeable:
`query_database` shows you the policy **as written**, and only The Ops Terminal
connector shows you whether it actually **bites**. A policy that reads correctly
and does not filter is the exact defect an RLS sweep exists to catch, and
`query_database` cannot see it — it is querying underneath the thing being
tested.

> **`query_database` is SELECT-only for agents.** It will happily run
> `INSERT`/`UPDATE`/`DELETE`/`DROP`, and there is no staging database behind it
> — it is production. If a check appears to need a write, it is not an agent's
> to run. This is repeated in `.claude/agents/gauntlet-critic.md` because the
> critic holds the tool.
