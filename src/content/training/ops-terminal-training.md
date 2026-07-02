# MerchantHaus Ops Terminal — Basic Training Guide

A starter guide for new team members. Read this end-to-end once, then keep it open as a reference for your first week.

- **App URL:** [https://ops-terminal.merchant.haus](https://ops-terminal.merchant.haus/)
- **Marketing site:** [https://merchanthaus.io](https://merchanthaus.io)
- **Public application form:** [https://ops-terminal.lovable.app/merchant-apply](https://ops-terminal.lovable.app/merchant-apply)

---

## 1. What MerchantHaus Does (the 30-second version)

We help merchants get set up to accept card payments. Two products:

- **Processing** — full payment processing (acquirer + NMI gateway). Bigger deals, longer cycle.
- **Gateway-Only** — NMI gateway integration only. Faster and simpler.

Revenue = transaction fees + ongoing residuals on live merchant accounts.

The platform has **three surfaces**:

1. **Ops Terminal** — the internal CRM where the team manages every deal from first contact to ongoing billing. *This is what you'll use.*
2. **Support Triage** — the client-facing support desk, run from inside the Terminal.
3. **Affiliate Portal** — a separate external portal where referral partners submit leads and track their commissions.

---

## 2. Logging In

- Go to [ops-terminal.merchant.haus](https://ops-terminal.merchant.haus/).
- Sign in with Supabase email/password or **Google OAuth**.
- Access is **whitelisted** — only approved `@merchanthaus.io` addresses get in. Ping Darryn if you can't log in.

**Account types:**

- **Internal staff** — full access to the Ops Terminal. That's you.
- **Admin** (Jamie / Darryn) — internal access plus admin-only screens ([Administration](/admin/administration), [Affiliates](/admin/affiliates), [Team Roster](/admin/team-roster)).
- **Referrer** — external affiliate partner. Only sees the Affiliate Portal, not the Terminal.

**Ops / Support toggle:** the pill next to the logo in the header flips between the main Ops Terminal and the [Support Triage](/support) desk.

---

## 3. The Vocabulary (memorize these)

| Term | Meaning |
|---|---|
| **Account** | The merchant company record |
| **Contact** | A person at the merchant |
| **Opportunity** | A deal in the pipeline — tied to one Account |
| **Application** | An inbound submission (web form / merchant portal / referrer) — converts into an Opportunity |
| **Stage** | Position in the pipeline |
| **Pipeline** | *Processing* or *Gateway-Only* — different stage sets |
| **MID** | NMI Merchant ID, assigned at go-live |
| **SLA Status** | Green / Amber / Red indicator for time-in-stage |
| **Outcome** | Closed Won, Closed Lost, Disqualified, No Decision, Underwriting Declined |
| **Residual** | Our recurring margin on a live merchant's processing |
| **Ticket** | A client support request handled in Support Triage |
| **Quote** | A priced gateway proposal generated for a contact |
| **Pricing Tier** | Foundation / Growth / Scale / Enterprise — gateway plan levels |
| **Add-on** | Optional paid feature (vault, fraud tools, TXT2PAY, etc.) layered onto a tier |
| **Referrer / Affiliate** | An external partner who sends us leads for a commission |

---

## 4. The Navigation Map

The header mega-menu groups every screen. Current groups:

**Pipeline**

- [Pipeline Board (Kanban)](/pipeline)
- [All Opportunities](/opportunities)
- [Tasks](/tasks) · [My Tasks](/my-tasks)
- [Email Outreach](/outreach)
- [Web Submissions](/admin/web-submissions)

**CRM**

- [Leads](/leads) *(formerly "Accounts" — `/accounts` still works)*
- [Contacts](/contacts)
- [Documents](/documents)

**Merchants**

- [Live & Billing](/live-billing)
- [Transactions](/reports/transactions)
- [Commissions](/commissions)
- [Supported Processors](/supported-processors)

**Support**

- [Support Triage](/support)
- [Client Request Form](https://ops-terminal.merchant.haus/support-request) *(public — share with clients)*

**Reports**

- [Analytics](/reports)
- [System Status](https://statusgator.com/services/nmi) *(live NMI status)*

**Tools**

- [Board Merchant (NMI)](/tools/nmi-boarding)
- [Pre-Qualification Wizard](/tools/preboarding-wizard)
- [Revenue Calculator](/tools/revenue-calculator)
- [CSV Import](/tools/csv-import)
- [Quote Builder](/tools/quote-builder)

**Admin**

- [SOP](/sop)
- [Training](/training) *(this guide)*
- [CRM Updates](/tools/terminal-updates)
- [Administration](/admin/administration)
- [Affiliates](/admin/affiliates)
- [Data Export](/admin/data-export)
- [Merchant Portal Guide](/tools/gateway-guide)
- [Deployment](/tools/netlify)

Other useful pages: [Calendar](/calendar), [Pricing](/pricing), [Integrations](/integrations), [Settings](/settings).

---

## 5. The Core Workflow: Lead → Live Merchant

**Processing pipeline:**

```
Discovery → Qualified → Application Prep → Underwriting Review →
Processor Approval → Gateway Submitted → Integration Setup →
Testing → Go Live Ready → Closed Won
```

**Gateway-Only pipeline:**

```
Discovery → Qualified → Application Prep → Underwriting →
Gateway Submitted → Go Live Ready → Closed Won
```

A deal can exit at any stage to: **Closed Lost**, **Disqualified**, **No Decision**, or **Underwriting Declined** — always with a reason captured.

Leads enter from four sources: the public web form, the merchant portal, manual entry, or an **affiliate referral**.

---

## 6. Your First Week — Six Things to Practice

### Task 1: Process a web submission

1. Open [Web Submissions](/admin/web-submissions).
2. Pick an unprocessed entry; review attached docs.
3. Click **Convert to Opportunity** — creates Account + Contact + Opportunity.
4. Confirm it appears on the [Pipeline board](/pipeline).

### Task 2: Move a deal through the pipeline

1. Open the [Pipeline](/pipeline).
2. Drag a deal from Discovery → Qualified (SLA timer resets).
3. On the opportunity card, click **Request Documents** to fire the auto-email.

### Task 3: Log activity on an opportunity

1. Open any deal under [Opportunities](/opportunities).
2. **Activities** tab → add a call note.
3. Add a follow-up **Task** — confirm it appears on [My Tasks](/my-tasks).

### Task 4: Build a quote

1. Open [Quote Builder](/tools/quote-builder).
2. Pick an opportunity → select the contact → choose a pricing tier.
3. Enter monthly volume + average ticket → generate the quote PDF → email it.

### Task 5: Claim a support ticket

1. Open [Support Triage](/support).
2. Switch to the **Unassigned** tab, claim a ticket (status moves to *In Progress*).
3. Open the ticket, post a reply, set priority/category, then close it when resolved.

### Task 6: Run a commission report

1. Open [Commissions](/commissions).
2. Select last month → review per-merchant volume, fees, residual, % change.
3. Filter by assignee.

---

## 7. Closing a Deal — Capture the Reason

Reporting depends on it. From the opportunity detail, when you change outcome, pick the right reason:

- **Closed Won** → *Live and billing*, *First transaction processed*, *Activated by onboarding*. MID gets attached and the merchant moves to [Live & Billing](/live-billing).
- **Closed Lost** → *Competitor*, *Pricing*, *Timeline*, *Integration complexity*, *Withdrawn*.
- **Disqualified** → *Unsupported MCC*, *Geography*, *Volume too small*, *Duplicate*, *Fraud*.
- **Underwriting Declined** → *Risk profile*, *Restricted business type*, *Chargeback concern*, *Incomplete docs*, *Processor decline*.
- **No Decision** → *No response*, *Project paused*, *Budget removed*.

---

## 8. Support Triage

The [Support Triage](/support) desk is where client support requests are handled. Reach it via the **Ops / Support** toggle in the header.

**Where tickets come from:**

- The public [Client Request Form](https://ops-terminal.merchant.haus/support-request) (share this link with clients).
- Inbound support emails (parsed automatically into tickets).
- Manually created by staff.

**Ticket basics:**

- **Status:** Open → In Progress → Closed.
- **Priority:** Low / Normal / High / Urgent.
- **Category:** Support, Billing, Integration, Technical.

**Your workflow:**

1. The board's tabs filter **All / Unassigned / Mine** with live counts.
2. **Claim** an unassigned ticket — it moves to *In Progress* and is assigned to you.
3. Open the ticket detail to post replies. Replies are either **internal** (staff-only notes) or **external** (emailed to the client).
4. Update category/priority as you learn more; mark **Closed** when resolved.

---

## 9. Quotes & Pricing

**Pricing tiers** (the [Pricing](/pricing) page shows the client-facing version):

| Tier | Price | Notes |
|---|---|---|
| **Foundation** | $59/mo | Essential fraud-first platform |
| **Growth** | $99/mo | Most popular — adds AI fraud decisioning |
| **Scale** | $149/mo | Full fraud suite + data optimization |
| **Enterprise** | Custom | Contact sales — bespoke high-volume |

Annual billing knocks ~17% off. On top of a tier, merchants can add **add-ons** — Customer Vault, Token Vault, Fraud Prevention, Kount AI, Level III, TXT2PAY, Card Updater, Shopify integration, mobile device.

**Building a quote:** Use the [Quote Builder](/tools/quote-builder). Pick an opportunity, pick the contact, choose a tier, enter the merchant's monthly volume and average ticket. It produces a quote PDF (already-bundled add-ons are excluded from the optional list) and emails it to the contact. You can also edit pricing directly inside an opportunity via the **Pricing** panel on its detail page.

---

## 10. The Affiliate / Referrer Program

Referral partners send us leads in exchange for commission. They use a **separate external portal** (`/affiliate`) — not the Ops Terminal — so you won't normally see it, but you do manage the partners.

**What you manage** — the [Affiliates](/admin/affiliates) admin page (admins):

- Each partner row: name, email, alias, active toggle, commission rate, monthly cap per merchant, clawback window, notes.
- **Create New Referrer** generates the partner's portal login.
- **Impersonate** opens the portal as that partner — useful for support and testing.

**What a referrer sees in their portal:** their submitted referrals and pipeline status, a "Submit New Referral" form, and a commissions page (monthly payouts per boarded merchant, plus milestone bonuses).

When a referrer submits a lead it lands as an Application tagged with their referrer ID, then enters the normal pipeline.

---

## 11. Daily Habits by Role

The current team and how a typical day looks:

| Person | Role | Daily routine |
|---|---|---|
| **Jamie** | CEO | Oversight via [Reports](/reports); [Administration](/admin/administration) |
| **Darryn** | QA & Complex Sales / Tech | Empty [Web Submissions](/admin/web-submissions); work complex deals; clear SLA reds on the [Pipeline](/pipeline) |
| **Xavier Rooza** | Sales | [Pipeline](/pipeline) → [My Tasks](/my-tasks) → [Outreach](/outreach); build [quotes](/tools/quote-builder) |
| **Yaseen Sheik** | Support Lead | Work the [Support Triage](/support) queue; claim & resolve tickets; escalate stuck deals |
| **Taryn Engledoe** | Affiliate & Partner Manager | Manage [Affiliates](/admin/affiliates); reconcile [Commissions](/commissions) and [Live & Billing](/live-billing) |

---

## 12. Watch the SLA Lights

Every opportunity card carries an SLA indicator:

- **Green** — on track.
- **Amber** — approaching SLA limit. Take action today.
- **Red** — overdue. Log activity, move stage, or close it out.

Untouched red deals are the #1 cause of lost pipeline. The SLA escalation job will also nudge by email.

---

## 13. Integrations You Should Know About

- **NMI Gateway** — primary processor.
  - Boarding form: [/tools/nmi-boarding](/tools/nmi-boarding)
  - Live gateway portal: [merchanthausio.transactiongateway.com](https://merchanthausio.transactiongateway.com)
  - NMI hosted forms: [Interchange](https://merchanthaus-ic.nmipays.com/form/MerchantHaus-ic) · [Flat Rate](https://merchanthaus-fr.nmipays.com/form/MerchantHaus-fr)
  - Status page: [statusgator.com/services/nmi](https://statusgator.com/services/nmi)
- **Google Calendar** — synced into [/calendar](/calendar). Reconnect on-page if it goes stale.
- **Gmail** — synced for activity logs and outreach metrics. Manage from [Integrations](/integrations).
- **Merchant Portal** — self-service site for merchants. Sends webhook events (M1–M6) into the Terminal as the merchant progresses.

---

## 14. Team Roster

Names, emails, titles and assignment colours all resolve from one place — the **Team Roster** ([/admin/team-roster](/admin/team-roster), admin-only). Edit someone there and the change flows everywhere: assignment dropdowns, calendar columns, SOP, and quotes. Never hardcode names elsewhere.

---

## 15. Where to Get Help

- [SOP](/sop) — start here for any "how do I…" question.
- [CRM Updates](/tools/terminal-updates) — recent CRM changes / new features.
- **Atria** chat button (bottom right) — AI assistant trained on our CRM.
- People: **Darryn** for access/process & complex deals, **Xavier** for the sales playbook, **Yaseen** for support escalations, **Taryn** for affiliates & commissions, **Jamie** for anything else.

---

## Quick Reference Card

| If you need to… | Go to |
|---|---|
| See your day at a glance | [Pipeline](/pipeline) + [My Tasks](/my-tasks) |
| Process a new lead | [Web Submissions](/admin/web-submissions) |
| Look up a merchant | [Leads](/leads) or [Opportunities](/opportunities) |
| Add a follow-up | [Tasks](/tasks) |
| Send an email blast | [Outreach](/outreach) |
| Handle a client issue | [Support Triage](/support) |
| Price a deal / send a quote | [Quote Builder](/tools/quote-builder) |
| Check this month's earnings | [Commissions](/commissions) |
| See live merchants & MIDs | [Live & Billing](/live-billing) |
| Manage referral partners | [Affiliates](/admin/affiliates) |
| Pull team performance | [Reports](/reports) |
| Board a merchant on NMI | [NMI Boarding](/tools/nmi-boarding) |
| Estimate a deal's revenue | [Revenue Calculator](/tools/revenue-calculator) |
| Send a merchant the public application | [merchant-apply form](https://ops-terminal.lovable.app/merchant-apply) |
| Give a client the support form | [support-request form](https://ops-terminal.merchant.haus/support-request) |
| Check NMI uptime | [statusgator.com/services/nmi](https://statusgator.com/services/nmi) |
