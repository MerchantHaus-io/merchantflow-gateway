## Rename `/portal` → `/affiliate`

Change the referrer dashboard URL from `/portal` to `/affiliate` everywhere it's referenced. File paths and component names stay the same (no folder rename) to keep the diff small and avoid breaking imports.

### Route changes (`src/App.tsx`)
- `/portal` → `/affiliate`
- `/portal/new-referral` → `/affiliate/new-referral`
- `/portal/commissions` → `/affiliate/commissions`
- Add `/affiliate` to `PUBLIC_ROUTES`
- Keep legacy `/portal*` routes as redirects to `/affiliate*` so old links and the temp creds I just sent still work

### Internal navigation updates
- `src/pages/Auth.tsx` — redirect to `/affiliate`
- `src/pages/Login.tsx` — redirect to `/affiliate`
- `src/components/ProtectedRoute.tsx` — referrer-role redirect → `/affiliate`
- `src/components/ReferrerRoute.tsx` — comment update
- `src/components/portal/PortalLayout.tsx` — nav links (Dashboard, Earnings, Submit Referral) → `/affiliate*`
- `src/pages/portal/PortalDashboard.tsx` — internal `<Link>`s → `/affiliate/new-referral`
- `src/pages/portal/PortalNewReferral.tsx` — back link + post-submit nav → `/affiliate`

### Out of scope
- Folder/file renames (`pages/portal/` → `pages/affiliate/`) — cosmetic only, would touch every import
- Edge functions or DB content referring to "portal" (e.g. `PORTAL_*` secrets, `portal_merchant_id` column) — those are unrelated to the URL
- Magic-link generators that build absolute URLs — confirm with you whether `/portal` deep-links from external systems should also redirect (the legacy redirect above covers the common case)

### New login URL
After this change: `https://ops-terminal.merchant.haus/affiliate` (or `/auth` to sign in, then auto-routed).