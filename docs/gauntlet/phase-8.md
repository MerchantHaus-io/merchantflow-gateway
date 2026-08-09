# Phase 8 — The business loops

**Everything above is remediation. This is the product.**

**Recon verdict: not started, except a genuine partial on 8.1.** D7 confirms
nothing reconciles expected vs paid residual today.

---

## 8.1 — Residual reconciliation (#201) · PARTIAL · **build this first**

More exists than D7 assumed, which makes this cheaper than it looks.

**Already there** — `src/pages/Commissions.tsx:158-198` queries
`nmi_partner_residuals`, joins on `nmi_gateway_id`, and renders **Est. Total**
(processing residual + gateway margin, computed from the accepted quote / Kurv
split, lines 415-460) beside **NMI Actual**. Line 426 flags a month-on-month
drop: `const declining = (r.commission_change_pct ?? 0) < -10` draws an amber
left border.

**So the two numbers are already side by side.** What's missing is everything
that turns that into reconciliation:

1. **No computed delta.** The columns sit next to each other and the human
   does the subtraction. There is no variance figure, no variance column, no
   report.
2. **A live merchant with no residual line renders `—`** (`Commissions.tsx:449-451`)
   with no alert. That is the single most valuable signal in the whole
   feature — a live merchant paying you nothing — and it is currently a dash.
3. **No effective-rate drift detection.** `grep` for `effective_rate` /
   `rate_drift` / `contracted schedule` across `src` and `supabase` returns
   nothing.
4. `supabase/functions/nmi-partner-residuals/index.ts` (303 lines) only
   fetches and persists NMI's raw report. It computes nothing.

**Gate — `EXECUTABLE`**
```bash
grep -n "variance_pct\|effective_rate\|rate_drift\|no_residual_alert" \
  src/pages/Commissions.tsx supabase/functions/nmi-partner-residuals/index.ts
# currently returns nothing — PASS requires all four concepts present
```

**Gate (the real one) — `NOT EXECUTABLE` by an agent.** Run last quarter's
actual statements through it. PASS requires it to surface **at least one
genuine expected-vs-paid variance**, or to prove the books are clean with the
arithmetic shown. "The code runs" is not a PASS. This one is yours.

> For an ISO the residual line is where under-reporting, silent repricing and
> quiet attrition all show up first. If the Ops Terminal does one thing no
> off-the-shelf CRM does, make it this.

---

## 8.2 — Opportunity cadence (#202) · NOT_STARTED

`next_action_at` and `next_action_type` on every opportunity, a daily digest,
and escalation past N days with no logged activity.

**Two corrections to the plan:**

**(a) "Reuse the `sla-escalation` machinery" is aspirational.**
`supabase/functions/sla-escalation/index.ts` keys off `stage_entered_at`
against a per-stage hour threshold (`SLA_THRESHOLDS:13-22`). That is a
*stage-dwell* SLA. Cadence is a *next-action* clock. They share a shape, not
an implementation.

**(b) D3 makes the dialler a dependency.** The escalation fires when a deal
passes N days "with no logged activity". The Quo dialler does not currently
log calls against opportunities. So a rep who phones a merchant every day
still trips the escalation. **Wire the call logging in this session or 8.2
ships as a false-alarm generator** — and a digest people learn to ignore is
worse than no digest.

**Gate — `EXECUTABLE`**
```bash
grep -c 'next_action_at' src/integrations/supabase/types.ts   # 0 today
ls supabase/functions | grep -i digest                        # nothing today
```

---

## 8.3 — Merchant status page (#203) · NOT_STARTED

The `/q/:token` route exists (`App.tsx:179`) but resolves to
`QuoteAcceptance.tsx` — the accept-and-sign flow. After acceptance it shows a
static thank-you (`QuoteAcceptance.tsx:293-304`). **Do not mistake the
existing route for progress on this item**; only the tokenised-page *pattern*
is reusable.

Build: what you've received, what you're waiting on, who their rep is, what
happens next.

> **CLAUDE.md applies.** This is a merchant-facing surface. Any line
> description it renders goes through `stripInternalCostRefs()`.

---

## 8.4 — Reporting loops · NOT_STARTED

- **#204 loss reasons by tier and stage.** `Reports.tsx:142` already *fetches*
  `outcome_reason` — and never references it again. The data is in hand; only
  the aggregation is missing. Cheapest item in the phase.
- **#205 lead source → 12-month survival.** Nothing exists.
- **#206 weighted forecast as expected monthly residual at month six**, not
  deal count. Nothing exists.

**Gate — `EXECUTABLE`**
```bash
grep -c 'outcome_reason' src/pages/Reports.tsx   # 2 today: a type decl and the fetch
```

---

## 8.5 — Consolidations · NOT_STARTED

**#199 one "Board this deal" flow.** `/tools/nmi-boarding` and `/tools/kurv`
are two routes (`App.tsx:231-232`) and two nav entries
(`navigation.ts:142-146`) — two dashboards, two mental models. Branch
internally instead.

**#200 prune the AI surface.** Atria is globally mounted via `FloatingChat` in
`AppShell.tsx:232`, backed by `supabase/functions/ai-assistant` — a
system-prompted assistant with tools to create and update CRM records, read
documents and run underwriting checks. Keep `classify-document` and
`analyze-statement`; drop the on-screen-data chat box.

> **D2 already decides most of this.** The office chat is going in Phase 1B,
> and `FloatingChat` is the same mount point. Sequence #200 with 1B rather
> than duplicating the removal.

---

## Order

**8.1 → 8.4a (loss reasons, cheap) → 8.2 (with call logging) → 8.3 → 8.5 → 8.4b/c.**

8.1 first because it is the one with a number attached to it.
