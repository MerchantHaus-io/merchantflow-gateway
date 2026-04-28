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

Revenue = transaction fees + ongoing residuals on live merchant accounts. The **Ops Terminal** is the internal CRM where every deal is managed from first contact to ongoing billing.

---

## 2. Logging In

- Go to [ops-terminal.merchant.haus](https://ops-terminal.merchant.haus/).
- Sign in with Supabase email/password or **Google OAuth**.
- Access is **whitelisted** — only approved `@merchanthaus.io` addresses get in. Ping Darryn if you can't log in.

**Roles:**

- **Admin** (Darryn) — full access, including [/admin/administration](/admin/administration).
- **Standard user** — full CRM access except admin-only screens.

---

## 3. The Vocabulary (memorize these)

| Term | Meaning |
|---|---|
| **Account** | The merchant company record |
| **Contact** | A person at the merchant |
| **Opportunity** | A deal in the pipeline — tied to one Account |
| **Application** | An inbound submission (web form / merchant portal) — converts into an Opportunity |
| **Stage** | Position in the pipeline |
| **Pipeline** | *Processing* or *Gateway-Only* — different stage sets |
| **MID** | NMI Merchant ID, assigned at go-live |
| **SLA Status** | Green / Amber / Red indicator for time-in-stage |
| **Outcome** | Closed Won, Closed Lost, Disqualified, No Decision, Underwriting Declined |
| **Residual** | Our recurring margin on a live merchant's processing |

---

## 4. The Navigation Map

**Pipeline & Sales**

- [Pipeline (Kanban)](/pipeline)
- [All Opportunities](/opportunities)
- [Web Submissions inbox](/admin/web-submissions)
- [Outreach](/outreach)
- [Tasks](/tasks) · [My Tasks](/my-tasks)
- [Calendar](/calendar)

**CRM Core**

- [Leads / Accounts](/leads)
- [Contacts](/contacts)
- [Documents](/documents)

**Reports & Billing**

- [Reports](/reports)
- [Transactions](/reports/transactions)
- [Commissions](/commissions)
- [Live & Billing](/live-billing)
- [Supported Processors](/supported-processors)

**Tools**

- [SOP](/sop)
- [Pre-Qualification Wizard](/tools/preboarding-wizard)
- [NMI Boarding](/tools/nmi-boarding)
- [Merchant Portal Guide](/tools/gateway-guide)
- [Revenue Calculator](/tools/revenue-calculator)
- [CSV Import](/tools/csv-import)
- [CRM Updates](/tools/terminal-updates)
- [Settings](/settings)

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

---

## 6. Your First Week — Five Things to Practice

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

### Task 4: Run a commission report

1. Open [Commissions](/commissions).
2. Select last month → review per-merchant volume, fees, residual, % change.
3. Filter by assignee.

### Task 5: Send an outreach campaign

1. Open [Outreach](/outreach) → **New Campaign**.
2. Compose, pick recipients (or upload a CSV), schedule or send.
3. Check open/click rates on the campaign detail page.

---

## 7. Closing a Deal — Capture the Reason

Reporting depends on it. From the opportunity detail, when you change outcome, pick the right reason:

- **Closed Won** → *Live and billing*, *First transaction processed*, *Activated by onboarding*. MID gets attached and the merchant moves to [Live & Billing](/live-billing).
- **Closed Lost** → *Competitor*, *Pricing*, *Timeline*, *Integration complexity*, *Withdrawn*.
- **Disqualified** → *Unsupported MCC*, *Geography*, *Volume too small*, *Duplicate*, *Fraud*.
- **Underwriting Declined** → *Risk profile*, *Restricted business type*, *Chargeback concern*, *Incomplete docs*, *Processor decline*.
- **No Decision** → *No response*, *Project paused*, *Budget removed*.

---

## 8. Daily Habits by Role

| Role | Daily routine |
|---|---|
| **Sales** (Wesley) | [Pipeline](/pipeline) → [My Tasks](/my-tasks) → [Calendar](/calendar) → [Outreach](/outreach) |
| **Onboarding** (Darryn / Jamie) | Empty [Web Submissions](/admin/web-submissions); chase doc requests; clear SLA reds on the [Pipeline](/pipeline) |
| **Support** (Sheiky) | Watch SLA-amber/red opportunities; log inbound calls as activities; escalate stuck Underwriting deals |
| **Ops** (Taryn) | Glance at [Reports](/reports) KPIs; reconcile [Commissions](/commissions) and [Live & Billing](/live-billing) at month end |
| **Admin** (Darryn) | [Administration panel](/admin/administration) for sessions, broadcasts, role changes |

---

## 9. Watch the SLA Lights

Every opportunity card carries an SLA indicator:

- **Green** — on track.
- **Amber** — approaching SLA limit. Take action today.
- **Red** — overdue. Log activity, move stage, or close it out.

Untouched red deals are the #1 cause of lost pipeline. The SLA escalation job will also nudge by email.

---

## 10. Integrations You Should Know About

- **NMI Gateway** — primary processor.
  - Boarding form: [/tools/nmi-boarding](/tools/nmi-boarding)
  - Live gateway portal: [merchanthausio.transactiongateway.com](https://merchanthausio.transactiongateway.com)
  - NMI hosted forms: [Interchange](https://merchanthaus-ic.nmipays.com/form/MerchantHaus-ic) · [Flat Rate](https://merchanthaus-fr.nmipays.com/form/MerchantHaus-fr)
  - Status page: [statusgator.com/services/nmi](https://statusgator.com/services/nmi)
- **Google Calendar** — synced into [/calendar](/calendar). Reconnect on-page if it goes stale.
- **Gmail** — synced for activity logs and outreach metrics. Reconnect from [Settings](/settings).
- **Merchant Portal** — self-service site for merchants. Sends webhook events (M1–M6) into the Terminal as the merchant progresses.

---

## 11. Where to Get Help

- [SOP](/sop) — start here for any "how do I…" question.
- [CRM Updates](/tools/terminal-updates) — recent CRM changes / new features.
- **Atria** chat button (bottom right) — AI assistant trained on our CRM.
- People: **Darryn** for access/process, **Jamie** for onboarding workflow, **Wesley** for sales playbook, **Sheiky** for support escalations, **Taryn** for reporting/ops.

---

## Quick Reference Card

| If you need to… | Go to |
|---|---|
| See your day at a glance | [Pipeline](/pipeline) + [My Tasks](/my-tasks) |
| Process a new lead | [Web Submissions](/admin/web-submissions) |
| Look up a merchant | [Leads](/leads) or [Opportunities](/opportunities) |
| Add a follow-up | [Tasks](/tasks) |
| Send an email blast | [Outreach](/outreach) |
| Check this month's earnings | [Commissions](/commissions) |
| See live merchants & MIDs | [Live & Billing](/live-billing) |
| Pull team performance | [Reports](/reports) |
| Board a merchant on NMI | [NMI Boarding](/tools/nmi-boarding) |
| Estimate a deal's revenue | [Revenue Calculator](/tools/revenue-calculator) |
| Send a merchant the public application | [merchant-apply form](https://ops-terminal.lovable.app/merchant-apply) |
| Check NMI uptime | [statusgator.com/services/nmi](https://statusgator.com/services/nmi) |
