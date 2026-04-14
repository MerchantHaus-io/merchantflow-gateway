

## Add Merchant Activation UI to Opportunity Detail

### Problem
The `activate-portal-merchant` edge function is deployed but has zero frontend callers. After NMI boarding succeeds, there's no way for an operator to push the NMI credentials back to the portal and activate the merchant.

### Solution
Add an "Activate on Portal" action to the Opportunity Detail modal's icon rail. It appears only when:
- The opportunity has a `portal_merchant_id` (came from the portal)
- The opportunity is in `live` stage OR has an NMI boarding submission with a `gateway_id`
- The merchant hasn't already been activated (guard against double-activation)

### Changes

#### 1. `src/components/OpportunityDetailModal.tsx`
- Add an "Activate Portal Merchant" button to the icon rail (next to the existing "View Portal Account" button)
- Only visible to admins, only for portal-linked opportunities
- On click, opens a confirmation dialog that:
  - Auto-fills `portal_merchant_id` from the opportunity
  - Auto-fills `nmi_gateway_id` from `nmi_boarding_submissions` (lookup by `opportunity_id`)
  - Asks operator to confirm/enter: `nmi_api_key`, `nmi_public_key`, `pricing_model` (dropdown: interchange_plus / flat_rate)
  - Shows a summary before submitting
- Calls `activate-portal-merchant` edge function
- On success: shows toast, logs activity, refreshes opportunity

#### 2. `src/pages/OpportunityDetail.tsx`
- Mirror the same activation button for the full-page detail view

#### 3. Auto-fill from NMI Boarding
- Query `nmi_boarding_submissions` for the opportunity to pre-populate the gateway ID and merchant credentials
- If NMI boarding was successful, most fields are already known — operator just confirms and clicks "Activate"

### Files Modified
- `src/components/OpportunityDetailModal.tsx` — Add activation dialog + button
- `src/pages/OpportunityDetail.tsx` — Same activation action on full-page view

### Result
After NMI boarding, the operator clicks "Activate on Portal" → confirms NMI credentials → portal merchant goes live instantly, triggering the portal's Realtime update so the merchant sees their dashboard switch from pending to active.

