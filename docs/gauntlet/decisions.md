# The nine decisions — answered

The execution plan branches on these. Answered by Darryn, 8 Aug 2026, with
evidence added where the repo could settle it.

---

## D1 — `/apply` vs `/merchant-apply`

**Answer: `/apply` is dead. `/merchant-apply` replaced it.**

Phase 1B deletes `/apply` and its page component, and redirects the route to
`/merchant-apply` so existing links and any email already sent do not 404.

> Redirect, do not just delete. This form is on the merchant side of the
> business — a 404 there is a lost application, not a broken link.

---

## D2 — Office chat

**Answer: rarely used. The team communicates through the notice board.**

So the office chat goes, and the **notice board stays and matters more than it
looked**. That reframes it: it is not a widget, it is the team's actual
comms surface, and it should be treated as load-bearing from here on.

Removal is roughly **5,200 lines** across `FloatingChat.tsx` and
`src/components/chat/`. Knock-on edits it forces — these are why this is a
Gauntlet item and not a one-line delete:

- `src/lib/appEvents.ts` — drop `openFloatingChat`
- `src/components/MobileAppDock.tsx` — drop the Chat item from the fan (3 items, not 4; the `FAN_OFFSETS` maths is already derived so it adapts)
- `src/components/PersistentTriTabDock.tsx` — becomes a two-tab dock; rename it
- `src/hooks/useChatNotifications.ts`, `useUnreadMessages`, `IncomingMessageToast`, `useChatSounds` — all go
- `src/components/AppShell.tsx` — drop `<FloatingChat />`
- the `/chat` route and `isChatRoute` handling in `AppShell`

**Keep, explicitly:** `ClientInteractionLog`, `CommentsTab`, `CallLogPanel`,
`CommunicationLogPanel`. Those are attached to records rather than to people,
which is what makes them worth their weight.

---

## D3 — Quo dialler

**Answer: not auto-logging today. Judgment invited.**

**Keep it, and wire the logging.** Reasoning, since you asked for a call:

The dialler is not the point — the log is. Phase 8.2 (opportunity cadence)
escalates a deal that passes N days "with no logged activity". If calls do not
write an activity row, that escalation fires on deals a rep is actively
working. False alarms are worse than no alarms: they train people to dismiss
the digest, and then the one real escalation gets dismissed too.

So auto-logging is not a nice-to-have attached to the dialler. It is a
**prerequisite for 8.2 being trustworthy**, and it should be built in the same
phase, not left as a loose improvement.

The cheap half is already done — the dialler exists, `CallLogPanel` exists,
`call-logs-realtime` exists. What is missing is the write on call end,
attributed to the opportunity.

---

## D4 — `/scoping`

**Answer: new, intended as discovery-call information gathering, probably too
many questions, and not linked to anything yet.**

This confirms the single most valuable finding across all four documents:
**the form writes a row nobody reads.** No entry point (#181), no routing
(#182), no confirmation, no task, no SLA.

Phase 2A stays the highest-priority item in the entire plan. "Too many
questions" is 2B/2D's problem (Quick Scope, then the long form as a
tokenised rep instrument) — but 2A is worth doing **before** the form is
shortened, because a short form that also goes nowhere is no better.

---

## D5 — Admins

**Answer: `admin@merchanthaus.io` is the only real admin.**

Phase 3A's seed is one row, not a list.

> ⚠️ Reconcile before running 3A: the unexecuted migration
> `supabase/migrations/20260807180000_staff_gate_via_user_roles.sql` seeds
> `staff` and `finance` roles from a **wider** hardcoded list, and aborts with
> `RAISE EXCEPTION` if a seeded email matches nobody. Those two facts together
> mean 3A cannot be written until that migration is either applied, amended to
> match this answer, or dropped. Settle it first.

---

## D6 — The native app

**Answer: will be distributed, currently experimental, not urgent — but mobile
is the primary way the CRM is used today.**

That last clause changes the ranking, so it is worth being blunt about it:
**Phase 5B is not skippable, and two items I previously deprioritised move
up.**

- **#151** (double safe-area inset — `overlaysWebView: false` *plus*
  `viewport-fit=cover` *plus* `paddingTop: env(safe-area-inset-top)`) is a
  visible layout bug on the surface most of your usage happens on. It needs a
  device build to confirm, which is the only reason it is still open.
- **#152** (deep links) means a push notification tap cannot open the record
  it is about. On a mobile-primary CRM with `send-push-notification` already
  deployed, that is a daily papercut, not a nice-to-have.

#147 (removing the Lovable sandbox URL from the release config) was already
the right call and is now clearly so: you were one sandbox outage away from a
dead CRM on the surface you use most.

---

## D7 — Residual reconciliation

**Answer: nothing reconciles expected vs paid today.**

Phase 8.1 is greenfield, and it is the item with the highest ceiling in the
document. For an ISO the residual line is where under-reporting, silent
repricing and quiet attrition all surface first. Build it first within Phase 8.

---

## D8 — Themes

**Answer: two dark and two light, at most.**

So the cut is **14 → 4**, not 14 → 2.

One nuance now that audit #128 has landed: chrome colour derives from each
variant's own `--card` via `color-mix()`, so the fourteen themes are no longer
*broken* — they were, before, all wearing the same blue-grey chrome. That
lowers the urgency but not the value: the subtraction still pays in CSS size,
asset weight and every future design change being a quarter of the work.

Pick the four by name before Phase 1A starts, or the session will guess.

---

## D9 — `public/sw.js`

**Answer: yes, it is intentional, it is wired, and it is not the risk the plan
feared. Do not delete it.** Settled from the repo:

| Question | Evidence |
|---|---|
| Is it registered? | Yes — `src/hooks/usePushNotifications.ts:50` and `:95` |
| What does it handle? | `install`, `activate`, `push`, `notificationclick`, `notificationclose` |
| Does it cache anything? | **No — zero `caches.` calls** |
| Is there a backend for it? | Yes — `supabase/functions/send-push-notification` |

The plan's worry was "a stale service worker plus lazy chunks is exactly the
failure mode `lazyWithRetry` was added to paper over". That worry does not
apply: this service worker caches nothing, so it cannot serve a stale chunk.
It is a push-notification transport and nothing else.

Given D6 (mobile-primary), it is load-bearing. Leave it alone.

---

## D10

Your message ended at a bare "10." — if there was a tenth decision, it did not
come through. Nothing in the plan depends on one, so nothing is blocked.
