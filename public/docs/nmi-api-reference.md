# NMI Partner Portal — API Quick Reference

## Two API Layers

### Layer 1: Boarding API (v3)
- **Base URL**: `https://merchanthausio.transactiongateway.com/api/v3/affiliate`
- **Auth**: `Authorization: {BOARDING_API_KEY}` (raw key, no Bearer)
- **Content-Type**: `application/json`

Key endpoints:
- `GET /gateways` — list all merchant accounts
- `GET /gateways/:id` — single merchant detail
- `POST /gateways` — create gateway (merchant boarding)
- `PUT|PATCH /gateways/:id` — update merchant
- `POST /gateways/:id/processors` — add processor (FACe Worldpay Core = `pfcvantv`)
- `POST /gateways/:id/services` — configure services
- `POST /gateways/:id/status` — set merchant status (active/closed/restricted/deleted)
- `POST /legal_entities/search` — find legal entity by EIN
- `POST /devices/search` — find POS device
- `POST /devices/deregister` — deregister device

### Layer 2: Transaction API (per-merchant key)
- **Base URL**: `https://merchanthausio.transactiongateway.com/api/transact.php`
- **Auth**: POST variable `security_key=[merchant.nmi_api_key]`
- Types: sale, auth, capture, void, refund, credit, validate
- Three-Step Redirect: `/api/v2/three-step` (PCI SAQ A compliant)
- Collect.js: `/token/Collect.js` (frontend tokenization)
- Query API: `/api/query.php` (transaction/vault/recurring reports)

### Partner v4 API (currently active)
- **Base URL**: `https://secure.nmi.com/api/v4`
- **Auth**: `Authorization: {NMI_API_KEY}` (raw key)
- `GET /merchants` — merchant roster
- `POST /transactions/reports` — partner-wide transaction data

## Webhook Events (POST to `/functions/v1/nmi-webhook`)
- `transaction.sale.success|failure` — sale results
- `transaction.auth|void|capture|refund|credit.*` — other transaction events
- `chargeback.batch.complete` — chargeback batch
- `settlement.batch.complete|failure` — settlement results
- `recurring.subscription.charge.success|failure` — recurring charges
- `acu.summary.automaticallyupdated` — card updater results

## Processor Platforms
- `pfcvantv` = FACe - Worldpay Core (primary)
- `pfvantnd` = FACe - Vantiv Next Day Funding
- `pfvantck` = FACe - Vantiv ACH
- `fdms` = First Data Nashville
- `tsys` = TSYS EMV
- `nmipays1` = NMI Payments

## Merchant Statuses
- `active` — normal processing
- `restricted` — can log in, cannot process
- `closed` — cannot log in, partner retains reporting
- `deleted` — removed from reports (IRREVERSIBLE)

## Test Cards
- Visa: 4111111111111111, Exp: 1025
- MC: 5431111111111111, Amex: 341111111111111
- CVV match: 999, AVS match: address1=888 + zip=77777

## Edge Functions Built
- `nmi-commissions` — syncs merchant roster + transaction data for commission tracking
- `nmi-list-merchants` — v4 merchant roster (falls back from v3 → v4)
- `nmi-webhook` — receives all webhook events, routes to notifications + chat
- `nmi-transactions` — v4 partner transaction reports
- `nmi-board-merchant` — merchant boarding via v3 API
