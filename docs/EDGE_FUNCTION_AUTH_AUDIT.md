# Edge function auth audit

Audit of `verify_jwt` across all 50 configured edge functions, plus the
authorization gaps behind it. Companion to Pass 2 of the Ops Terminal audit
(item #41).

Date: 2026-08-07

## The thing to understand first

`verify_jwt = true` is weaker than it sounds. It requires the caller to present
*a* JWT signed by the project secret — and **the publishable anon key is such a
JWT**, shipped in the browser bundle. So enabling it:

- **does** block unauthenticated callers: scanners, curl with no header, anyone
  who has not read your JS
- **does not** block anyone who copies the anon key out of the bundle, which is
  public by design

It is a useful outer layer, not an access control. Any function touching
privileged data still needs its own check — `requireAuth`, or better
`requireRole` (`supabase/functions/_shared/require-auth.ts`), which resolves
roles from `public.user_roles`.

## What changed in this pass

28 functions moved to `verify_jwt = true`. 22 remain `false`.

The 28 were chosen on evidence, not judgement: each either already performs its
own auth check (so its callers demonstrably send a token — they would fail the
function's own check otherwise), or is invoked by cron/service-role. Enabling
`verify_jwt` for these cannot break a caller that works today.

## Category breakdown

### Already self-checking → now `true` (21)

These call `requireAuth`, `auth.getUser()`, or check `ADMIN_EMAILS` internally.

`ai-assistant`, `analyze-statement`, `classify-document`, `export-data`,
`force-password-reset`, `generate-profile-avatars`, `kurv-board-deal`,
`kurv-build-payload`, `kurv-deal-status`, `kurv-list-merchants`,
`kurv-lookups`, `kurv-transactions`, `kurv-validate-deal`, `nmi-close-gateway`,
`nmi-list-merchants`, `nmi-transactions`, `polish-email`,
`send-notification-email`, `send-outreach-emails`, `send-push-notification`,
`sign-out-all-users`

### Cron / internal → now `true` (7)

Invoked on a schedule or by another function with the service-role key, which
satisfies `verify_jwt`.

`backup-flush-changes`, `backup-snapshot-to-drive`, `inactive-user-reminder`,
`process-scheduled-campaigns`, `quo-sync-calls`, `sanitize-existing-tickets`,
`sla-escalation`

> If any of these is triggered by an external scheduler that sends no
> Authorization header, it will start returning 401. Swap it to a shared-secret
> header check rather than reverting to `false`.

### Genuinely public → stays `false` (5)

Called by anonymous visitors before any session exists.

`accept-quote`, `send-contact-form-email`, `submit-merchant-application`,
`submit-scoping-request`, `submit-support-ticket`

> These are the endpoints that need rate limiting and a honeypot/turnstile —
> audit item #55, not addressed in this pass.

### Third-party webhooks → stays `false` (3)

Authenticate by payload signature, not JWT.

`quo-webhook`, `resend-outreach-webhook`, `support-inbound-email`

> **None of the three currently verifies a signature.** They are world-callable
> with forgeable payloads. This is a real gap and needs fixing per provider.

### No auth of any kind → still `false`, needs code changes (14)

**This is the important list.** Each is world-callable today with no check
whatsoever. They were left at `false` because flipping the flag alone doesn't
fix them (see the anon-key caveat above) and could break callers whose
invocation path is unverified — they need a `requireRole` call added and tested
individually.

| Function | Why it matters |
|---|---|
| `encrypt-secrets` | Secret-management surface |
| `nmi-partner-residuals` | **Partner cost / residual data.** See the cost-disclosure rule in `CLAUDE.md` |
| `nmi-board-merchant` | Boards a live merchant with the processor |
| `quo-proxy` | Generic proxy to a third-party API |
| `send-quote-email` | Sends merchant-facing quotes; abusable for spoofing |
| `send-billing-doc` | Sends invoices and receipts |
| `send-account-closed`, `send-application-declined`, `send-notice-email`, `send-outcome-email`, `send-qualified-docs-request`, `send-terminal-update-email`, `send-ticket-reply`, `send-ticket-status-email` | Send mail as MerchantHaus to arbitrary recipients |

Recommended remediation, per function:

```ts
import { requireRole } from "../_shared/require-auth.ts";
const denied = await requireRole(req, corsHeaders(req), ["staff", "admin"]);
if (denied) return denied;
```

`nmi-partner-residuals` and `encrypt-secrets` should require `["admin"]`.

## Role model

| Role | Grants | Seeded from |
|---|---|---|
| `admin` | Admin-only functions, via `is_admin()` | the three known admin addresses |
| `staff` | CRM: opportunities, accounts, contacts, documents, via `is_internal_staff()` | `%@merchanthaus.io` **plus** `EXTRA_ALLOWED_EMAILS` |
| `finance` | `commission_records` (partner cost + margin), via `is_merchanthaus_staff()` | `%@merchanthaus.io` **only** |

`finance` is deliberately narrower than `staff`. Approved addresses outside the
merchanthaus.io domain get CRM access but must not see cost or margin figures —
so the two gates stay separate rather than being collapsed into one.

Both seeds exclude anyone who is a referral partner, and each is followed by a
guard that aborts the migration if it matched nobody, rather than silently
locking everyone out of the tables it protects.

## Related gaps not closed in this pass

- **#42 — `requireAuth` proves authentication, not authorization.** With no
  `adminEmails` passed, any signed-in user passes, including an external
  referral partner. `requireRole` (added this pass) is the replacement; call
  sites still need migrating.
- **#45 — the staff email allowlist ships in the browser bundle.** Anyone can
  read the roster out of the JS. Moving it server-side is a larger change.
- **#50 — CORS.** `_shared/cors.ts` (added this pass) provides an
  origin-allowlisted alternative to the hardcoded `*`; 63 functions still need
  migrating to it.
- **#55 — no rate limiting** on the five public intake endpoints.
- **#56 — no error telemetry.**
