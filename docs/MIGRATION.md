# Migration off Lovable Cloud → your own Supabase project

This is the operator-facing checklist derived from `.lovable/plan.md`. Work top-to-bottom.

## 0. Constraints

- The current backend is **Lovable Cloud-managed**. The Supabase project ref, URL, dashboard access, `service_role` key, and DB password are **not exposed** to the app owner and cannot be revealed by the Lovable agent.
- A native Supabase org-to-org **transfer is not available** for Cloud-managed projects.
- Migration is therefore a **rebuild-and-replay** into a fresh Supabase project you control, plus a data export requested from Lovable support.

> ### ⚠️ Precondition: the source project must be RUNNING
>
> As of the pause in Aug 2026, `cuqjaddtmkotgvfsgcol` is **paused**. A paused Supabase
> project has its database shut down — you cannot connect, cannot `pg_dump`, and cannot
> read a single row. **No step below can start until the project is restored.**
>
> Because dashboard access is not exposed for Cloud-managed projects (see above), the
> restore is requested **through Lovable**, not clicked in the Supabase dashboard.
> Supabase's own 90-day restore window still applies underneath: past 90 days the
> one-click path disappears, and past a year the project is deleted outright. Establish
> how many days remain before anything else.

## 1. Create the new Supabase project

1. Create a new project in **your** Supabase organization. Match the region to your users (US).
2. Capture from Settings → API: `Project URL`, `anon` (publishable) key, `service_role` key, `Project ref`.
3. Capture from Settings → Database: pooled + direct connection strings, DB password.
4. Store all of the above in a password manager. **Do not paste secret values into Lovable chat.**

## 2. Replay the schema

The `supabase/migrations/*.sql` files in this repo are the source of truth (tables, RLS, GRANTs, functions, triggers).

Option A — Supabase CLI:
```sh
supabase link --project-ref <new-project-ref>
supabase db push
```

Option B — helper script in this repo:
```sh
export DATABASE_URL='postgres://postgres:<pw>@db.<ref>.supabase.co:5432/postgres'
./scripts/apply-migrations.sh
```

Verify: 71 tables in `public`, RLS enabled on all, policies + GRANTs present.

## 3. Recreate storage buckets

| Bucket | Public? | Notes |
| --- | --- | --- |
| `avatars` | **Yes** | public read policy |
| `opportunity-documents` | No | created public, **flipped private** by a later migration |
| `chat-attachments` | No | created public, **flipped private** by a later migration |
| `scoping-documents` | No | 5 MB limit, `application/pdf` only — a manual re-create misses both |

> ⚠️ `opportunity-documents` and `chat-attachments` are each created **public** and turned
> private by a later migration (`20260228171812_*.sql:3` and `20260228203824_*.sql:3`).
> Replaying migrations in order reproduces the flip correctly. Restoring a *bucket snapshot*
> may not — and a bucket that comes back public makes merchant documents world-readable with
> no error anywhere. Verify the `public` flag on both after loading data.

> `storage.objects` RLS policies live across 8 migrations and are **not** in a `pg_dump` of
> the `public` schema. They come from the migration replay, not the data load.

## 4. Deploy edge functions

All function code lives under `supabase/functions/*` (**73 deployable functions**, plus `_shared/` which holds 11 helper modules and is not a function). `supabase/config.toml` carries the per-function `verify_jwt` overrides — copy it verbatim
apart from `project_id`. It names only **51** of the 73; the other 22 default to
`verify_jwt = true`. Dropping the file silently changes the auth posture of every function
in it, including the public merchant-intake endpoints that must stay `false`.

```sh
for f in supabase/functions/*/; do
  name=$(basename "$f")
  [ "$name" = "_shared" ] && continue
  supabase functions deploy "$name" --project-ref <new-project-ref>
done
```

## 5. Recreate secrets

Set these in Supabase → Project Settings → Edge Functions → Secrets. **Values come from you / the original providers — never paste them into Lovable chat.**

**Auto-provided by Supabase — do not set manually:**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`.

**Re-obtain from each third-party provider:**
- `RESEND_API_KEY` — resend.com
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — Google Cloud Console (also update authorized redirect URIs to the new function URLs)
- `GOOGLE_MAIL_API_KEY`, `GOOGLE_DRIVE_API_KEY` — Google Cloud Console (currently connector-managed on Lovable)
- `NMI_API_KEY` — NMI partner portal
- `KURV_API_ENV`, `KURV_API_USERNAME`, `KURV_API_PASSWORD` — EMS Corporate
- `QUO_API_KEY` — OpenPhone/Quo
- `PORTAL_SUPABASE_URL`, `PORTAL_SUPABASE_ANON_KEY`, `PORTAL_SERVICE_ROLE_KEY`, `PORTAL_WEBHOOK_SECRET` — the merchant portal Supabase project
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — reuse existing values if you can (see §6), otherwise regenerate (invalidates existing push subscribers)
- `NMI_PARTNER_QUERY_KEY` — NMI partner portal (separate from `NMI_API_KEY`; used by `nmi-partner-residuals`)
- `GOOGLE_CALENDAR_IDS` — calendar ids synced by `google-calendar-sync`
- `SUPPORT_INBOX_EMAIL` — the support mailbox, read by 5 functions
- `APP_URL` / `FRONTEND_URL` — **both default to `https://ops-terminal.lovable.app` if unset**
  (`send-push-notification/index.ts:170`, `google-calendar-callback/index.ts:10`), so leaving
  them out silently points push deep-links and OAuth returns at the old Lovable frontend

**Security-critical — endpoints stay OPEN if these are missing:**

Per `supabase/functions/_shared/webhook-verify.ts:13`, signature verification is enforced
**only when the secret is configured**, and merely warns when it is not. Omit any of these in
the new project and the corresponding endpoint keeps working *unauthenticated*, with no error:

- `CRON_SECRET` — gates `purge-sensitive-dead-docs`, `purge-stale-documents`
- `CRM_INTERNAL_SECRET` — gates `send-outcome-email`
- `SUPPORT_INBOUND_SECRET` — gates `support-inbound-email`, `sanitize-existing-tickets`
- `PORTAL_WEBHOOK_SECRET` — gates `receive-portal-milestone`

**Generate fresh in the new project:**
- `ENCRYPTION_KEY` — AES-256-GCM key for `application_secrets`. ⚠️ **If regenerated, previously encrypted rows become unreadable.** Reuse the current value via the Lovable support export in §6.
- `DEV_AUTOLOGIN_EMAIL`, `DEV_AUTOLOGIN_PASSWORD` — dev-only helpers.

**Not applicable in the new project:**
- `LOVABLE_API_KEY` — Lovable Cloud-only gateway. To keep the AI features in `ai-assistant`, `polish-email`, `analyze-statement`, `classify-document`, `generate-profile-avatars`, either (a) keep a Lovable Cloud footprint for the gateway, or (b) refactor those functions to call OpenAI/Gemini directly with a key you own.

## 6. Data export (requires Lovable support)

Because the DB URL and `service_role` for the Cloud-managed project are not exposed, request a data export:

1. In-app: **Cloud tab → Advanced settings → Export data**.
2. If that is insufficient, email Lovable support and request:
   - `pg_dump` of the `public` schema (data + sequences) for this project.
   - Copies of the `avatars`, `opportunity-documents`, `chat-attachments` bucket contents.
   - Current `ENCRYPTION_KEY` value (to keep `application_secrets` decryptable).
   - Current `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` (to preserve existing push subscriptions).

Load the dump into the new project **after** §2 completes, and upload bucket contents into the buckets from §3.

## 7. Point the app at the new project

Update the frontend env vars consumed by `src/integrations/supabase/client.ts` — see `.env.production.example`:

- `VITE_SUPABASE_URL` → new project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` → new anon key
- `VITE_SUPABASE_PROJECT_ID` → new project ref
- `VITE_VAPID_PUBLIC_KEY` → matching VAPID public key

Hosting options:

- **A. Move hosting off Lovable entirely (recommended for a clean cut).** Build with the new env vars and deploy to Netlify (`netlify.toml` is already in the repo) or Vercel.
- **B. Keep the Lovable editor + connect the Supabase Integration** to your new project. Note: once Lovable Cloud is enabled on a project it cannot be disabled on that specific project.

## 8. Post-cutover checklist

- Re-run migrations against a staging copy first to confirm SQL is clean.
- Smoke test: email/password + Google auth, pipeline CRUD, quote acceptance, NMI/Kurv/Quo webhooks, Gmail sync, portal magic links, push notifications.
- Update every third-party callback URL (Google OAuth, NMI, Quo, Resend, Portal webhooks) to the new function base URL.
- Rotate `ENCRYPTION_KEY` **only after** confirming no encrypted rows remain.
- Once verified, decommission the Lovable Cloud instance (contact support — Cloud cannot be self-disabled per project).

---

## 9. Silent-failure checklist — verify each explicitly

Everything in this section fails **without an error**. The app keeps rendering, the dashboard
stays green, and the breakage is only visible if you go looking. Treat each as a required
sign-off, not a nice-to-have.

### 9.1 `app.settings.*` GUCs — highest severity

Ten database functions read `app.settings.supabase_url` and `app.settings.supabase_anon_key`
to fire notification emails and push via `net.http_post`. **No migration in this repo sets
them** — they are a platform-level setting on the current project. Every call site is guarded:

```sql
IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL THEN ... net.http_post(...)
```

In a fresh project these are unset, the guard is false, and **every assignment, stage-change,
task, DM and support notification silently stops sending.** No error, no log, no failed row.

*Verify:* change an assignment and confirm an email actually arrives.

### 9.2 Backup cron jobs hardcode the OLD project

`supabase/migrations/20260623151837_*.sql` creates two `pg_cron` jobs whose bodies contain the
old project URL **and** the old anon key (lines 144, 147, 159, 162). Replayed as-is, the new
database drives the *old* project's backup functions. Both keep returning 200 and the backup
pipeline looks healthy while the new project backs up nothing.

*Fix:* rewrite both job bodies with the new URL and key before or immediately after replay.

### 9.3 Frontend fallbacks route traffic back to the old project

These all fall back to the old ref/key when their env var is missing, rather than failing:

- `src/integrations/supabase/client.ts:5,7`
- `src/integrations/supabase/impersonationClient.ts:17,20`
- `src/pages/MerchantApply.tsx:632-633` — **worst case:** if only the URL var is set, it posts
  the *old* anon key to the *new* project and 401s the public merchant intake form
- `src/pages/Scoping.tsx:177-178`, `src/pages/QuickScope.tsx:163-164` — key falls back to `""`

Also re-set **GitHub Actions secrets** (`.github/workflows/ci.yml:30-31`) and the Netlify env.
If those are deleted rather than updated, the build succeeds with empty vars and the fallbacks
above quietly take over. And delete `dist/` — a stale build re-ships the old ref even after
every source fix.

### 9.4 `is_admin_email()` hardcodes mailboxes

`public.is_admin_email()` matches literal addresses (`admin@merchanthaus.io`,
`onboarding@merchanthaus.io`) and gates ~10 RLS policies. If those exact accounts are not
recreated in the new project's `auth.users`, the policies evaluate false and admins see
**empty tables rather than an error**.

*Verify:* sign in as an admin and confirm data is visible.

### 9.5 `auth.users` — ids must survive byte-for-byte

21+ foreign keys reference `auth.users(id)`. The mix of `ON DELETE CASCADE` and
`ON DELETE SET NULL` means a bad import destroys rows in one table and *silently unassigns*
records in another. Carry `raw_app_meta_data` too — `must_change_password` lives there
(`src/contexts/AuthContext.tsx:49-57`), and losing it disables forced password resets silently.

Disable both `auth.users` triggers during bulk import, then re-enable:
`on_auth_user_created` → `handle_new_user()`, and `on_auth_user_created_team_roster` →
`provision_team_roster_member()`. Left enabled they double-create or fail on every row.

### 9.6 Realtime publication membership

24 tables are added to `supabase_realtime` across ~16 migrations. This is **not** in a data
dump. Without it the UI renders correctly and simply stops updating live.

*Verify:* open two sessions and confirm a chat message appears without a refresh.

### 9.7 Do not trust `supabase_migrations.schema_migrations`

It tracks only Lovable-generated migrations, so hand-named files are absent **even when
applied** (see `CLAUDE.md`). Decide what to replay from the files on disk, and confirm what
landed by checking the object itself — `pg_policies`, `pg_proc`, `storage.buckets`.
