## Problem

Today, "Login as" on `/admin/referrers` calls `impersonate-referrer`, gets a magic link, and opens it in a new tab. Because Supabase auth uses shared `localStorage` across tabs of the same origin, consuming that magic link **wipes the admin's session in every tab** — so the admin gets logged out and forced to re-auth themselves afterwards.

Goal: as an admin, clicking "View as" on a referrer should drop you straight into that referrer's portal **without touching your own session**.

## Approach

Introduce a second, isolated Supabase client used **only** for impersonation, scoped to a dedicated route. The admin's main `supabase` client (and its localStorage key) is never touched.

```text
Admin tab (main session)        New tab: /affiliate?impersonate=<id>
─────────────────────────       ───────────────────────────────────
supabase  (sb-*, localStorage)  supabaseImpersonation (sb-impersonation-*, sessionStorage)
   ▲                                ▲
   │ admin stays logged in          │ holds referrer session, dies with the tab
```

## Changes

### 1. New isolated client — `src/integrations/supabase/impersonationClient.ts`
- `createClient(URL, ANON_KEY, { auth: { storage: sessionStorage, storageKey: 'sb-impersonation', persistSession: true, autoRefreshToken: true } })`
- Uses `sessionStorage` so the impersonation session is per-tab and auto-discards when the tab closes.

### 2. Edge function `impersonate-referrer` — return tokens, not just a magic link
- After `generateLink({ type: 'magiclink' })`, call `admin.auth.admin.generateLink` already gives us `properties.hashed_token`. Use `admin.auth.verifyOtp({ token_hash, type: 'magiclink' })` server-side to mint an `access_token` + `refresh_token` for the referrer, and return `{ access_token, refresh_token, referrer_email }`.
- Keep existing audit log + `auth_user_id` backfill.
- Keep team-domain gate.

### 3. Admin trigger — `src/pages/Referrers.tsx`
- On "View as": call the function, store the returned tokens in `sessionStorage` under a one-shot handoff key (e.g. `impersonation-handoff`), then `window.open('/affiliate?impersonate=1', '_blank')`.
- No magic link is ever opened in a browser tab.

### 4. Portal route — read handoff once, hydrate impersonation client
- Add a tiny `ImpersonationBootstrap` that runs before `ReferrerRoute` when `?impersonate=1` is present:
  - Read tokens from `sessionStorage`, delete the handoff key, call `supabaseImpersonation.auth.setSession({ access_token, refresh_token })`.
  - Show an "Admin view — viewing as <name>" banner with an "Exit view" button (closes the tab / signs out of the impersonation client only).

### 5. Portal pages use the impersonation client when in admin-view mode
- `PortalDashboard`, `PortalCommissions`, `PortalNewReferral`, `PortalLayout`, and `AuthContext` consumers used inside `/affiliate/*` need to read from `supabaseImpersonation` instead of `supabase` when the impersonation flag is active.
- Cleanest implementation: a small `usePortalSupabase()` hook that returns `supabaseImpersonation` if a sessionStorage flag `impersonation-active` is set, else `supabase`. Swap the 4–5 direct `supabase` imports inside `src/pages/portal/*` and `src/components/portal/PortalLayout.tsx` to use it.
- `AuthContext` for the impersonated tab: gate it so when `impersonation-active` is set, it subscribes to `supabaseImpersonation.auth` instead. (Single conditional at context init.)

### 6. Visual cue
- Persistent top banner in the impersonated tab: "Admin View — acting as {referrer name}. Exit view." Red/amber accent, sticky.

## Result
- Admin's own session is never overwritten — no re-auth.
- Impersonated tab is fully isolated, dies with the tab, never leaks back into the admin's main session.
- Audit log still records every impersonation.
