# Phase 5 — Mobile

**D6 changes the priority of this phase: mobile is the *primary* way the CRM
is used today.** The plan treats 5B as skippable if the native app isn't
distributed. It is not skippable.

**Recon verdict: 5A and 5B done and adversarially upheld. 5C is the open one.**

---

## 5A — Foundation · ✅ DONE

| Item | Where |
|---|---|
| #134 one breakpoint constant | `lib/breakpoints.ts` → `tailwind.config.ts:3,41` and `use-compact-nav.ts` |
| #136 launcher sheet → vaul `Drawer` | `MobileBottomNav.tsx` |
| #137 Android back closes the sheet | `useHistoryDismiss.ts` — same-URL history entry, no native plugin |
| #138 no programmatic autofocus | `MobileBottomNav.tsx` |
| #139 `dvh` not `vh` | `MobileBottomNav.tsx` |
| #141/#142 dock clamped on mount, resize, orientation, above the tab bar | `MobileAppDock.tsx` |
| #143 fan flips down when there's no room | `MobileAppDock.tsx` |
| #144 Pointer Events throughout | `MobileAppDock.tsx` |
| #166 `calc(56px + env(safe-area-inset-bottom))` | `AppShell.tsx` |
| #177 `NavLink` tabs, `aria-current` free | `MobileBottomNav.tsx` |

**One divergence worth knowing.** The plan says the constant is shared between
Tailwind and `useIsMobile`. It is actually shared between Tailwind's `lg` and
`use-compact-nav`. `useIsMobile()` deliberately keeps its own 768px threshold,
because it answers a different question — "is this a phone-sized viewport?",
which drives content-level choices — rather than "which nav layout is on
screen?". Collapsing them would make tablets render phone dialogs.

---

## 5B — Native shell · ✅ DONE (#147–150, #153–155, #179, #180)

`server.url` removed from the release config — the app was a wrapper around
the Lovable preview sandbox. `cleartext` and `allowMixedContent` dropped.
Status bar and splash from `ThemeContext` at runtime via `lib/nativeChrome.ts`.
Three loading screens collapsed. PWA manifest and `theme-color` added.

### Still open, and D6 raises both

**#152 deep links — NOT_STARTED.** A push notification tap cannot open the
record it is about. `send-push-notification` is deployed and `public/sw.js`
handles `notificationclick` (D9), so the transport exists — what's missing is
`@capacitor/app`'s `appUrlOpen` listener, Android intent filters and iOS
associated domains. **On a mobile-primary CRM this is a daily papercut.**

**#151 double safe-area inset — UNVERIFIED.** `overlaysWebView: false` *plus*
`viewport-fit=cover` *plus* `paddingTop: env(safe-area-inset-top)` on the
header. Likely a fat gap above the logo, native build only.

**Gate — `NOT EXECUTABLE`.** Needs a device build. This is the one item in the
document that no amount of tooling fixes — put a phone in your hand.

---

## 5C — Pages on a phone · PARTIAL

| Item | Status |
|---|---|
| #159 force card view under `md` on `/opportunities` | **DONE** — `effectiveViewMode` |
| #160 card view actually a mobile design | **DONE** — single column, 12px metadata, 44px assignment control |
| #161 filters into a sheet with applied count | **DONE** — `Drawer` + `activeFilterCount` |
| #162 row actions via action sheet, not inline selects | NOT_STARTED — design decision |
| #163 `ResponsiveDialog` wrapper across the modals | NOT_STARTED — refactor across every modal |

**#159–161 landed only on `/opportunities`.** The plan says "and the other
list pages that share the pattern". They still render tables on a phone.
That is the concrete, unglamorous work left in 5C.

**Gate — `EXECUTABLE`**
```bash
grep -rln "useIsMobile" src/pages/Leads.tsx src/pages/Contacts.tsx \
  src/pages/Documents.tsx src/pages/LiveBilling.tsx
# each list page must gate its table/card choice
```

**Gate (device emulation) — `EXECUTABLE`.** 360×640 and an iPhone viewport,
both orientations, confirming each list page renders cards rather than a
table.

**Still `NOT EXECUTABLE`: the native items.** Emulation does not catch #151's
double safe-area inset or the Android hardware back button — the plan says so
and it is right. Those need a device build.

---

## Suggested session

**5C-sibling-pages** (mechanical, gateable) then **#152 deep links** (highest
real-world value on your primary surface). Leave #162/#163 until you've
decided how dialogs should behave on mobile — that is a design call, not a
build.
