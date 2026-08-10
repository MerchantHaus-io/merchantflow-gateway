# Phase 2 — Merchant-side wiring

> **Run status — 9 Aug 2026 (`gauntlet/phase-2`).**
> Through the loop and PASSED: **2A-migration** (applied), **2B Quick Scope**,
> **2D-5** the six design fixes.
> Still open: **2A-function** (**decisions answered 10 Aug 2026 — ready to
> build**), **2C** (premise false — four projects, see below), **2D** (exceeds
> the 15-file ceiling; depends on 2A/2B/2C).
>
> ## 2A-function — the three decisions, answered 10 Aug 2026
>
> **1. Ownership: leave it unassigned. The task goes to a queue, not a person.**
> This resolves the item's self-contradiction by taking it literally —
> `assigned_to = null` on the opportunity, and the follow-up task lands on a
> shared queue / the notice board rather than being silently dropped on someone
> who never looks at it. Do **not** invent an owner to satisfy the task.
>
> **2. `service_type`: default `'processing'`, narrow exceptions.**
> Set `'processing'` unless *every* selected `integration_route` is
> gateway-only — Direct API, Hosted payment page, Embedded fields/Collect.js,
> Plugin or cart extension, Mobile SDK — **and** no terminal option is
> selected, in which case `'gateway_only'`. `"Not sure — advise us"` →
> `'processing'`. This matches the live distribution (below), not a guess.
>
> **3. PDF: the browser generates it, the function attaches it.**
> jsPDF builds the answers PDF at submit time and uploads it to storage; the
> edge function attaches the stored object to the confirmation email. This is
> the existing client-generates / server-relays pattern, and it stays covered
> by `tsc`. **No edge function in this repo generates a PDF**, and `tsc` does
> not cover `supabase/functions/`, so a Deno generator would be novel code
> invisible to every local check.
>
> > **CLAUDE.md applies to that PDF.** It is a merchant-facing document, so any
> > line descriptions must run through `stripInternalCostRefs()`
> > (`src/lib/redactCost.ts`). Run `npx vitest run redactCost` and report.
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

> ⚠️ **CORRECTION, 10 Aug 2026 — an earlier version of this brief was wrong.**
> It said `opportunities.assigned_to` is "`text` holding an email" and told
> 2A-function to resolve uuid → email via `profiles`. **That is not what the
> column holds.** Checked against the live data:
>
> ```
> assigned_to | Darryn(46)  Yaseen Sheik(19)  Jamie(17)
>             | Taryn Engledoe(5)  Xavier Rooza(2)  Jude(1)  null(3)
> ```
>
> It holds **display names**. Following the old instruction would have written
> an email into a column of names — matching nothing, and consistent with
> nothing.
>
> **This has already broken assignment notifications, and not because of us.**
> `notify_opportunity_assignment` and `send_stage_change_email_notification`
> both do `SELECT … FROM profiles WHERE email = NEW.assigned_to`. Names on one
> side, emails on the other:
>
> | | |
> |---|---|
> | opportunities with `assigned_to` set | 90 |
> | whose value matches any `profiles.email` | **0** |
>
> So `assigned_user_id` is always null and both the notification row and the
> DM are skipped. `post_system_chat_message` sits *outside* that guard, so a
> chat message still posts on every assignment — which is very likely why
> nobody has noticed. Pre-existing; see `found.md`.
>
> **For 2A-function this is now moot** — decision 1 leaves the opportunity
> unassigned. Do not write `assigned_to` at all. It is recorded here because
> anyone who touches assignment needs it, and because the brief previously
> asserted the opposite.
>
> Schema facts that ARE correct: `opportunities.assigned_to text` ·
> `tasks.assignee text` · `profiles.id uuid` + `profiles.email text`. `tasks`
> has **no** `assigned_to` column — it is `assignee` — and `created_by` is
> likewise `text`.
>
> ⚠️ **`scoping_submissions.assigned_to` carries a stale column COMMENT** from
> `20260809180000`, asserting the email claim above. The migration is applied,
> so correcting it needs a follow-up comment-only migration. Do not trust that
> comment.

Verified before applying: rebuilt on a real Postgres 16.13 and applied three
times for idempotency; proved the validating FK fails atomically on an orphan
`opportunity_id`; then measured the live orphan count at **zero** — the one
risk local testing could not close.

### 2A-function — PARTIALLY DELIVERED, 10 Aug 2026

**Shipped** in `submit-scoping-request/index.ts` + `_shared/scoping-routing.ts`:

- **1. account + contact + opportunity.** Matches contact on email (ILIKE,
  wildcards escaped), then account on business name, then creates what is
  missing. `stage = 'discovery'`, `status = 'active'`, `source = 'web_form'`.
- **2. Rep-link attach (#182).** A resolvable `opportunity_id` attaches to that
  opportunity instead of creating a second one. An unresolvable one is logged
  and a fresh opportunity is created — never dropped.
- **3. Team notification.** Fans out `notifications` rows to everyone holding
  `staff` or `admin`, deep-linked to the opportunity. Not a hardcoded address:
  there is no owner to email, because of decision 1.
- **5. The task.** `assignee = null` (the queue), `status = 'open'`,
  `priority = 'high'`, `source = 'scoping'`, due one business day out,
  weekends skipped.

**The whole routing step is best-effort and never fails the submission.** The
row is saved first; if any downstream insert throws, it is logged and the
merchant still gets a success. Losing a submission to a routing error would be
strictly worse than routing it by hand later.

> **`source = 'web_form'` is deliberate.** All 93 existing opportunities use
> that value, so a new one would hide these deals from any view already
> filtering on it. Provenance lives in `scoping_submissions.opportunity_id`.

**NOT shipped, and why:**

- **4. Merchant confirmation email + PDF.** Blocked, not skipped. The decision
  is browser-generates / function-attaches, which needs the PDF uploaded to
  storage — and the only buckets are `avatars`, `chat-attachments` and
  `opportunity-documents`, none writable by an anonymous submitter. Granting
  that needs a **storage RLS policy = a migration**, and CLAUDE.md forbids a
  migration and client changes in one session. Do it as: migration session
  (bucket + policy) → then client + `send-scoping-confirmation`.
- **6. SLA clock.** `sla-escalation` covers support tickets only.
  **Semantics decided 10 Aug 2026: a first response is an OUTBOUND EMAIL
  logged against the opportunity.** Not someone opening the submission, and
  not the task moving to `done` — both can happen without the merchant hearing
  anything, and what the merchant hears is the only thing an SLA promises.

  So `scoping_submissions.first_response_at` is stamped when the first
  outbound email attributable to the linked `opportunity_id` is recorded, and
  `sla-escalation` escalates any submission still null past the threshold.

  > **Confirm the source table before building this.** `message_logs` and
  > `synced_emails` both exist, and it is not yet established which records
  > outbound mail or whether either carries a reliable opportunity linkage. If
  > the linkage is missing, THAT is the task — an escalation rule reading a
  > column nobody populates is the same silent-nothing failure as the
  > assignment notifications.

**Testing note that matters.** `tsc` does not cover `supabase/functions/`, so
the business logic was put in `_shared/scoping-routing.ts` with **no Deno APIs
or remote imports**, and `src/lib/scopingRouting.test.ts` imports it. That
pulls it into both the typecheck (TypeScript follows imports) and `vitest` —
20 tests. The rest of the function body still has to be read back by eye; it
was, and it was also parsed with the TypeScript parser directly.

**Do not re-plan the migration.**

> The invariant still stands downstream: CLAUDE.md forbids migrations and
> client changes in one session.

**Gate — `EXECUTABLE` (the useful half)**
```sql
select o.id, t.id, s.first_response_at
  from opportunities o
  join tasks t on t.related_opportunity_id = o.id
  join scoping_submissions s on s.opportunity_id = o.id
 where s.contact_email = '<test-email>';
-- PASS: a row within 60s of submitting
```

> The join column is **`tasks.related_opportunity_id`**, not `opportunity_id`.
> An earlier version of this gate used the latter, which does not exist — so the
> gate raised `column t.opportunity_id does not exist` instead of returning zero
> rows. A gate that errors is worse than one that fails: the critic cannot tell
> "not built yet" from "gate is wrong", and the tempting repair is to guess a
> column name. Verified against the live schema 10 Aug 2026.

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
