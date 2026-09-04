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

## Affiliate programme basis — one source of truth

A referral partner earns **a quarter of the gateway net**, month on month, per
referred merchant:

    partner share = (gateway billed − gateway cost) ÷ 4,  capped per merchant/month

`src/lib/affiliatePayouts.ts` holds the constants — `PARTNER_SHARE_DIVISOR`,
`GATEWAY_BASIS`, `DEFAULT_MONTHLY_CAP` — and every UI default reads from them.
Do not re-write these numbers into a component, a form default or a migration;
they had drifted into five disagreeing copies once already.

The gateway cost basis is **$25/month + $0.15/txn**, matching
`TIER_PLATFORM_FEE.foundation.cost` in `src/config/quoteSchedule.ts` and the
figures actually stored in `commission_records.gateway_margin`. The `$15.00`
in `supabase/migrations/20260904203347_*.sql` is **wrong** — re-running that
UPDATE would over-state every net by $10/month.

Two things the database still disagrees with, deliberately left for a
migration-only session (never mix migrations with client changes):

- `referrers.commission_rate` is `0.5000` in production, i.e. **double** the
  programme rate. Every existing commission credit is 2x.
- `build_referrer_ledger()` accrues from any commission period rather than
  from the merchant's first gateway invoice month.

The **Programme audit** card on `/admin/affiliates` recomputes every credit
from its own gateway month and flags exactly these divergences, so the gap is
visible in the UI until the migration lands.

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
| `npx tsc --noEmit -p tsconfig.app.json` | silent | 4 Sep 2026 |
| `npm run lint` | **0 errors**, 325 warnings | 4 Sep 2026 |
| `npx vitest run` | 230 passing, 18 files | 4 Sep 2026 |
| `npm run build` | succeeds; chunk-size warnings are expected | 4 Sep 2026 |

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
being `src/lib/adminRole.test.ts`. It has since risen again, to 178 / 15; the
newest files are the pipeline libraries (`dealAttention`, `edgeScroll`,
`pipelineValue`, `pipelineLanes`, `pipelinePhases`, `assignDeal`) and again
every test passes. Re-dated 4 Sep 2026 at 230 / 18: 211 / 18 was the measured
baseline before the affiliate programme-basis work, which added 19 tests to
`src/lib/affiliatePayouts.test.ts`. The warning count moved 330 -> 325 on
unrelated commits; `npx eslint` on the changed files reports zero.

**The error row went to 1 and back to 0, and the reason is worth keeping.**
`src/integrations/supabase/previewAuthStorage.ts:38` tripped `prefer-const`
(`let timer`, declared once and assigned once). It arrived on `main` in commit
`9880751` and no pipeline branch had touched that file — but CI runs
`npm run lint` before `npm run build`, so that single error failed the `build`
check on **every** push to main and on every open PR from 27 Aug onward. A lint
error here is not cosmetic and is never "someone else's": it is a repo-wide
red. Fixed in passing, as this note previously asked the next person to do.

The lesson for the table: an inherited **warning** can sit. An inherited
**error** cannot, because the gate that reads it does not know whose it is.

**Then it came back, and that changed the fix.** Lovable's `8b7db17` ("Work in
progress") reverted the const — comment and all — and reded `main` again. Three
breakages from one line, two of them authored by a generator that rewrites the
file. A fourth was a matter of when, so the rule is now downgraded to a
**warning for that one file** in `eslint.config.js`, next to the existing
`ignores` entry for `supabase/functions/mcp/index.ts`, which is there for the
same reason: a lint fix applied to a regenerated file is silently reverted.

**`eslint --fix` in the CI lint step was tried first and rejected — do not
reach for it again without reading this.** Two findings, both verified rather
than assumed:

- It does **not** fix this error. `prefer-const` will not mechanically repair a
  `let` declared without an initializer and assigned later. Running
  `eslint . --fix` over the broken file left it untouched and still exited 1.
  The CI log says so directly if you read it: *"0 errors and 1 warning
  potentially fixable."* Zero errors fixable.
- It makes **semantic** edits that CI then throws away. On this tree it deleted
  an `eslint-disable-next-line react-hooks/exhaustive-deps` directive in
  `SharedTodoPopup.tsx`. CI would go green on source a developer's own
  `npm run lint` still rejects — the exact false signal this table exists to
  prevent.

The override keeps every other rule on that file (it handles session tokens),
and `prefer-const` still **errors** everywhere else, in this same
non-autofixable shape — confirmed by putting one in another file and watching
the build fail. A `lint:fix` script exists in `package.json` for local use; CI
deliberately does not run it.

---

## Which connector to ask about data

**Use the Lovable connector. Use The Ops Terminal connector only when the
question is specifically about what a signed-in user can see. Both when the
question needs both.**

| Connector | Reaches | Respects RLS? | Use it for |
|---|---|---|---|
| `mcp__Lovable__query_database` | the app's real Postgres, raw SQL | **No — bypasses RLS** | schema, column types, policy definitions, row counts, orphan checks |
| `mcp__The_Ops_Terminal__*` | the CRM API as the signed-in user | **Yes** | what a real user actually sees |
| `mcp__Supabase__*` | this app's project, but **every call is denied** | — | **nothing — it cannot answer. Use Lovable instead.** |

Project id for Lovable calls: `d4e766df-1ab4-4f95-a16a-4c8c4222778a`.
Supabase project ref for this app: `cuqjaddtmkotgvfsgcol`.

### Do not reason from the Supabase row's failure

The Supabase connector returns `You do not have permission to perform this
action`, and this table used to explain that away by saying the ref it targets
(`cuqjaddtmkotgvfsgcol`) was "a different project. Not this app's database."
That reading was reverse-engineered from the failure, and it is wrong in a way
that matters. `cuqjaddtmkotgvfsgcol` **is** this app's project, on four
independent sources that agree:

- `supabase/config.toml` -> `project_id` — also what `supabase functions deploy`
  targets, so the edge functions live there too
- `src/integrations/supabase/client.ts` -> `DEFAULT_SUPABASE_URL`
- `.env.example` -> `VITE_SUPABASE_URL` and `VITE_SUPABASE_PROJECT_ID`
- the anon key's own `ref` claim, which decodes to `cuqjaddtmkotgvfsgcol`

The operative advice does not change — reach for Lovable, because the Supabase
connector genuinely cannot serve you. But the *reason* is a permission denial,
not a wrong database. Anyone doing RLS work has to know that
`cuqjaddtmkotgvfsgcol` is the database they are reasoning about; believing it is
some unrelated project makes them misread every policy, migration and
edge-function config they touch.

There **is** a second Supabase project, and it is the one that deserves the
"different project" warning: `csusakykwlxixwiimrld` is the Client Portal
(portal.merchanthaus.io). Per `public/docs/crm-bot-prompt.md` the CRM and the
portal share no data. It appears only in that doc, never in app code.

> **`supabase_migrations.schema_migrations` is not an applied/unapplied signal
> here.** It tracks only Lovable's own generated migrations, so hand-named files
> in `supabase/migrations/` are absent from it *even when applied*. Its newest
> row is `20260809230014` while four later hand-written migrations are live in
> production — including `20260810030000_close_anon_write_policies.sql`, which
> reads like an unshipped security fix and is not one. To tell whether a
> migration landed, check the object it creates (`pg_policies`, `pg_proc`,
> `storage.buckets`), never this table.

> **The Lovable connector rate-limits.** Bursts come back as
> `499 request_cancelled`, which looks like a dead connector and is not. Space
> calls roughly 60–90s apart and they succeed.

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
