# Migration off Lovable Cloud → your own Supabase project

This is the operator-facing checklist derived from `.lovable/plan.md`. Work top-to-bottom.

## 0. Constraints

- The current backend is **Lovable Cloud-managed**. The Supabase project ref, URL, dashboard access, `service_role` key, and DB password are **not exposed** to the app owner and cannot be revealed by the Lovable agent.
- A native Supabase org-to-org **transfer is not available** for Cloud-managed projects.
- Migration is therefore a **rebuild-and-replay** into a fresh Supabase project you control, plus a data export requested from Lovable support.

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

| Bucket | Public? |
| --- | --- |
| `avatars` | Yes |
| `opportunity-documents` | No |
| `chat-attachments` | No |

## 4. Deploy edge functions

All function code lives under `supabase/functions/*` (~80 functions). `supabase/config.toml` carries the per-function `verify_jwt` overrides — keep it as-is.

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
