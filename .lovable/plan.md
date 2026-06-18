## Kurv (EMS MyPortfolio) Integration

A standalone dashboard at `/tools/kurv` that mirrors the NMI tooling pattern. Sandbox-first (`apitest.emscorporate.com`) with an env-driven flip to production (`api.emscorporate.com`). All API calls proxied through Lovable Cloud edge functions — credentials never touch the browser.

---

### 1. Credentials & environment

Add three secrets via the secrets tool:
- `KURV_API_USERNAME` — `Merchanthaus_Test_API`
- `KURV_API_PASSWORD` — you provide securely
- `KURV_API_ENV` — `sandbox` (later `production`)

Edge functions resolve base URL from `KURV_API_ENV`:
- sandbox → `https://apitest.emscorporate.com`
- production → `https://api.emscorporate.com`

Token handling: cache the JWT (and its expiry) in a new `kurv_api_tokens` table (single row, service-role only). Re-acquire via the Token Acquisition endpoint when expired. Never expose username/password/token to the client.

### 2. Database (one migration)

- `kurv_merchants` — synced roster: `mid`, `dba_name`, `legal_name`, `status`, `mcc`, `processor`, `boarded_at`, `last_synced_at`, plus a `raw jsonb` mirror of the EMS payload. Optional `opportunity_id` / `account_id` FKs for CRM linkage.
- `kurv_deal_submissions` — every boarding submission: `opportunity_id`, `deal_id` (returned by EMS), `deal_type` (`signed` | `unsigned`), `status`, `submitted_by`, `payload jsonb`, `response jsonb`, `error`, timestamps.
- `kurv_transactions_daily` — denormalized cache of daily batch/deposit summaries per MID for fast dashboard reads.
- `kurv_api_tokens` — `token`, `expires_at`. Service-role only.
- `kurv_sync_logs` — run history for roster + transaction syncs (mirrors `commission_sync_logs`).

RLS: all tables readable by `authenticated`; writes restricted to service_role (edge functions). Standard `GRANT` block on each. Admins-only mutations on `kurv_deal_submissions` from the client (only edge functions insert).

### 3. Edge functions

All register in `supabase/config.toml` with `verify_jwt = false` and validate the caller JWT in-code via `_shared/require-auth.ts`.

- `kurv-token` *(internal helper, not exposed)* — acquires/refreshes JWT, persists in `kurv_api_tokens`.
- `kurv-list-merchants` — calls `POST /reference/list-merchants`, upserts into `kurv_merchants`, writes a `kurv_sync_logs` row.
- `kurv-get-merchant` — pass-through wrapper for `Get Specific Merchant`.
- `kurv-board-deal` — accepts wizard payload, posts to `Submit Signed Deal V2` or `Submit Unsigned Deal`, records in `kurv_deal_submissions`. Supports document attachments via `Add Documents`.
- `kurv-deal-status` — polls `Get Deal Status`, updates submission row.
- `kurv-transactions` — fetches Daily/Monthly Batch + Deposit summaries for a MID range, caches into `kurv_transactions_daily`.
- `kurv-chargebacks` — list chargeback summaries/details on demand.
- `kurv-merchant-statement` — fetches and streams the PDF statement (base64 → blob) for a MID/month.
- `kurv-lookups` — proxies the reusable reference lists (MCCs, owner titles, ownership types, sales people, address/bank validators) used inside the wizard.

Optional cron (via `pg_cron`):
- daily roster sync at 06:00 CT → `kurv-list-merchants`
- hourly transaction refresh during business hours → `kurv-transactions` for active MIDs

### 4. Frontend — `/tools/kurv`

New route gated by `ProtectedRoute` + `InternalWidgets` visibility (internal-only). Mirrors NMI Boarding's structure but lives as its own dashboard tab so it does not interfere with NMI flows.

Layout (single page with internal tabs):

1. **Overview** — KPIs: total active MIDs, MTD volume, MTD transactions, open deals, recent chargebacks. Recent deal submissions table.
2. **Boarding Wizard** — multi-step form (Merchant → Owners → Bank → Pricing → Equipment → Review). Inline lookups call `kurv-lookups`. Two submit modes: **Save as Unsigned Deal** (editable) or **Submit Signed Deal**. Optional link to a CRM opportunity to auto-populate.
3. **Merchants** — searchable table backed by `kurv_merchants`. Row drawer shows EMS metadata, link to CRM account if matched, "Pull statement" button, and a transactions panel.
4. **Transactions** — MID picker + date range → daily/monthly batch + deposit summaries with totals and an interchange breakdown.
5. **Disputes** — chargeback summaries + drill-down to chargeback details.
6. **Deals** — submission log from `kurv_deal_submissions` with status polling and document attach.

Shared UI follows the Dark Luxury Tech system already in place (Syne headers, Playfair italics, shimmer buttons, no transparency-breaking effects).

### 5. Announcement & navigation

- Add Kurv link to the Tools menu (alongside NMI Boarding).
- New `KurvBoardingBroadcast` popup (priority 6) registered with `BroadcastQueue` so it does not clash with existing popups.

### 6. Out of scope for v1 (call out for follow-up)

- True webhook receiver: EMS docs do not advertise outbound webhooks; we will poll deal status and run scheduled syncs. If/when EMS exposes webhooks, add `kurv-webhook` edge function.
- Commission reconciliation across NMI + Kurv into a unified residual view.

---

### Technical notes

- Token cache: row-level lock via `SELECT ... FOR UPDATE` inside the helper to avoid stampede on token refresh.
- All EMS responses stored verbatim in `raw jsonb` so we can re-derive fields without re-syncing.
- Idempotency keys on `kurv_deal_submissions` (`opportunity_id` + `deal_type` + hash of payload) to prevent duplicate submits.
- Rate limiting: simple in-function 1 req/sec backoff if EMS returns 429.
- Auth scheme confirmed from docs: `POST /token` with `{UserName, Password}` → JWT in `Authorization: Bearer <jwt>` on subsequent calls. Tokens are short-lived; refresh on expiry.

I will request `KURV_API_PASSWORD` (and confirm the username) via the secure secrets prompt once you approve this plan, before writing the edge functions.
