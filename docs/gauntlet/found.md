# Found while building — not fixed

`gauntlet-builder` writes here instead of fixing things outside its item. That
rule is what keeps a one-item session from turning into a forty-file diff.

Triage this file at the start of each phase: promote anything real into that
phase's brief, delete anything that turned out to be nothing.

Format:

```
## <date> — <phase/item that found it>
**What:** one line
**Where:** file:line
**Why not fixed:** outside the item
**Severity:** blocker | real | cosmetic | unsure
```

---

## 10 Aug 2026 — found while answering the 2A-function decisions

**What:** Opportunity assignment notifications have never fired. Both
`notify_opportunity_assignment` and `send_stage_change_email_notification`
resolve the assignee with `SELECT … FROM profiles WHERE email = NEW.assigned_to`,
but `opportunities.assigned_to` holds **display names** (`Darryn`,
`Yaseen Sheik`, `Jamie`, …), not emails. Measured: **90** opportunities have
`assigned_to` set and **0** match any `profiles.email`. So `assigned_user_id`
is always null, and both the `notifications` row and the system DM are skipped.
`post_system_chat_message` sits outside that guard and still posts, which is
probably why it has gone unnoticed — assignments *look* like they announce.
**Where:** `notify_opportunity_assignment`, `send_stage_change_email_notification`
**Why not fixed:** pre-existing, and the fix is a judgement call — either
backfill 90 rows to emails (and change every writer) or change the triggers to
resolve on `full_name`. Both are their own session, and the second still breaks
on duplicate or changed names.
**Severity:** real

**What:** `scoping_submissions.assigned_to` carries a column COMMENT asserting
that `opportunities.assigned_to` and `tasks.assignee` are "TEXT holding an
email". That is wrong (see above) and it is in the live database, so it will
mislead anyone who inspects the schema.
**Where:** `COMMENT ON COLUMN public.scoping_submissions.assigned_to`, set by
`supabase/migrations/20260809180000_scoping_submission_links.sql`
**Why not fixed:** the migration is applied; correcting it needs a follow-up
comment-only migration, and CLAUDE.md keeps migrations in their own session
**Severity:** cosmetic — but actively misleading, so worth a one-line migration

**What:** `opportunities.service_type` holds three values, not two —
`processing` (77), `gateway_only` (14), `gateway` (2). The last two look like
the same concept spelled two ways. Phase 2's brief described the target as a
"two-value enum"; it is plain `text` with no constraint.
**Where:** `public.opportunities.service_type`
**Why not fixed:** deciding whether `gateway` is a typo for `gateway_only` or a
distinct offering is a product call, and collapsing it touches 2 live rows
**Severity:** unsure

---

## Seeded from the audit work already merged

These were found during Audits 1 and 2 and deliberately left. They are here so
they are not rediscovered from scratch every phase.

**Decisions, not bugs — these need an answer before they can be built:**

- **D1** `/apply` vs `/merchant-apply` — what distinguishes them? One gets
  deleted in Phase 1B and the loser's route redirects to the survivor.
- **D2** Is the office chat actually used, or is real coordination happening
  in WhatsApp/Slack? Decides whether ~10 components go.
- **D5** Who are the real admins? Seeds `user_roles` in Phase 3A.
- **D6** Is the Capacitor app distributed to anyone? Decides whether the
  remaining Phase 5B items matter.
- **D8** How many themes does the team actually use? The plan proposes 14 → 2.
  Note that #128 has since made all fourteen theme-aware, so cutting to two is
  now a smaller job than it was — but also a less urgent one.

**Carried over from Audit 2, deliberately not done:**

**What:** `ResponsiveDialog` wrapper — `Dialog` on desktop, `Drawer` on mobile
**Where:** every modal in the app
**Why not fixed:** design decision, and a refactor across every modal
**Severity:** real

**What:** Row actions via action sheet instead of inline selects on mobile
**Where:** `src/pages/Opportunities.tsx` and sibling list pages
**Why not fixed:** design decision (#162)
**Severity:** real

**What:** Bottom-area collision — tab bar, dock, tri-tab dock, action items
and chat can all occupy the bottom of a phone screen at once
**Where:** `src/components/AppShell.tsx`
**Why not fixed:** product decision, same call as Audit 1 #58 (#165)
**Severity:** real

**What:** Deep-link handling for push notifications
**Where:** needs `@capacitor/app`, Android intent filters, iOS associated
domains
**Why not fixed:** config lives outside this repo (#152)
**Severity:** real

**What:** Double safe-area inset in the native build — `overlaysWebView: false`
plus `viewport-fit=cover` plus `paddingTop: env(safe-area-inset-top)`
**Where:** `capacitor.config.ts` + `src/components/MegaMenuHeader.tsx`
**Why not fixed:** needs a device build to confirm (#151)
**Severity:** unsure

**What:** Table virtualisation on `/opportunities`
**Where:** `src/pages/Opportunities.tsx`
**Why not fixed:** larger than its audit line implies (#63) — belongs in 6B
**Severity:** real

**What:** Command palette searches pages only, not records
**Where:** `src/components/CommandPalette.tsx`
**Why not fixed:** larger than its audit line implies (#157)
**Severity:** real

**What:** `/scoping-disclosures` cannot be scrolled — the page renders 2611px
of content inside `min-h-screen` with no scroll container, and the global
`html, body, #root { height: 100%; overflow: hidden }` in `src/index.css:1203`
means nothing above it scrolls either. Verified in Chromium at 360x740:
`scrollHeight` 2611, `clientHeight` 2611, `documentElement.scrollTop` stays 0
after being set. Everything past the first viewport is unreachable. The other
public forms dodge this by using their own `overflow-y-auto` container.
**Where:** `src/pages/ScopingDisclosures.tsx:13`
**Why not fixed:** owned by another builder (2B), out of scope for 2D-5
**Severity:** real

**What:** The same `fixed inset-0 z-50` overlay + solid-emerald filled-field
treatment that 2D-5 removed from `/scoping` is still present, verbatim, on
`/merchant-apply` (and the overlay alone on `/contact` and `/scope`).
**Where:** `src/pages/MerchantApply.tsx:676,717,734`, `src/pages/Contact.tsx:90`,
`src/pages/QuickScope.tsx:191`
**Why not fixed:** explicitly out of scope for 2D-5 (Scoping.tsx only)
**Severity:** real
