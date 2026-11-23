
## Selected security fixes (Nov 23 2026)
- [x] Restricted only the three selected billing-counter and file-read policies; five live regression checks pass, including real signed downloads for shared chat and merchant files plus anonymous helper denial. Finding statuses updated after verification.
- [x] Follow-up source sweep: reviewed chat/notices, document previews/downloads/uploads, boarding/application conversion, billing archives/number allocation, AI document tools, Gmail attachment sync, backups and retention jobs; preview dependency mismatch repaired without changing permissions or settled records.
- [ ] Additional access work requires user approval under the three-finding scope: billing archive path coverage, long-lived existing attachment links, privileged AI/statement/classification reads, numbering permission checks and organisation scoping in integration/maintenance jobs. These paths were read, not run or changed.

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
- [x] Phase 2f: user_roles stamped MerchantHaus; organisation-aware SQL checks and restrictive policies applied (Nov 7).
- [ ] Remaining: billing_doc_sequences PK change and uniqueness changes (ADR-007), including retiring legacy user_roles uniqueness after consumer rollout.
- [x] Phase 3 first pass (11 Sep 2026): `tenant_visible(uuid)` helper; all 211 policies on tenant-stamped tables now AND a tenant term (reads and writes). Platform admins bypass. Anon intake still works via `default_tenant_id()` fallback.
- [ ] Phase 4: harden service-role functions; current audit counts 76 privileged entrypoints, including shared-helper-only usage (RLS does not apply to privileged clients).

- [x] Phase 5/8 first slice: `provision-tenant` worker + `/admin/tenants` console (create, step-by-step run, setup wizard, Ready/Active/Suspend, retry). Verified end to end on a throwaway tenant, since removed.

## Monitoring fixes (Nov 7 2026)
- [x] Restore pricing category normalization; deployed worker and tested all six category inputs. Full production wizard run not performed.
- [x] Correct Home's pending application count; signed-in Home shows 95 deals with no failing application requests.
- [ ] Restore Google email/calendar sync — blocked until the Google project owner enables Gmail and Calendar APIs.

## Tenant split (Nov 7 2026)
- [x] Database only: all 22 existing roles tagged MerchantHaus; scoped helpers and restrictive role policies applied. Read-only integration checks pass.
- [x] Audit: 80 current entrypoints, 76 privileged directly/transitively; complete evidence and fix batches in docs/tenancy/07-service-role-audit.md.
- [ ] Separate app/function phase: update direct role consumers and bypass paths; intentionally deferred to a separate session under the agreed split.

## Lead outreach upgrade (Nov 23 2026)
- [x] TAMI storage foundation: separate address/state, phone groups, links and business/source context added without changing existing access rules. No leads imported.
- [x] TAMI CSV mapping: separate app/function update implements grouped mapping, expanded paginated contact preview, cleaned phone lists, HTTPS domains, Windows timezone conversion and whitelisted persistence; 26 tests pass, sample validates 13/14 leads and authenticated disposable enrollment saves all field groups with 12 pending touches. Test records removed; no original leads imported or contacted.
- [ ] TAMI desktop/mobile upload and queue-readback walkthrough: blocked by browser file-upload timeout after three attempts and campaign-heading timeout during separate readback; no full UI verification claimed. Automatic preview build OK; lint 0 errors / 323 inherited warnings; Deno check passed with automatic package resolution.
- [x] Execution workspace: manual enrolment, CSV column mapping/preview/duplicate report, Mine/Team queue, ordered touch history and editable drafts. Signed-in walkthrough enrolled three disposable contacts, completed touch 1, saved email preview; all test records removed. Mobile queue has no page overflow.
- [x] AI: server-scoped streamed Responses research and twelve drafts, provider-cited company sources, cancellation and edit preservation. Live company test reached ready with five sources, ten new drafts plus two preserved edits; no contact delivery.
- [ ] Email delivery and automatic reply wiring: per-assignee Gmail identity/thread/send claims implemented; live reply check is blocked by expired Google connection. Assignee must reconnect; no email was sent. Automatic reply webhook/sync wiring remains pending; manual checks and pre-send thread checks exist.
- [ ] Reply-stop and warm handoff UI end-to-end verification: blocked by overlapping buttons in contact drawer after three attempts; stopped per Gauntlet rule. Database stop behavior remains covered by previous live checks. Pause/resume was verified; handoff notification was not exercised.
- [ ] Quo call delivery: launch control uses installed Quo/TEL handling on desktop, documented Quo deep link on mobile; external calling application unavailable in sandbox, so no actual call verified.
- Verification: preview build OK; lint 0 errors / 323 warnings; 15 outreach policy/import tests and 12 cost-redaction tests passed; both Deno functions check successfully. No manual app build/typecheck run because platform runs these automatically.
- [x] Data-only phase: PDF-based 12-touch template, working-day scheduling, contact assignments, touch outcomes, research/draft storage, reply-stop and next-step notifications. Verified 17 live checks and duplicate-safe assigned-person reminder delivery; throwaway records removed; app build OK and lint 0 errors.
- [ ] Separate app/function session (required by migration/client separation): team execution queue, CSV preview/import/enrolment, Quo call routing, assigned-person email preview/send and threading, reply webhook wiring and warm handoff to Darryn.
- [x] Separate app/function session: tenant-scoped AI research with cited evidence and editable per-contact messages verified signed in without unsolicited outreach; complete outbound flow remains blocked as listed above.
