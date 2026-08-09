# Phase 2 — Merchant-side wiring

> **Run status — 9 Aug 2026 (`gauntlet/phase-2`).**
> Through the loop and PASSED: **2A-migration** (applied), **2B Quick Scope**,
> **2D-5** the six design fixes.
> Still open: **2A-function** (unblocked — needs three decisions, below),
> **2C** (premise false — four projects, see below), **2D** (exceeds the
> 15-file ceiling; depends on 2A/2B/2C).
>
> **2A-function needs your call on three things before a builder touches it:**
> 1. The item contradicts itself — creates the opportunity with
>    `assigned_to = null`, then a task "on the assigned owner". No owner exists.
> 2. `integration_route` → `service_type` is a judgement, not a mapping: eight
>    multi-select free-text options into a two-value enum, several ambiguous.
> 3. The PDF. **No edge function in this repo generates one** — every existing
>    flow is client-generates, server-relays. Client-side jsPDF handoff matches
>    the architecture; a Deno generator would be novel and invisible to `tsc`.
>
> **2C's premise is false.** The Google OAuth requests `calendar.readonly`
> only — no write scope, no free/busy, no availability anywhere. A slot picker
> is a subsystem, not plumbing. `analyze-statement` sits behind `requireAuth`,
> so a merchant cannot call it. Rep phone and photo do not exist as fields. And
> `google-calendar-sync` stores full event bodies, so a naive slot picker would
> leak reps' meeting titles to merchants.

**This is the phase. Recon confirms every item is NOT_STARTED, and D4
confirms the diagnosis: the scoping form is not linked to anything yet.**

A merchant fills in 89 fields and the result is a row nobody reads. No
opportunity, no task, no notification, no confirmation, no SLA. That is the
single most expensive defect across all four documents, and it is not
technically hard.

**Depends on:** Phase 0 (so you can tell when you break it). **Independent of
Phase 1** — run them in parallel if you're impatient.

---

## 2A — Route the scoping submission · NOT_STARTED · **do this first**

`supabase/functions/submit-scoping-request/index.ts` is 179 lines and does
exactly one thing: insert the row. Extend it so that after the insert it:

1. **Creates or matches account + contact + opportunity.** Match on
   `contact_email` first, then `legal_business_name`. `service_type` from
   `integration_route`, `stage = 'discovery'`, `assigned_to = null`.
2. **Links `opportunity_id`** — if the form came from a rep's link, attach to
   that opportunity rather than creating one (#182).
3. **Notifies the team** via `send-notification-email`. A summary and a deep
   link, not all 89 fields.
4. **Confirms to the merchant** — new `send-scoping-confirmation` using
   `_shared/email-layout.ts`. Thanks them, names the rep, restates the
   disclosure with a timestamp, attaches a PDF of their answers (#191).
5. **Creates a task**, 1-business-day due date, on the assigned owner.
6. **Starts an SLA clock** — extend `sla-escalation` to cover scoping
   submissions, not just support tickets.

**Migration: ✅ DONE AND APPLIED — 9 Aug 2026.**
`supabase/migrations/20260809180000_scoping_submission_links.sql`.

`scoping_submissions` now carries `account_id`, `contact_id`, `assigned_to`
and `first_response_at`, plus the FK and index `opportunity_id` had been
missing since the table was created. Existing rows untouched.

**`assigned_to` is `uuid`, a FK to `auth.users`** — confirmed against the live
database. A separate migration (`20260809230014_…`) was authored and applied
instead of this one, and it chose uuid. My file has been corrected to match, so
fresh environments and production agree.

> ⚠️ **2A-function has to convert at the boundary.** `opportunities.assigned_to`
> and `tasks.assignee` are **`text` holding an email**, and the opportunity
> notification trigger does `SELECT … FROM profiles WHERE email = NEW.assigned_to`.
> So a submission carries a uuid while the opportunity and task it creates carry
> emails. Resolve uuid → email via `profiles` when writing them.
>
> **This will fail silently if you get it wrong.** Both target columns are
> `text`, and a uuid string is a perfectly valid text value — you would get an
> opportunity nobody is ever notified about, with no error anywhere.

Verified before applying: rebuilt on a real Postgres 16.13 and applied three
times for idempotency; proved the validating FK fails atomically on an orphan
`opportunity_id`; then measured the live orphan count at **zero** — the one
risk local testing could not close.

**2A-function is unblocked. Do not re-plan the migration.**

> The invariant still stands downstream: CLAUDE.md forbids migrations and
> client changes in one session.

**Gate — `EXECUTABLE` (the useful half)**
```sql
select o.id, t.id, s.first_response_at
  from opportunities o
  join tasks t on t.opportunity_id = o.id
  join scoping_submissions s on s.opportunity_id = o.id
 where s.contact_email = '<test-email>';
-- PASS: a row within 60s of submitting
```

**Gate (the email + PDF) — `NOT EXECUTABLE`.** Needs a test inbox. A human
confirms the confirmation arrived with a PDF attached.

> **CLAUDE.md applies to that PDF.** `send-scoping-confirmation` generates a
> merchant-facing document, so it MUST run line descriptions through
> `stripInternalCostRefs()` (`src/lib/redactCost.ts`). Any new
> merchant-facing generator must. Run `npx vitest run redactCost` and report.

---

## 2B — Quick Scope · ✅ DONE 9 Aug 2026 (#186, #187)

New public route `/scope`, seven fields:

> legal business name · what do you sell (textarea) · monthly card volume
> (**range** select, not a number) · currently processing? (3 options) ·
> contact name · email · phone

Plus the sensitive-data caution and a compressed four-point disclosure linking
to the full text. One screen, no steps, no progress bar. Submits through the
same 2A pipeline.

**Then put it where people can find it** (#181) — D4 confirms it currently has
no entry point at all. merchanthaus.io, email signature, the affiliate
portal's referral form, and a shareable UTM link from inside the CRM.

**A form nobody can reach is not a form.** Distribution is part of the item,
not a follow-up.

**Gate — `EXECUTABLE`**
```bash
grep -n '"/scope"' src/App.tsx        # route exists
grep -n '/scope' src/config/navigation.ts   # reachable from inside the CRM
```

---

## 2C — The confirmation screen · NOT_STARTED (#183)

Replace "return to merchanthaus.io" with, in this order:

1. **Book your scoping call** — slot picker against the assigned rep's Google
   Calendar. The OAuth, the sync and `calendar-reminders` all already exist.
2. **Upload your last processing statement** — tokenised, feeds
   `analyze-statement` (#185). Frame it as *"this replaces about ten of the
   questions below."*
3. **Download a copy of your answers** (PDF).
4. The rep's name, photo and direct line.

**Gate — `NOT EXECUTABLE`.** Visual and flow-dependent. Take the critic seat.

---

## 2D — Full Scope becomes a rep instrument · NOT_STARTED (#184, #187)

D4 says the form is "probably too many questions". So the 89-field form stops
being public and becomes tokenised, pre-filled from the opportunity + Quick
Scope + anything the statement analyser extracted, with only unknown fields
rendered. Autosaved to `scoping_drafts` keyed by token, with an
email-me-a-link-to-continue option. Conditionally rendered. Rep-fillable from
inside an opportunity so it can be driven live on a call.

**Drop or move** (#186): budget expectation and other-providers-evaluated go
to call notes; MCC is derived from the product description, not asked; PCI
becomes one question with guidance.

**Design fixes, same session** (#188–193): 2px accent border instead of
emerald fill; drop the header percentage; collapse "not provided" answers
behind one line; disclosures inline; validate softly on step exit rather than
bouncing to step 0; stop rendering as a `fixed inset-0` overlay.

**Gate — `EXECUTABLE` (persistence half)**
```sql
select token, updated_at from scoping_drafts order by updated_at desc limit 1;
-- PASS: closing the tab and reopening the link restores progress
```

---

## Order

**2A-migration → 2A-function → 2B → 2C → 2D.**

If you only get one session in this whole document, make it 2A. The form
writing a silent row is the thing most likely to be costing you a deal right
now — and D4 confirms it has been doing that since the form shipped.
