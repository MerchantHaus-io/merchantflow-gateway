# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The staff of a payments ISO, signed in to an authenticated internal tool. Four
working roles share the app and do not share a home screen:

- **Sales reps** — work the deal pipeline: prospect, scope, quote, get the
  merchant approved and boarded.
- **Account managers** — work the existing book: live accounts, billing,
  residuals, retention.
- **Support** — work the ticket queue, including requests that arrive from
  outside the company.
- **Admins** — the same surfaces plus deletion requests, web submissions and
  team-wide visibility. Admin is read from the `user_roles` table via RLS and
  fails closed; it is never inferred from an email address
  (`src/lib/adminRole.ts`).

Today the users are MerchantHaus's own team, and the codebase reflects that: a
named roster is hardcoded in `EMAIL_TO_USER` and `TEAM_MEMBERS`
(`src/types/opportunity.ts`). **The product is intended to be sold to other
ISOs later.** New work should not deepen the single-tenant assumption — no new
hardcoded rosters, no per-person branching where a role or a lookup would do.
Multi-tenancy itself is not built and is not being designed yet.

## Product Purpose

Run an ISO's entire merchant lifecycle in one tool, from first contact to
residual payout, instead of across a CRM, a processor portal, a spreadsheet and
an e-signature service.

One merchant's record travels the whole arc: prospect → statement analysis →
priced quote → signed Merchant Services Agreement → underwriting → processor
approval → gateway boarding → live account → billing → residuals and rep
commission → ongoing support. Success is that a rep never leaves the tool to
advance a deal, and an account manager can see what a live merchant is worth
without exporting anything.

## Positioning

Four mechanisms a general-purpose CRM cannot truthfully claim, all confirmed by
the operator:

1. **Boards merchants into NMI and Kurv/EMS directly.** The CRM is wired to the
   gateway and the processor, so boarding happens inside the tool rather than
   in a separate portal that a rep re-keys into.
2. **Turns a competitor's statement into a savings proposal.** Ingest the
   merchant's current processor statement, benchmark the fees, and generate the
   switch pitch (`src/lib/statementProposalPdf.ts`).
3. **Carries a quote through to a signed contract.** A priced quote becomes a
   Merchant Services Agreement with Exhibit A and a signature, in one flow, from
   one snapshot of the line items.
4. **Reconciles residuals into rep commissions.** Partner residuals land against
   the live book and split out to the reps who earned them.

A neighboring CRM can hold the contact record. It cannot board the merchant,
price the switch, issue the agreement, or pay the rep.

## Operating Context

- **Two pipelines, not one.** `ServiceType` is `processing` or `gateway_only`,
  and each has its own stage set (`ACTIVE_PIPELINE_STAGES`,
  `GATEWAY_ONLY_PIPELINE_STAGES`). A full processing deal runs ten stages:
  discovery, qualified, application prep, underwriting review, processor
  approval, gateway submitted, integration setup, testing, go-live ready,
  closed won.
- **Deals end five ways**, not two: closed won, closed lost, disqualified, no
  decision, underwriting declined. "Underwriting declined" is a distinct
  outcome from "lost" and reps rely on the difference.
- **Work arrives from outside the app.** Public `/merchant-apply` submissions
  land in `applications` and surface at `/admin/web-submissions`; public
  `/support-request` and `/scope` are links reps send to clients and prospects;
  the separate Client Portal fires lifecycle-milestone webhooks into this CRM.
- **Devices.** Primarily desktop and laptop. iPad in landscape is a real, known
  scene — the icon rail renders at 1024px and past navigation bugs were filed
  against tapping on it (`src/components/IconRailSidebar.tsx`). Phone layouts
  exist (`MobileBottomNav`, `MobileAppDock`).
- **Theming is a shipped feature.** Sixteen palettes are defined in
  `src/index.css` (Default, Ocean, Warm, Silver, Mono, Salesforce, Star,
  Midnight, DOOM, PS1, Forest, Charcoal…) across light and dark. Any new
  surface must hold up in all of them, not just the default.

## Capabilities and Constraints

- **Never expose partner cost or markup in merchant-facing output.** Quotes,
  the MSA/Exhibit A, invoices, line-item descriptions, disclaimers and email
  bodies show the merchant's resale price only. Cost and margin are internal
  fields; every merchant-facing PDF generator scrubs descriptions through
  `stripInternalCostRefs()` at render time. This is the project's hardest rule
  — see CLAUDE.md. (`src/lib/statementProposalPdf.ts` legitimately shows a
  markup figure: that is the *merchant's current processor's* markup, not
  MerchantHaus's.)
- **Two Supabase projects that share no data.** This CRM is
  `cuqjaddtmkotgvfsgcol`; the Client Portal (portal.merchanthaus.io) is
  `csusakykwlxixwiimrld`. Cross-project writes go through vault secrets.
- **No SSN is received or stored from the portal.** The team handles it
  manually as a document.
- **Row-level security is the access model**, and `verify_jwt` guards on edge
  functions are not removed without the owner's say-so.
- **Terminology is the industry's, not invented**: ISO, merchant, DBA, MID,
  gateway, boarding, underwriting, residuals, buy rate, interchange, chargeback,
  Exhibit A, statement.
- **Undecided:** multi-tenancy, per-tenant branding, and any pricing or
  packaging for selling this to other ISOs.

## Brand Commitments

- The product is **The Ops Terminal**, by **MerchantHaus**. Both names appear in
  the UI and in user-facing copy; neither is placeholder.
- Brand red is **#C8102E** per the company's guide. Note that the app's
  `--primary` and `--badge-alert` tokens are deliberately *not* that value, and
  a past bug came from hardcoding a near-miss (`#c81030`) in four places. Use
  the tokens; do not reintroduce literals.
- The visual system is token-driven across all sixteen palettes. Chrome colors
  derive from each variant's own `--card` rather than being enumerated per
  theme.

## Evidence on Hand

Real material in the repository, usable without invention:

- `public/docs/crm-bot-prompt.md` — the portal-milestone intake spec, including
  the two-project separation and the no-SSN rule.
- `public/docs/nmi-api-reference.md` — gateway API reference.
- `public/docs/underwriting-bot-spec.md` — underwriting logic.
- `public/docs/MerchantHaus_Team_Organogram_v3.pdf` — the real team structure.
- Live schema and policies are reachable through the Lovable connector
  (project `d4e766df-1ab4-4f95-a16a-4c8c4222778a`); it bypasses RLS, so it
  answers "what is the policy" but never "what does a signed-in user see".

**Absences future work must not fabricate:** there are no customer
testimonials, no case studies, no published benchmarks, no pricing page, and no
public marketing claims in this repository. Do not invent merchant names,
volumes, savings percentages or approval rates for demonstration content —
label any illustrative figure as illustrative.

## Product Principles

1. **One merchant, one thread.** Every surface is a view onto the same merchant
   record moving through its lifecycle. A screen that makes a rep re-key
   something the tool already knows has failed.
2. **The merchant sees price; the team sees margin.** The internal/external
   boundary is a product rule, not a formatting preference, and it is enforced
   at render time rather than trusted to clean data.
3. **Role decides the home screen.** Reps, account managers and support open the
   app for different reasons. Do not design one dashboard and call it the
   default for all three.
4. **The book of business is not an afterthought.** Retention, residuals and
   support carry as much of the business as new deals; surfaces for the existing
   book get the same craft as the pipeline.
5. **Build for the second ISO.** The tool is single-tenant today. Prefer roles,
   lookups and configuration over anything that hardcodes this company's people
   or process.

## Accessibility & Inclusion

No formal standard (WCAG level, VPAT) has been committed to. Two
product-specific needs are established by the operating context and should be
treated as requirements until the owner says otherwise:

- **Touch as a first-class input on tablet**, because iPad-in-landscape is a
  real usage scene and hover-only affordances have already shipped bugs there.
- **Contrast that survives all sixteen palettes.** A control that is legible in
  the default dark theme and invisible in Ocean or PS1 is broken, not
  theme-specific.
