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
