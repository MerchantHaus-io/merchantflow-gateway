# Multi-Tenancy — Architecture Decisions

Each record states the decision, the evidence behind it, what was rejected, and
how reversible it is. Evidence references point at `00-baseline-and-audit.md`.

---

## ADR-001 — The tenant is the ISO / agency

**Decision.** The canonical isolation boundary is the **payments ISO or agency**
that licenses the Ops Terminal. Internal identifier: `tenant_id`. Suggested UI
term: **Organization**.

**Context.** Three candidate boundaries exist in the codebase:

| Candidate | Evidence for | Why rejected |
|---|---|---|
| ISO / agency | The whole app is one ISO's back office; every hardcoded assumption (A1–A6) is "this company" | **Selected** |
| Referrer / partner | `referrer_owns()` isolation already exists, 4 rows, dedicated portal | Referrers share MerchantHaus's `accounts` table. Making them tenants means splitting or duplicating 111 accounts. It also demotes the actual product to a partner tool. |
| Merchant | `src/pages/portal/`, `activate-portal-merchant`, 56 rows | Inverts the product — the CRM's own staff view would become a platform-admin layer. Far larger behavioral change. |

Confirmed with the product owner during this session.

**Consequence.** Existing data belongs to exactly one legacy tenant
("MerchantHaus"). `referrers` and `merchants` stay **inside** a tenant and keep
their current semantics — this is what makes the conversion additive rather
than a rewrite.

**Reversibility.** Low. This choice propagates into every table. Changing it
later is a second full migration.

---

## ADR-002 — Storage model: shared database, shared schema, `tenant_id` column

**Decision.** Model A. One database, one schema, a `tenant_id` column on every
tenant-scoped table, isolation enforced by RLS.

**Alternatives.**

- *Schema per tenant* — 75 tables × N schemas. Every one of the 179 existing
  migrations would need a per-schema loop, and Supabase's PostgREST exposure is
  schema-bound. Rejected: operationally heavy, no isolation benefit that RLS
  does not already provide here.
- *Database per tenant* — strongest isolation, but the app is a single Supabase
  project with 80 edge functions binding one `SUPABASE_URL`. Rejected as
  disproportionate; revisit only for an enterprise tier.

**Reasoning.** RLS is already enabled on all 75 tables and 220 policies already
exist. Model A is the only option that reuses that investment instead of
discarding it.

**Risks.** A single missed policy is a cross-tenant leak. Mitigated by
ADR-003 (default-deny) and by the fact that isolation is testable from one
connection.

**Reversibility.** Moderate — Model A can be sharded into Model C later per
tenant, because `tenant_id` is already the partition key.

---

## ADR-003 — Isolation is enforced by RLS with default-deny, not by application filters

**Decision.** Every tenant-scoped table gets `tenant_id uuid not null` plus a
policy whose predicate includes `tenant_id = current_tenant_id()`. No table is
left on `USING (true)` or `USING (auth.uid() IS NOT NULL)`.

**Context.** 70 of the 220 existing policies are permissive in exactly that way
(A7, A8). They are safe today only because there is one tenant.

**Reasoning.** The security invariant in §58 of the brief — *no tenant-scoped
resource may be accessed solely because the requester knows its identifier* —
cannot be satisfied by application-layer filtering when 58 edge functions hold
a service-role key that bypasses the application layer entirely.

**Risk.** RLS does **not** apply to the service-role key. See ADR-006, which is
the other half of this decision and is not optional.

---

## ADR-004 — Tenant context resolves from membership, never from the request

**Decision.** One authoritative server-side resolution path:

```
auth.uid()  →  tenant_memberships (status = 'active')  →  tenant_id
```

exposed as a `STABLE SECURITY DEFINER` function `current_tenant_id()`, mirroring
the existing `current_referrer_id()` idiom already in this database.

A client **may** send a tenant selector (for users who belong to more than one
tenant), but it is treated as a *request to switch*, validated against
membership, and never trusted as the context itself.

**Rejected inputs.** Subdomain, `Host` header, or an `X-Tenant-Id` header as the
*source of truth*. Any of these may inform a preference; none may grant access.
This directly addresses Gauntlet 4 (tenant context forgery).

**Reasoning.** The codebase already proves this pattern works: `referrer_owns()`
resolves ownership from `auth.uid()` via `current_referrer_id()` and never from
a client-supplied referrer id.

---

## ADR-005 — Extend the existing helper functions rather than rewrite 220 policies

**Decision.** Introduce the tenant predicate inside the security-definer
helpers (`is_internal_staff()`, `is_admin_email()`, `has_role()`,
`referrer_owns()`, `referrer_owns_account()`), so the ~67 policies that delegate
to them inherit tenant scoping without being individually edited.

**Explicit limitation — this covers roughly a third of the surface.** A policy
written as `USING (true)` delegates to nothing and inherits nothing. The
remaining ~70 permissive policies (A7, A8) and the 50 `WITH CHECK`-only INSERT
policies must be rewritten individually. Anyone reading "chokepoint" as "one
change fixes everything" will ship a cross-tenant leak.

**Reasoning.** Reviewability. A reviewer can read seven function bodies and
reason about correctness; no one reliably reviews 220 rewritten policies.

**Risk.** `is_admin_email()` currently hardcodes two addresses and is used by 28
policies. It must become tenant-aware *and* stop being email-literal-based, or
those two people become de facto platform superusers in every tenant. Tracked
as finding **A2**, severity CRITICAL.

---

## ADR-006 — Edge functions must resolve tenant context explicitly; RLS will not save them

**Decision.** `requireAuth()` in `supabase/functions/_shared/require-auth.ts` is
refactored to **return the resolved principal and tenant context** instead of
`null`. Every handler that touches tenant data takes that context and scopes its
queries with it.

**Context — this is the most under-appreciated risk in the conversion.**

- 58 of 74 edge functions use `SUPABASE_SERVICE_ROLE_KEY`. The service role
  **bypasses RLS entirely.** ADR-003 protects the browser client path and does
  nothing for these.
- `requireAuth()` today returns `Response | null`: a `Response` on failure,
  `null` on success. On success it **discards the identity it just resolved**.
  The caller therefore has no principal to scope by, which is precisely why the
  service-role client is then used unscoped.
- 8 functions run with `verify_jwt = false` (`quo-webhook`,
  `submit-merchant-application`, `resend-outreach-webhook`,
  `send-contact-form-email`, `accept-quote`, `submit-support-ticket`,
  `support-inbound-email`, `submit-scoping-request`). These are unauthenticated
  public entry points and must derive tenant from a validated artifact — a
  signed webhook payload, or a capability token such as
  `quotes.acceptance_token` — never from a request field.

**Reasoning.** A tenant-aware database with tenant-blind service-role callers is
not a tenant-isolated system. This ADR is the difference between the two.

**Reversibility.** High — a signature change on one shared helper, applied
incrementally per function.

---

## ADR-007 — Uniqueness: scope per tenant only where the domain requires it

**Decision.** Classify every existing `UNIQUE` constraint deliberately. Do not
blanket-prefix with `tenant_id`.

**Must become `(tenant_id, …)`** — these are tenant-local business identifiers
that will collide the moment a second tenant exists:

| Constraint | Why |
|---|---|
| `quotes.quote_number` | each tenant numbers its own quotes from 1 |
| `billing_documents.doc_number` | same |
| `support_tickets.ticket_number` | same |
| `chat_channels.name` | "#general" exists in every tenant |
| `commission_periods (period_start, period_end)` | each tenant runs its own periods |
| `office_avatars (desk_x, desk_z)` | each tenant has its own floor plan |
| `referrers.email` | one partner may work with two ISOs |
| `kurv_api_tokens.environment` | per-tenant integration credentials (see ADR-008) |
| `user_roles (user_id, role)` | a user may be admin in A and member in B — **must become `(tenant_id, user_id, role)`** |

**Must stay globally unique** — these are foreign or public identifiers whose
namespace is not ours:

| Constraint | Why |
|---|---|
| `quotes.acceptance_token` | a public capability URL; collision = cross-tenant access |
| `calendar_events.google_event_id` | Google's namespace |
| `call_logs.quo_call_id`, `message_logs.quo_message_id` | Quo's namespace |
| `synced_emails.gmail_message_id` | Gmail's namespace |
| `kurv_merchants.mid` | processor's namespace |
| `referrers.auth_user_id` | one auth user ↔ one referrer profile |

**Risk if done wrong in either direction.** Over-scoping `acceptance_token`
creates a cross-tenant IDOR (two tenants could mint the same token).
Under-scoping `quote_number` makes a second tenant's first quote fail to insert.

---

## ADR-008 — Third-party credentials are tenant-owned by default

**Decision.** Integration credentials resolve tenant-first, with a platform-level
fallback only where the integration is genuinely shared.

**Context.** `kurv_api_tokens` is keyed by `environment` alone and has **zero
RLS policies** (the only such table in the database). `google_calendar_tokens`
is keyed by `user_email`. NMI/Kurv credentials are currently platform-wide
because there is one platform.

**Rule.** A tenant's configuration must never override or read a platform
secret, and never another tenant's. This is §29 of the brief and the reason
`kurv_api_tokens` having no policies is a CRITICAL finding rather than a
cosmetic one.

---

## ADR-009 — Provisioning is a single service with persisted state, not inline creation

**Decision.** Tenant creation is orchestrated by one provisioning service with a
persisted state machine and an idempotency key. See
`03-provisioning-and-onboarding.md`.

**Reasoning.** §59 of the brief: a tenant must never appear operational unless
every mandatory step succeeded. That is only enforceable if the state is
persisted and the terminal state is reached by an explicit readiness check —
not implied by "the insert returned".

---

## ADR-010 — Onboarding state lives server-side

**Decision.** Onboarding progress persists in a tenant-scoped table; the wizard
reads it as the source of truth. Step transitions are validated server-side.

**Context.** `onboarding_wizard_states` already exists (81 rows, unique on
`opportunity_id`) — but it is the **merchant** onboarding wizard, a different
concept. Tenant onboarding is a new, separate concern. Reusing that table would
conflate a merchant's boarding progress with an ISO's platform setup.

**Reasoning.** §21: the frontend may guide, the server owns truth. Client-side
step state fails Gauntlet 7 by construction.

---

## Assumptions recorded (neutral defaults, per §54)

These are business decisions not derivable from the repository. Each is
implemented in the least-committal way so the business can decide later.

| # | Question | Default taken | Why it is safe |
|---|---|---|---|
| AS-1 | Can a user belong to multiple tenants? | **Yes** — `tenant_memberships` is a join table | A join table can express one-tenant-per-user; a `users.tenant_id` column cannot express the reverse without a migration |
| AS-2 | Must email be globally unique? | **No** — unique per tenant | Supabase `auth.users.email` stays globally unique; identity is one account, membership is per tenant |
| AS-3 | Tenant deletion semantics | **Soft delete** → `DEPROVISIONED`, data retained | §47 warns against introducing irreversible deletion; retention policy is the business's to set |
| AS-4 | Billing / plan structure | Plan recorded as an opaque `plan` field, no enforcement | Records intent without locking in a pricing model |
| AS-5 | Custom domains per tenant | Not implemented; tenant slug reserved | `isTrustedAuthHost` (A5) already blocks arbitrary hosts — loosening it is a security decision, not a default |
| AS-6 | Data residency | Single region, unchanged | Out of scope for Model A |
