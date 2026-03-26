

## Switch Google Calendar from Service Account to OAuth Flow

### Why
Service account key creation is disabled in your Google Workspace. OAuth lets team members authenticate directly with their Google accounts — no service account key needed.

### How It Works

```text
User clicks "Connect Google Calendar"
        │
        ▼
Redirected to Google consent screen
        │
        ▼
Google returns auth code → Edge function exchanges for tokens
        │
        ▼
Tokens stored in DB (google_calendar_tokens table)
        │
        ▼
Sync function uses stored refresh tokens to fetch events
```

### Setup Required (Google Cloud Console)

1. Go to **console.cloud.google.com** → APIs & Services
2. Enable **Google Calendar API**
3. Go to **Credentials** → Create **OAuth 2.0 Client ID** (Web application type)
4. Add authorized redirect URI: `https://cuqjaddtmkotgvfsgcol.supabase.co/functions/v1/google-calendar-callback`
5. Copy the **Client ID** and **Client Secret**

### Implementation Steps

**Step 1: Database — Token Storage**

New table `google_calendar_tokens` to store per-user OAuth tokens:
- `id`, `user_email` (unique), `access_token`, `refresh_token`, `expires_at`, `scopes`, `created_at`, `updated_at`
- RLS: only service role access (tokens are sensitive)

**Step 2: Secrets**

Two new secrets:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

**Step 3: New Edge Function — `google-calendar-callback`**

Handles the OAuth redirect from Google:
- Receives authorization code
- Exchanges it for access + refresh tokens using client ID/secret
- Stores tokens in `google_calendar_tokens`
- Redirects user back to `/calendar` with success status

**Step 4: Update Calendar Page — "Connect" Button**

Add a "Connect Google Calendar" button per user that:
- Redirects to `https://accounts.google.com/o/oauth2/v2/auth` with appropriate scopes (`calendar.readonly`), client ID, and redirect URI
- Shows connection status (connected/not connected) by checking `google_calendar_tokens`

**Step 5: Rewrite `google-calendar-sync` Edge Function**

Replace service account JWT logic with:
- Query `google_calendar_tokens` for all connected users
- For each user, use their `refresh_token` to get a fresh `access_token`
- Fetch each user's primary calendar events
- Same upsert/dedup/cleanup logic as current implementation
- No more `GOOGLE_SERVICE_ACCOUNT_JSON` dependency

**Step 6: Shared Calendar Support**

- `GOOGLE_CALENDAR_IDS` secret still used for shared calendars
- Any connected user's token that has access to those shared calendars will be used to fetch them
- Falls back gracefully if no user has access

### What Gets Removed
- All service account JWT signing code
- `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_TEAM_EMAILS` secrets (no longer needed)
- Domain-wide delegation requirement

### Files Changed
- `supabase/functions/google-calendar-sync/index.ts` — rewritten for OAuth tokens
- `supabase/functions/google-calendar-callback/index.ts` — new OAuth callback handler
- `src/pages/Calendar.tsx` — add Connect button + connection status
- New migration for `google_calendar_tokens` table

