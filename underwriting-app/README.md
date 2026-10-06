# Underwriting App — standalone multi-tenant AI underwriting SaaS

A self-contained product extracted from the MerchantHaus gateway CRM: the AI
underwriting review, rebuilt as a **multi-tenant, white-label SaaS** that can be
licensed to ISOs. This directory is designed to be lifted into its own repo +
Supabase project unchanged (`git mv underwriting-app/* ../new-repo/`).

> **Status: Phase 0** — scaffold, tenant model + RLS, the underwriting-review
> edge function, and the core cases UI. Self-serve billing (Stripe) and email
> delivery of invites are Phase 1. See the approved Phase 0–3 plan for the roadmap.

## Stack
Vite + React 18 + TypeScript + Tailwind (shadcn-style primitives) · Supabase
(Postgres + RLS, Auth, Storage, Edge Functions). No CRM code, no hardcoded brand.

## Architecture at a glance
- **Tenancy:** every table carries `org_id`; isolation is one RLS shape driven by
  `public.user_orgs()` (migration `0001`). The `underwriting-review` edge function
  runs with the service-role key (which bypasses RLS) and therefore **re-checks
  org membership from the caller's JWT** (`_shared/tenant.ts`).
- **Branding:** per-tenant `org_settings` (logo/color/product_name) applied at
  runtime via `TenantBrandProvider` (CSS variables) — nothing is hardcoded.
- **Underwriting brain:** `supabase/functions/underwriting-review` + `_shared/*`.
  The prompt's house rules (foundation threshold, required docs) come from
  `org_settings.house_rules`; the response contract lives in `_shared/spec.md`.

## Local / deploy setup
1. Create a **fresh Supabase project** (paid infra — this is a deliberate
   checkpoint, do not provision without sign-off).
2. `cp .env.example .env.local` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. Apply schema: `supabase link --project-ref <ref> && supabase db push`
   (runs `supabase/migrations/0001..0003`).
4. Set function secrets:
   `supabase secrets set LLM_API_KEY=… LLM_BASE_URL=…` (OpenAI-compatible gateway).
5. Deploy the function: `supabase functions deploy underwriting-review`.
6. `npm install && npm run dev` (or `npm run build`).

## Verification (Phase 0 exit)
- ✅ `npm run build` is clean; `grep -ri merchanthaus\|nmi src/` returns nothing.
- ⏳ **Deferred to project provisioning** (needs a live Supabase project):
  - **Isolation:** two orgs A/B; user B cannot read A's case/report/storage
    object, and the edge function returns 404 when B passes A's `caseId`.
  - **Happy path:** create case → upload docs → Run review → a `validation_reports`
    row is written with `org_id`+`case_id`, `usage_events` increments, panel renders.
  - **Branding:** change `org_settings` color/name → UI reflects it, no code change.
