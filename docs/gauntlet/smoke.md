# Smoke test

Run after **every session**, not every phase. Three paths. Written down is the
part that matters — an automated version can come later, but a checklist you
actually run beats a Playwright suite you keep meaning to write.

Takes about four minutes.

---

## 1. The internal happy path

1. Sign in with Google.
2. Land on the dashboard. **Header, icon rail and chat must be present before
   the page content resolves** — if you see a full-screen spinner replace the
   whole app, audit #102 has regressed.
3. Open an opportunity.
4. Change its stage.
5. Confirm the activity row appears.

**Also check while you are here** (these are cheap and cover the persistent
chrome, which is the most recently rewritten surface):

- Navigate between three pages. The header and rail must never blink.
- Each page lands scrolled to the top. Press Back — it returns to where you
  were, not the top.
- The browser tab title changes per page and does not read "Merchant Haus
  Onboarding Portal".
- Press Tab once after navigating. Focus lands in content, not back at the
  top of the nav.

## 2. The merchant-facing path

1. Open a quote acceptance link `/q/:token` in an **incognito** window.
2. Confirm no internal widgets render — no rail, no chat, no dock, no
   notification bell.
3. Confirm the page loads and the PDF renders.
4. **Read the PDF line-item descriptions.** No partner cost, no margin, no
   wholesale figure. This is the one project invariant that is a commercial
   problem rather than a bug.

## 3. The public intake path

1. Submit the public support request form.
2. Confirm the ticket appears in triage.

## 4. Merchant-facing pages: scroll to the bottom

On every public page — `/scope`, `/scoping`, `/scoping-disclosures`,
`/merchant-apply`, `/q/:token` — **scroll to the very bottom and confirm you
reach the last line.**

This is not paranoia. `src/index.css:1203` sets
`html, body, #root { height: 100%; overflow: hidden }` globally, so the
document never scrolls. Any page taller than the viewport that lacks its own
`overflow-y-auto` is silently cut off, with everything below the fold
unreachable — and it looks perfectly fine in a screenshot of the top.

`/scoping-disclosures` shipped that way and passed a critic, because the check
asked whether all ten disclosures were in the DOM. They were. Nine of them
could not be read.

On a page of legal disclosures a merchant is asked to accept, "rendered but
unreachable" is not a cosmetic defect.

---

## Mobile pass — add when the session touched mobile

Do this on a real phone, not devtools emulation. Emulation will not catch the
safe-area inset or the hardware back button, which are the two things most
likely to be wrong.

1. Bottom tab bar visible; tapping a tab navigates and marks itself current.
2. Open the **More** launcher. Press Android **Back** — the sheet closes, the
   app does not navigate away or exit.
3. `/opportunities` shows cards, not a fourteen-column table.
4. The floating dock is on screen, above the tab bar, and covers no tab.
   Rotate the device — it is still on screen.

---

## What "failed" means

Any step that does not do what it says. Write it into `found.md` with the step
number and what actually happened, then stop and fix it before starting the
next phase. The point of a smoke test is that it runs *before* you have
forgotten what you changed.
