## Goal
Retire the old `logo-light.png` (and matching `logo-dark.png`) and use `src/assets/ps-terminal-logo.png` as the single Ops Terminal logo across all auth/branded screens.

## Changes
Update these 5 files so both light and dark themes import and render `ps-terminal-logo.png` (drop the theme-conditional swap):

1. `src/components/ForcePasswordChange.tsx` — the screen in your screenshot
2. `src/pages/UpdatePassword.tsx`
3. `src/pages/ForgotPassword.tsx`
4. `src/pages/Apply.tsx`
5. `src/pages/LiveAccountDetail.tsx`

Then delete the now-unused asset files:
- `src/assets/logo-light.png`
- `src/assets/logo-dark.png`

## Out of scope
No layout, sizing, or copy changes — pure asset swap. Favicon and OG image untouched.