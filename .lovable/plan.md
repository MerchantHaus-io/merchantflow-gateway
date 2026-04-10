

# Pull Live Merchant Names & IDs from NMI API

## What This Does
Creates a new edge function that calls the NMI Partner v4 API to list all merchants under your partner account, returning their names and merchant IDs. Then displays the results directly or cross-references them with your Live & Billing accounts in the CRM.

## Approach

### 1. Create `nmi-list-merchants` Edge Function
- Call `GET https://secure.nmi.com/api/v4/merchants` with the existing `NMI_API_KEY`
- Paginate through all results (the API supports `offset` and `maxResults`)
- Return a clean list of: merchant ID, company/DBA name, status, gateway ID, and creation date

### 2. Run It Immediately
- Invoke the function right after deployment to pull the full merchant roster
- Display the results showing each merchant's name and ID

### 3. Optional: Cross-Reference with CRM
- Match NMI merchant names against the `accounts` table in your CRM
- Highlight which NMI merchants are already tracked in Live & Billing vs any that might be missing

## Technical Details
- Reuses the existing `NMI_API_KEY` secret (Partner-level key)
- The NMI v4 Merchants API (`/api/v4/merchants`) supports listing all sub-merchants under a partner account
- No database changes needed — this is a read-only API call
- Single new file: `supabase/functions/nmi-list-merchants/index.ts`

