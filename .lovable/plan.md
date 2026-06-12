## Goal
On the Live & Billing report, any row missing an MID should expose a one-click **Link Gateway** action that searches our NMI roster and writes the chosen gateway to `accounts.nmi_merchant_id` (and `opportunities.portal_merchant_id` when a portal merchant match exists).

## UX

**Desktop table** (`src/pages/LiveBilling.tsx`)
- In the Merchant ID column, when `account.nmi_merchant_id` is null, replace the `—` placeholder with a subtle **Link Gateway** button (link icon + label, ghost style, amber accent to match the row).
- Existing rows with an MID stay unchanged.

**Mobile card**
- Same swap: when no MID, render a thin "Link Gateway" button in the header slot instead of the muted MID text.

**Dialog** (new `src/components/live-billing/LinkGatewayDialog.tsx`)
- Title: "Link NMI Gateway to {Account Name}"
- Auto-loads merchants via `supabase.functions.invoke('nmi-list-merchants')` on open.
- Debounced search input filters across `company_name`, `dba_name`, `merchant_id`, `contact_email`.
- Auto-prefills the search with the account name on open to surface the likely match.
- Scrollable result list: each row shows DBA / company, MID (mono), status badge, contact email.
- Selecting a row enables the **Link** button.
- Optional secondary checkbox: "Also link portal merchant if a match is found by email/DBA" (default on).
- Confirm writes:
  1. `UPDATE accounts SET nmi_merchant_id = '<gateway_id>' WHERE id = <account_id>`
  2. If portal match found, `UPDATE opportunities SET portal_merchant_id = <portal_id> WHERE account_id = <account_id> AND portal_merchant_id IS NULL`
- Toast on success, invalidate `live-billing-opportunities` query, close dialog.

## Technical

**Frontend**
- New component `src/components/live-billing/LinkGatewayDialog.tsx` (shadcn Dialog + Input + Command-style list).
- `LiveBilling.tsx`: render `<LinkGatewayDialog>` controlled by `linkTarget` state `{ accountId, accountName } | null`. Stop click propagation on the trigger so the row click-through doesn't fire.
- Uses existing `nmi-list-merchants` edge function — no change required there.

**Portal match (optional)**
- New small edge function `portal-find-merchant-by-gateway` that takes `{ gateway_id, dba?, email? }` and queries the portal `merchants` table for a row whose `nmi_gateway_id` matches or whose `email`/`dba_name` matches. Returns `{ portal_merchant_id }` or null.
  - Alternatively, reuse the just-built `gateway-accounts` function to fetch the full portal list once on dialog open and match client-side. Lower complexity — preferred. We'll match by `nmi_gateway_id` first, then fall back to email/DBA.

**Permissions**
- Action restricted to admins (`useUserRole().isAdmin`). Non-admins don't see the button.
- Writes go through the standard authenticated Supabase client; `accounts` RLS already allows authenticated updates for the team.

## Files
```
src/pages/LiveBilling.tsx                         (edit — add trigger + state)
src/components/live-billing/LinkGatewayDialog.tsx (new)
```
No DB migrations, no new secrets, no edge-function changes.

## Out of scope
- Bulk linking. (One-by-one only for now.)
- Auto-detection on outcome write. (Separate follow-up if you want it.)
- Editing an existing MID. (Future: same dialog reused with an "Unlink/Replace" action.)
