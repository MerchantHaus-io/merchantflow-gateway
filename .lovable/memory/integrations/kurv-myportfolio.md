---
name: Kurv MyPortfolio integration
description: EMS Corporate (Kurv MyPortfolio) boarding, roster sync, and transaction reporting at /tools/kurv
type: feature
---
Kurv = EMS Corporate MyPortfolio API. Lives at `/tools/kurv` (separate from NMI tooling).

Auth: `POST /api/v1/Token` with `{UserName, Password}` -> JWT (PascalCase: `Token`, `ExpirationDateTime`). Token cached in `kurv_api_tokens` by environment; 60s expiry skew. Helper: `supabase/functions/_shared/kurv.ts` (`kurvFetch`, `getKurvToken`, `kurvBaseUrl`, `kurvJson`, `kurvCors`).

Env switch via `KURV_API_ENV` secret: `sandbox` -> `apitest.emscorporate.com`; `production` -> `api.emscorporate.com`. Secrets: `KURV_API_USERNAME`, `KURV_API_PASSWORD`, `KURV_API_ENV`.

Tables (RLS read by authenticated, writes service-role only):
- `kurv_api_tokens` (service-role only, no read policy)
- `kurv_merchants` (roster cache, unique `mid`, raw jsonb)
- `kurv_deal_submissions` (signed|unsigned, idempotency_key unique, payload+response jsonb)
- `kurv_transactions_daily` (unique mid+business_date)
- `kurv_sync_logs`

Edge functions (all `verify_jwt = false`, validate via `_shared/require-auth.ts`):
- `kurv-list-merchants` (POST /api/v1/Merchants, upserts roster)
- `kurv-board-deal` (SubmitSignedDealV2 or SubmitUnsignedDeal, records to `kurv_deal_submissions`)
- `kurv-deal-status` (GET /api/v1/Deal/GetDealStatus, updates row by deal_id)
- `kurv-transactions` (DailyMerchantBatchSummary + DailyMerchantDepositSummary, caches daily)
- `kurv-lookups` (MCCs, owner titles, ownership types, sales people, etc.)

v1 wizard is raw JSON editor — guided wizard is the planned follow-up. No EMS webhook receiver yet (docs do not advertise outbound webhooks; we poll deal status). Cron sync not yet scheduled.
