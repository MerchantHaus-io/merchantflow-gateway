---
name: Close & archive account flow
description: Live & Billing close-account dialog with mandatory note, archives opportunities, optionally deactivates NMI gateway via v3 Affiliate API
type: feature
---
**Trigger:** "Close Account" buttons on Live & Billing list (desktop icon + mobile card) and on `LiveAccountDetail` ("Close & Archive" button — replaces the old silent Archive).

**Dialog (`src/components/live-billing/CloseAccountDialog.tsx`):**
- Required closure note (min 5 chars, textarea).
- "Also deactivate NMI gateway" checkbox — only shown when `account.nmi_merchant_id` exists; defaults on.

**On confirm:**
1. Sets every opportunity for the account to `status='archived'`, stamps `outcome_notes`, `outcome_closed_at`, `outcome_closed_by`.
2. Inserts an `activities` row of type `archived` per opportunity with the note.
3. Inserts a `client_interactions` note (`status=closed`, `outcome=archived`) at account level.
4. If checkbox on, invokes `nmi-close-gateway` edge function (PUT `/api/v3/affiliate/gateways/{id}` with `{status:'deactivated', note}`). Failure is non-fatal — toast warns but archive still proceeds.

**Edge function:** `supabase/functions/nmi-close-gateway/index.ts` — requireAuth-gated, uses `NMI_API_KEY`, hits `https://merchanthausio.transactiongateway.com/api/v3/affiliate/gateways/{gateway_id}`. Registered in `config.toml` with `verify_jwt = false` (auth handled in code).
