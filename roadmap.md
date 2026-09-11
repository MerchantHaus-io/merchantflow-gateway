
## Affiliate programme (Sep 4 2026)
- [x] Self-serve affiliate sign-up (pending admin approval)
- [x] Referral credit ledger (commission, bonus, clawback, adjustments)
- [x] Payout schedule: monthly, payable 30 days after month end, $50 minimum, ACH
- [x] Admin live dashboard of each partner's balance on Affiliates page
- [x] Partner-facing portal view of own referrals + payouts/balance

## Tenancy (Sep 9 2026)
- [x] Phase 1 foundation (tenants, memberships, helpers)
- [x] Phase 2a anchors stamped: accounts, opportunities, merchants, applications
- [x] Phase 2b children stamped: contacts, principals, beneficial_owners, bank_accounts, merchant_consents, application_documents/secrets, documents, client_interactions, call_logs, calendar_events, validation/website reports, onboarding_wizard_states, nmi_boarding_submissions
- [x] Phase 2c-2e stamped (11 Sep 2026): activity/collab, messaging/comms, quoting/billing/commissions, integrations — 50 tables, tenant_id NOT NULL + FK + index + default + trigger, all rows on legacy MerchantHaus tenant
- [ ] Remaining stamping: `user_roles` (Phase 2f, ship alone), `billing_doc_sequences` PK change, the 10 uniqueness changes (ADR-007)
- [x] Phase 3 first pass (11 Sep 2026): `tenant_visible(uuid)` helper; all 211 policies on tenant-stamped tables now AND a tenant term (reads and writes). Platform admins bypass. Anon intake still works via `default_tenant_id()` fallback.
- [ ] Phase 4: tenant-scope the 60 service-role edge functions (RLS does not apply there)

- [x] Phase 5/8 first slice: `provision-tenant` worker + `/admin/tenants` console (create, step-by-step run, setup wizard, Ready/Active/Suspend, retry). Verified end to end on a throwaway tenant, since removed.
