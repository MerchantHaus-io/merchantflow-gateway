# Service-role organisation isolation audit

Date: 7 November 2026. Read-only source audit; not proof of exploitation or a live two-ISO penetration test.

## Scope and result

The earlier 62-function count is stale. There are **80 entrypoints: 76 directly or transitively use privileged clients; four do not**. Shared role checks and rate limiters count as transitive privileged use, but do not alone imply customer-data exposure.

The database phase stamped all **22 existing user_roles rows** MerchantHaus and made SQL role helpers membership/organisation-aware. Ordinary browser role queries now have a restrictive organisation boundary. **Service-role direct queries still bypass it**; this audit identifies follow-up work, not completed isolation.

Legend: **N** needs tenant/resource authorization; **P** intended platform/cron operation whose invocation/routing needs review; **S** no demonstrated cross-tenant read or a demonstrated trusted boundary. Line references are source-review anchors, not guarantees of deployed behavior. Paths below are `supabase/functions/<name>/index.ts`.

## Complete privileged inventory

| Function | Class | Evidence and required boundary |
|---|---|---|
| affiliate-signup | N | Global email lookup 67–69, Auth creation 77, referrer writes 99–126. Tenant-bound signup capability and verified record linking. |
| complete-password-change | S | Caller 47, same-user update 53. Retain self-only scope; separately verify actual password change. |
| create-referrer-user | P | Company-domain gate 27–37, global creation 41–84. Explicit platform permission or tenant invite authority. |
| create-team-user | P | Email gate 23–37, Auth creation 50, global role insert 73. Explicit platform admin; tenant invites separate. |
| delete-referrer | P | Legacy gate 39–54, arbitrary target 63–70, related deletion 82–130. Tenant target authorization; shared Auth deletion needs platform permission. |
| force-password-reset | P | User enumeration 56 and updates 76. Platform-only audited operation. |
| sign-out-all-users | P | Email gate 54–65, global enumeration 81 and revocation 108. Platform-only; verify SDK revocation semantics. |
| suspend-user | P | Email gate 17–29, arbitrary Auth ID 34–45. Platform privilege; avoid banning a multi-ISO user globally for one ISO. |
| impersonate-referrer | P | Domain gate 29–35, arbitrary referrer 38–49, login/session operations 60–109. Critical: explicit impersonation permission, target tenant and audit. |
| export-data | P | Global role gate 32–46, unrestricted table reads 55–82. Critical: platform export or separate tenant-qualified export. |
| provision-tenant | P | Explicit platform_admins check 487–503, tenant lifecycle operations 527–688. Demonstrated platform boundary; preserve it. |
| tenant-team | S | Owner/admin membership or platform check 47–80; target tenant checks 104–107,168–209. Add tenant predicates to final updates as defense in depth. |
| ai-assistant | N | Global context 167–195, auth without tenant 453–480, tools 956–1221 and 1699–2064. Critical: every tool/resource/storage path needs trusted caller scope. |
| analyze-statement | N | Caller storage path 153, download 168, removal 243. Authorize tenant-owned file first. |
| classify-document | N | Arbitrary document 27–42, storage 63, update 172–174. Authorize root document and object. |
| extract-lead | S | Role gate 87, supplied input 91, AI request 117. No existing customer-record read demonstrated; tenant-aware permission/usage budget. |
| polish-email | S | Authenticated supplied-content AI operation. No customer-record read demonstrated; usage limits. |
| generate-profile-avatars | N | Global profiles 32, upload 117, updates 135–137. Self/tenant batch or explicit platform regeneration. |
| encrypt-secrets | N | Arbitrary application 77, reads 122–147, write 171. Authorize application's organisation first. |
| activate-portal-merchant | P | Legacy gate 26, arbitrary merchant/credentials 38, portal writes 56–74. Explicit platform capability and trusted CRM-to-portal mapping. |
| gateway-accounts | N | Portal service key 25, global merchant listing 41–46. Tenant-to-portal mapping must filter results. |
| generate-portal-access | P | Email gate 39–40, merchant 44–63, login link 80. Critical: target authorization and audited impersonation. |
| generate-portal-doc-url | N | Staff/referrer boolean 35–36, arbitrary path 42, signing 62. Resolve path through authorized document/merchant. |
| shred-portal-documents | P | Email gate 26–35, arbitrary merchant 38, deletion 53–76. Explicit destructive permission and target mapping. |
| kurv-board-deal | N | Caller payload 12, global idempotency 34–36, submission 56. Authorize opportunity; tenant-key credentials/idempotency. |
| kurv-build-payload | N | Opportunity 25–35, account/owners/application/bank/document reads 40–80. Critical: root and related-record ownership before returning data. |
| kurv-deal-status | N | Caller deal 11, global cache update 22–24. Resolve through tenant-owned submission. |
| kurv-list-merchants | P | Provider-wide fetch, upsert 45, global logs 21–56. Trusted sync; tenant mapping and limited response. |
| kurv-lookups | S | Reference selector 24; privileged shared token cache. Allowlist reference data and protect tenant credentials. |
| kurv-transactions | N | Arbitrary MID/dates 11, cache writes 61. Authorize tenant MID before provider request. |
| kurv-validate-deal | S | Supplied payload 13, shared privileged token cache. No existing CRM read shown; scope credentials/usage. |
| nmi-board-merchant | N | Role check, supplied payload 59, submission and portal writes 205–244. Authorize linked account/submission/merchant. |
| nmi-close-gateway | N | Auth 18, arbitrary gateway 25, provider mutation 34. Critical: ownership and closure permission. |
| nmi-commissions | N | Cache 64–81, global won deals 118–120, quotes 220–223, delete/rebuild 307–329. Critical: tenant finance permission and scoped replacement writes. |
| nmi-list-merchants | N | Auth 16, shared provider-key requests 50,93. Tenant credentials or permitted merchant mapping. |
| nmi-partner-residuals | P | Role/invoker gates 52,69; global MID matching 113–115, upsert 121. Platform finance worker or tenant credentials. Check incompatible cron/role gates. |
| nmi-webhook | P | No handler signature check; input 23, activities 175, all-profile notifications 189–194. Mandatory provider verification and tenant mapping. |
| quo-proxy | N | Shared legacy role gate 17, caller claims 37, shared provider key 45, arbitrary call/message/contact IDs 61–167. Tenant-owned provider account and resource/phone authorization before reads/sends/deletes. |
| backup-flush-changes | P | requireInvoker 91–92 accepts ordinary users; global queue/run 102–179. Restrict to scheduler/service/platform backup permission. |
| backup-snapshot-to-drive | P | Ordinary-user invoker 86–87, sensitive table list 16–27, global reads 106. Critical: trusted backup invoker; destination not shown caller-controlled. |
| calendar-reminders | P | No handler auth, profiles 27, events 39–98, notifications 48–129. Cron-only and event-tenant recipients. |
| gmail-poll-support | P | No handler gate 86, global ticket/dedup 157–196, writes 200–235. Trusted mailbox worker; explicit mailbox tenant. |
| google-calendar-callback | N | Untrusted state 7, state-derived identity 70–82, token upsert 86–87. Critical: one-use server-stored state bound to caller/tenant. |
| google-calendar-sync | P | No handler gate, optional caller email/global tokens 84–91, event writes/deletes 206–227. Split trusted global scheduler from JWT self-sync. |
| google-gmail-sync | P | No handler gate, optional email 171–178, global matching 191–201, attachment/email writes 412–452. Critical: self-only or trusted worker with tenant matching. |
| inactive-user-reminder | P | No handler auth; Auth users 78, notifications/profiles 106–138. Trusted platform/tenant audience. |
| process-scheduled-campaigns | P | No handler auth; campaigns 23–28, steps 41–43, send invocation 48–85. Cron-only tenant campaign execution. |
| purge-sensitive-dead-docs | P | Ordinary-user invoker 19, live flag 26–27, global reads 36–60, deletions 85–96. Critical: explicit destructive maintenance permission. |
| purge-stale-documents | P | Ordinary-user invoker 33–35, live flag 40–42, global reads/deletes 55–116. Critical: dry-run default is not authorization. |
| quo-sync-calls | P | No handler gate; global matching 47–56, caller options 99, logs 153. Trusted provider sync and tenant phone mapping. |
| sanitize-existing-tickets | P | Optional secret gate 26–30; global reads 39–41, writes 58–60. Fail closed; bounded platform maintenance. |
| sla-escalation | P | No handler gate; global deals 37–40, writes 65–67, profiles/notifications 74–91. Cron-only, tenant recipients. |
| get-sent-email | S | Role gate 59, caller-JWT client 70–73, RLS activity 77–79. Good root authorization pattern; verify provider ID association. |
| send-account-closed | N | Caller recipient/name 143, global name match/activity 233–237. Authorized account ID and derived recipient. |
| send-application-declined | N | Caller fields 189, global account/opportunity 291–295. Authorize application/root and recipient. |
| send-billing-doc | S | Role gate 71, supplied body 75, provider send 87. No stored customer read demonstrated; verify document/recipient provenance. |
| send-contact-form-email | S | Public rate-limited form 143, delivery 164–185. Privileged rate limiter alone is not a tenant-data leak. |
| send-lead-outreach | N | Caller opportunity 79–81; copied tenant in log 94–96 but no membership comparison. Authorize before send. |
| send-notice-email | S | Supplied audience 69, send 101. No stored customer read shown; authorize tenant recipients. |
| send-notification-email | N | Arbitrary recipient/data 190, global account-name matching 261–265. Tenant-authorized event/recipient. |
| send-outcome-email | N | Arbitrary opportunity 112; related reads 127–162, updates/logs 166–255. Authorize root before send. |
| send-outreach-emails | N | Caller campaign 28–36, steps/contacts 48–70, writes 84–146. Tenant campaign permission; distinct scheduler mode. |
| send-push-notification | N | Caller user IDs 123, profile/subscription reads 131–150, deletion 197–199. Authorize event and tenant recipients. |
| send-qualified-docs-request | N | Caller opportunity/email 166, log and related reads 232–242. Authorize root and recipient. |
| send-quote-email | S | Role gate 83, supplied body 87. No stored customer read shown; verify quote provenance and recipient. |
| send-terminal-update-email | N | Global update reads 105–114, profiles 129. Tenant audience or explicit platform broadcast privilege. |
| send-ticket-reply | N | Arbitrary ticket 33, privileged read 44–48, update 96–98. Authorize ticket before mailbox read/send. |
| send-ticket-status-email | N | Caller ticket/status 58, reads 70–74, writes 121–135. Root authorization and permitted status transition. |
| accept-quote | S | Token-bound reads 101–105,161–165, acceptance/update 228–246. Capability boundary demonstrated; verify expiry/replay/child tenant stamping. |
| submit-merchant-application | N | Application/merchant/owner/bank inserts 533–752; uploads 459–472. Tenant-bound public capability and consistent child/storage stamping; inserts alone not evidence of data disclosure. |
| submit-scoping-request | N | Public arbitrary opportunity 162–164, global matches 182–226, writes 242–296, global notifications 321–343. Capability-bound root and tenant matching. |
| submit-support-ticket | N | Public body 45, insertion 67, shared global email matching. Verified tenant support capability; email is not authority. |
| support-inbound-email | P | Optional secret 116–119, ticket-number match 143–145, comments/reopen 149–188. Mandatory verification and mailbox/thread tenant binding. |
| receive-portal-milestone | P | Shared secret 13–15, merchant-ID operations 50–175, global email matches 292–328. Unique trusted portal mapping and tenant-local linking. |
| quo-webhook | P | Conditional verifier 275–280, global phones 21–34, profiles 62, writes 111–244. Fail closed and map provider account to tenant. |
| resend-outreach-webhook | P | Optional-config verifier, campaign/contact writes 81–99. Mandatory signature/replay protection and tenant-bound event target. |

## Four non-privileged entrypoints

| Function | Related concern |
|---|---|
| google-calendar-auth-url | Caller email/user ID 14 encoded in state 22–23; feeds privileged callback. Must bind to authenticated server-side state. |
| mcp | Caller bearer/publishable client 57–58; RLS-dependent, not service-role. |
| nmi-transactions | Caller-authorized client 26–39. Separately audit shared external-provider credential scope. |
| send-agenda-notification | Supplied email/provider delivery 16–65; no privileged DB read. Mail abuse checks separate. |

## Shared choke points

- `_shared/require-auth.ts:31–76`: authentication discards resolved identity; handlers cannot scope from its return value.
- `_shared/require-auth.ts:91–142`: service-role lookup of user_roles by user only. **The SQL migration does not constrain this bypass path.** Update in the separate app/function phase.
- `_shared/require-invoker.ts:24–97`: accepts cron tokens, service credentials or any valid user. Global backup/purge users need narrower permission.
- `_shared/kurv.ts:34–39`: privileged shared provider-token cache; tenant-key credentials where provider accounts differ.
- `_shared/support-intake.ts:217–234`: global email match with limit(1); email neither uniquely identifies tenant nor proves sender ownership.
- `_shared/webhook-verify.ts:1–14,54–65`: missing-secret acceptance. Live secret presence/deployment behavior unverified.
- `_shared/rate-limit.ts:60–86`: privileged anti-abuse store; not itself a merchant-data exposure.

Cron evidence: backup scheduling in `20260623151837_1967008d-bdda-4e68-b766-9a552303a999.sql:139–165`; scheduled invocation in `20260713000627_64f6b326-4b35-4275-bc71-ab88dc5219ed.sql:45`. Scheduling does not restrict public invocation. Gateway JWT guards must remain intact. Effective deployed cron settings/secrets/grants have not been checked.

## Prioritised follow-up batches

1. **P0, 8 files:** invoker helper, both backups, both purges, sanitizer, NMI webhook, webhook verifier. Close ordinary-user maintenance paths and fail-open verification.
2. **P0, 10 files:** auth helper, AI assistant, statement analysis, classifier, gateway accounts, portal signing, avatars, push, outreach sender, secrets. Trusted caller context and root ownership.
3. **P0, 6 files:** Google auth URL/callback/calendar sync/Gmail sync/support polling/reminders. OAuth state and trusted worker versus self-sync.
4. **P1, 15 files:** shared Kurv helper, seven Kurv handlers, NMI boarding/closure/commissions/list/residuals, Quo proxy/sync. Provider tenant mapping and scoped caches.
5. **P1, 15 files:** closure/decline/lead/notification/outcome/document-request/update/ticket-reply/ticket-status/billing/notice/quote senders; campaign scheduler, inactive reminders, SLA escalation. Tenant recipient and event authority.
6. **P1, 9 files:** support intake helper, affiliate signup, merchant/scoping/support intake, inbound support, portal milestone, Quo/Resend webhooks. Tenant-bound public capabilities and verified sender routing.
7. **P1, 11 files:** referrer/team creation, referrer deletion, reset/sign-out/suspension/impersonation/export, portal activation/access/shredding. Explicit platform privilege versus tenant admin.
8. **Separate database session:** deployed gateway/cron audit and hardening migration. Do not mix migrations with handler edits.

Tests added to each batch count toward the 15-file limit; split the 15-handler batches further to leave room for tests.

## Database phase limitations and validation

- Existing global `(user_id,role)` uniqueness retained temporarily so old ON CONFLICT consumers do not break. Tenant-scoped uniqueness added; full duplicate-role support across ISOs awaits consumer migration and removal of the old constraint.
- tenant_id remains nullable for additive rollout, but new insert trigger fails closed without explicit tenant/caller context/unambiguous target membership; authenticated policies deny null rows. Tighten NOT NULL separately after consumer rollout.
- Existing email-based management permissions are not broadened. is_admin_email additionally requires an active scoped admin role; platform_admins remains separate.
- Read-only live integration test: all current user's roles remain valid in MerchantHaus; wrong and null tenant checks return false. Existing 22 rows verified stamped. Signed-in Home continues to show 95 deals. This is **not a two-tenant RLS test**, and no second user's identity was assumed.
- `python3 scripts/check-tenant-roles.py` passes; lint: 0 errors, 323 inherited warnings; harness build OK. No app or handler source changed.

Acceptance for later isolation fixes: another ISO's IDs, emails, MIDs, storage paths, ticket numbers and campaigns must be rejected **before** privileged read, provider mutation, external send or write. Platform and cron exceptions require independently authenticated, explicit and auditable authority.