## Goal
Whenever we ship changes to the Ops Terminal, the Android APK should pick them up automatically — both the new code AND a visible "what's new" patch-note popup on next launch.

## How updates already reach the APK
The current `capacitor.config.ts` sets `server.url` to the Lovable preview domain. That means the APK is essentially a wrapper around the live web app — **as soon as we Publish from Lovable, the APK loads the new build on next open**. No Play Store resubmission required for frontend changes; backend/edge functions deploy automatically.

So "pushing updates" is already solved. What's missing is the **user-facing patch notes** part.

## What I'll build: Automatic in-app patch notes

### 1. `release_notes` table (Lovable Cloud)
```
id, version (text), title, body (markdown),
published_at, created_by, is_mobile_highlighted (bool)
```
RLS: any authenticated user can read; only admin emails can insert/update.

### 2. Auto-generation hook
A new edge function `publish-release-note` that:
- Accepts a title + body (or auto-derives from the latest AI Terminal Update changelog entry — we already have that pipeline per memory: `terminal-update-automation`).
- Inserts a row in `release_notes` and stamps `published_at = now()`.
- Sets a `current_version` key in a tiny `app_meta` table so clients can detect "new since last seen".

Wire this into the existing Terminal Update changelog flow so **every changelog the AI assistant ships automatically becomes a release note** — no extra step from you.

### 3. `<PatchNotesPopup />` component
- Mounts globally (inside the authenticated app shell).
- On app open, reads `localStorage.lastSeenReleaseId`.
- Queries `release_notes` for any rows newer than that ID.
- If found, shows a polished modal styled in the Dark Luxury Tech aesthetic:
  - Version + date header
  - Markdown body
  - "Got it" CTA → writes the latest ID to `localStorage`.
- On Capacitor (detected via `Capacitor.isNativePlatform()`), uses a slightly larger mobile-optimized layout and respects safe-area insets.

### 4. Admin manual override (optional but cheap)
Small card on `/admin` → "Publish Release Note" with title + markdown body, in case you want to ship a note **without** a code change.

## Why this works end-to-end for the APK
- Frontend code updates → already automatic via Lovable preview-hosted WebView.
- Patch notes content → lives in the database, so it appears in the APK the moment the row is inserted (no APK rebuild, no Play Store review).
- The APK only needs to be rebuilt/resubmitted if we change **native** config (icons, permissions, Capacitor plugins) — not for normal feature work or release notes.

## Files to add / change
- `supabase/migrations/<ts>_release_notes.sql` — table + RLS + grants
- `supabase/functions/publish-release-note/index.ts` — insert helper, callable from existing changelog automation
- `supabase/config.toml` — register the new function
- `src/components/PatchNotesPopup.tsx` — global modal
- `src/App.tsx` (or current shell) — mount the popup once
- `src/components/admin/ReleaseNotePublisher.tsx` — manual entry card
- Hook into existing terminal-update changelog flow so it calls `publish-release-note` automatically

## Out of scope (ask if you want these)
- True OTA bundle updates (Capacitor Live Updates / Capgo) — not needed while `server.url` points at Lovable.
- Push notifications for new release notes (would require Firebase setup).
