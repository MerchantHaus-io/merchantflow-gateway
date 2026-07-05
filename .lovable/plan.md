
# Migration off Lovable Cloud → your own Supabase project

## Constraints you should know first

- This app runs on **Lovable Cloud**, which manages the underlying Supabase project on your behalf. Because of that:
  - The project ref, URL, owning organization, and Supabase dashboard access are **not exposed** to you or to me.
  - A native Supabase **org-to-org transfer is not available** for Cloud-managed projects.
  - The `SUPABASE_SERVICE_ROLE_KEY` and the database password are **not retrievable** on Cloud — not by you, not by me.
- Therefore the migration is a **rebuild-and-replay** into a brand-new Supabase project you own, followed by a data export handled by Lovable support.

## Target end state

- A new Supabase project in **your** Supabase organization holds the schema, functions, storage buckets, and data.
- This repo is moved off Lovable Cloud and points its client at the new project via `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.
- All third-party integrations (Google, NMI, Kurv, Quo, Portal, Resend, VAPID push, encryption) are re-wired against the new project's edge functions.

## Migration steps

### 1. Stand up the new Supabase project (you, in your org)
- Create a new project in your Supabase org. Region should match your users (US).
- From Settings → API, grab: `Project URL`, `anon` (publishable) key, `service_role` key, `Project ref`.
- From Settings → Database, grab the connection string and DB password.
- Note these somewhere safe — do not paste values into this chat.

### 2. Replay schema
- The `supabase/migrations/*.sql` files in this repo are the source of truth for the schema (tables, RLS policies, GRANTs, functions, triggers).
- Run them in order against the new project (Supabase CLI: `supabase link` + `supabase db push`, or paste each migration into the SQL editor in filename order).
- Verify: all 71 `public` tables exist, RLS is enabled, and policies + GRANTs are present.

### 3. Recreate storage buckets
Create these buckets in the new project with the same public/private settings:
- `avatars` — public
- `opportunity-documents` — private
- `chat-attachments` — private

### 4. Deploy edge functions
- All function code lives under `supabase/functions/*` in this repo.
- Deploy with `supabase functions deploy <name>` for each folder (there are ~80).
- `supabase/config.toml` already carries the per-function `verify_jwt` settings — keep it.

### 5. Recreate secrets in the new project
You'll set these in Supabase → Project Settings → Edge Functions → Secrets. Values come from you / the original provider consoles — I will not print any values.

Auto-provided by Supabase (do not set manually):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEY(S)`, `SUPABASE_SECRET_KEYS`

Third-party (re-obtain from each provider's dashboard):
- `RESEND_API_KEY` — from resend.com
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — from Google Cloud Console (also update the OAuth redirect URIs to the new function URLs)
- `GOOGLE_MAIL_API_KEY`, `GOOGLE_DRIVE_API_KEY` — Google connector-managed today; you'll re-issue from Google Cloud
- `NMI_API_KEY` — from NMI partner portal
- `KURV_API_ENV`, `KURV_API_USERNAME`, `KURV_API_PASSWORD` — from EMS Corporate
- `QUO_API_KEY` — from OpenPhone/Quo
- `PORTAL_SUPABASE_URL`, `PORTAL_SUPABASE_ANON_KEY`, `PORTAL_SERVICE_ROLE_KEY`, `PORTAL_WEBHOOK_SECRET` — from the merchant portal Supabase project you already own
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — reuse existing values if you have them, otherwise regenerate (invalidates existing push subscribers)

Generate fresh in the new project:
- `ENCRYPTION_KEY` — used for AES-256-GCM application-secret encryption. **If you regenerate this, previously encrypted `application_secrets` rows become unreadable.** Prefer reusing the current value; obtain it via the Lovable support export below.
- `DEV_AUTOLOGIN_EMAIL`, `DEV_AUTOLOGIN_PASSWORD` — optional dev-only helpers; set new values.

Not applicable in the new project:
- `LOVABLE_API_KEY` — Lovable Cloud-only. If you keep using Lovable AI features, you'll need to keep a Lovable Cloud footprint for that gateway or replace the AI calls (currently used by `ai-assistant`, `polish-email`, `analyze-statement`, `classify-document`, `generate-profile-avatars`) with direct OpenAI/Gemini keys.

### 6. Data export (requires Lovable support)
Because the DB URL and service_role for the Cloud-managed project aren't exposed, request a data export:

- Open **Cloud tab → Advanced settings → Export data** in Lovable, OR
- Email Lovable support and request:
  1. A `pg_dump` of the `public` schema (data + sequences) for project ref `cuqjaddtmkotgvfsgcol`.
  2. A copy of the storage bucket contents for `avatars`, `opportunity-documents`, `chat-attachments`.
  3. The current value of the `ENCRYPTION_KEY` secret (so encrypted `application_secrets` remain decryptable).
  4. The current `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` (to preserve existing push subscriptions).

Load the dump into the new project after step 2 (schema) is complete, and upload the bucket contents into the buckets from step 3.

### 7. Point the app at the new project
Update the frontend env vars used by `src/integrations/supabase/client.ts`:
- `VITE_SUPABASE_URL` → new project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` → new anon key
- `VITE_SUPABASE_PROJECT_ID` → new project ref
- `VITE_VAPID_PUBLIC_KEY` → matching VAPID public key

Two options for hosting the app itself:
- **A. Move hosting off Lovable entirely** — build with the new env vars and deploy to Netlify (repo already has `netlify.toml`) or Vercel. Cleanest cut.
- **B. Keep the Lovable editor but connect the Supabase Integration** to your new project (this replaces Lovable Cloud for this project). Note: once Lovable Cloud is enabled it cannot be *disabled* on this specific project, so a truly clean cut usually means option A.

### 8. Post-cutover checklist
- Re-run migrations against a staging copy first to confirm the SQL is clean.
- Test auth (email/password, Google), pipeline CRUD, quote acceptance, NMI/Kurv/Quo webhooks, Gmail sync, portal magic links, push notifications.
- Update OAuth redirect URIs (Google) and any inbound webhook URLs (NMI, Quo, Resend, Portal) to the new function base URL.
- Rotate `ENCRYPTION_KEY` **only after** confirming no encrypted rows remain.

## What I need from you before build mode
Confirm which of these you want me to prepare in the repo during build:
1. A single-file `docs/MIGRATION.md` capturing the above as an actionable checklist you can hand to whoever runs the migration.
2. A `scripts/apply-migrations.sh` helper that walks `supabase/migrations/` in order against a target `DATABASE_URL`.
3. An `.env.production.example` with the new required frontend variables filled in with placeholders.

I'll only touch documentation/tooling — no schema, function, or app-code changes are needed for the migration itself since the code is already portable.
