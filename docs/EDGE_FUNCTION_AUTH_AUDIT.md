# Edge function auth audit

Audit of `verify_jwt` across all 50 configured edge functions, plus the
authorization gaps behind it. Companion to Pass 2 of the Ops Terminal audit
(item #41).

Date: 2026-08-07 (updated: remediation applied)

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

## Current state

**42 functions `verify_jwt = true`, 8 `false`.** The 8 are the 5 genuinely
public intake endpoints and the 3 third-party webhooks — everything that must
accept a caller with no session.

All 14 previously-unprotected functions now call `requireRole`, so they no
longer depend on `verify_jwt` for protection. The remaining 8 are covered by
per-IP rate limiting (intake) or signature verification (webhooks).

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

> **Now rate-limited** per IP via `_shared/rate-limit.ts`, backed by the
> `rate_limit_events` table (migration `20260807190000`):
> 3 requests / 10 min for the three intake forms and the contact form,
> 10 / 10 min for `accept-quote`.
>
> The limiter **fails open** — a limiter that blocks real merchant
> applications when the database hiccups is worse than the abuse it prevents.
> `isHoneypotTripped()` is available but not yet wired into the forms.

### Third-party webhooks → stays `false` (3)

Authenticate by payload signature, not JWT.

`quo-webhook`, `resend-outreach-webhook`, `support-inbound-email`

> **Now verified**, via `_shared/webhook-verify.ts`:
> - `resend-outreach-webhook` — Svix signature (`RESEND_WEBHOOK_SECRET`),
>   including a 5-minute timestamp tolerance to reject replays
> - `quo-webhook` — shared secret (`QUO_WEBHOOK_SECRET`); Quo publishes no
>   documented signature scheme
> - `support-inbound-email` — already had `SUPPORT_INBOUND_SECRET`
>
> ⚠️ **Each enforces only once its secret is set**, matching the convention
> `support-inbound-email` already used. That makes rollout zero-downtime, but
> it also means **these endpoints stay open until you set the secrets**. Doing
> so is what activates the protection.

### Previously unprotected → now guarded with `requireRole` (14)

**Resolved.** Each was world-callable with no check whatsoever. Each now calls
`requireRole` and has moved to `verify_jwt = true`.

Callers were checked individually first: 12 are invoked from the browser via
`supabase.functions.invoke`, which attaches the signed-in user's JWT, so the
check passes for legitimate use. `encrypt-secrets` had no interactive caller —
it is invoked server-to-server by `submit-merchant-application`, which was
passing the **anon key**; that caller now sends the service-role key, which
`requireRole` accepts. `send-application-declined` has no caller at all and
appears to be dead code; it is guarded regardless.

Roles applied: `["staff","admin"]` for the twelve operational functions,
`["finance","admin"]` for `nmi-partner-residuals` (partner residual data, same
gate as `commission_records`), and `["admin"]` for `encrypt-secrets`.

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

- **#42 — `requireAuth` proves authentication, not authorization.** Resolved
  for the 14 functions above, which now use `requireRole`. The other functions
  still calling bare `requireAuth` should migrate too.
- **#45 — the staff email allowlist ships in the browser bundle.** Anyone can
  read the roster out of the JS. Moving it server-side is a larger change.
- **#50 — CORS.** `_shared/cors.ts` (added this pass) provides an
  origin-allowlisted alternative to the hardcoded `*`; 63 functions still need
  migrating to it.
- **#56 — no error telemetry.** `ErrorBoundary` still only calls
  `console.error`; production crashes remain invisible.
- **Retention sweep for `rate_limit_events` is not scheduled.** The migration
  ships `prune_rate_limit_events()` but nothing calls it — the table grows
  unbounded until it is scheduled (pg_cron snippet is in the migration).
- **Honeypot fields** are not yet rendered by the public forms.
