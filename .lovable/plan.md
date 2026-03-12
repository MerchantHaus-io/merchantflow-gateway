

# Industry-Standard Gaps Analysis

After reviewing the current implementation — underwriting gate, document requirements, unified AI review, website scrutiny, MCC recommendation — here are the notable industry-standard practices that are **not yet in place**:

---

## 1. Owner Identity Verification (KYC / CDD)

**What's missing:** "Passport/Drivers License" exists as a document type option but is **not a hard requirement** in the underwriting gate. Under BSA/AML and FATF Customer Due Diligence rules, principal owner identification is mandatory before onboarding.

**What to build:** Add "Passport/Drivers License" as a 5th hard-requirement document in the underwriting gate. The AI review prompt already references it but the gate doesn't enforce it.

---

## 2. OFAC / Sanctions Screening

**What's missing:** No automated check against the OFAC SDN (Specially Designated Nationals) list. Industry standard requires screening the business entity name, DBA, and all beneficial owners against sanctions lists before proceeding.

**What to build:** Add an OFAC screening step to the underwriting review. The AI prompt can be extended to flag entity/owner names against known restricted lists, or a lightweight API call to the OFAC SDN search can be integrated into the edge function.

---

## 3. Beneficial Ownership Declaration (FinCEN CDD Rule)

**What's missing:** The merchant application captures `beneficial_owner_certification` as a boolean but there's no structured collection of all beneficial owners with 25%+ equity (name, DOB, SSN, address) — which is required under FinCEN's CDD Rule for all legal entity customers.

**What to build:** A beneficial owners table and form section requiring name, title, ownership percentage, DOB, and address for each 25%+ owner. The underwriting gate should verify at least one beneficial owner is recorded.

---

## 4. Stage SLA Timers with Escalation

**What's missing:** `sla_status` and `stage_entered_at` columns exist, and staleness badges show after 7 days, but there are **no automated SLA calculations or escalation alerts**. Industry standard is to have defined SLA windows per stage with automatic amber/red escalation and notification.

**What to build:** A scheduled function or client-side calculation that sets `sla_status` based on time-in-stage thresholds per stage (e.g., Underwriting > 3 days = amber, > 5 days = red). Trigger push notifications or task creation on breach.

---

## 5. Duplicate / Existing Merchant Check

**What's missing:** No deduplication logic. A merchant can be submitted multiple times with the same EIN, legal name, or DBA without any warning. Processors flag duplicate applications — submitting duplicates wastes time and can raise red flags.

**What to build:** Before allowing transition past Discovery, check `accounts.name`, `merchants.federal_tax_id`, and `merchants.dba_name` for near-matches against existing records. Surface a warning if a potential duplicate is found.

---

## 6. Chargeback / Risk Reserve Flag

**What's missing:** The AI prompt references Visa VAMP and Mastercard ECP thresholds, but there's no structured field to flag whether the merchant is in a **high-risk MCC** that typically requires reserves, delayed funding, or enhanced monitoring.

**What to build:** When the AI recommends an MCC code, automatically flag if it falls into a high-risk category (e.g., 5966 Direct Marketing, 5967 Inbound Telemarketing, 7995 Gambling). Add a `risk_tier` field to the validation report and surface it in the UI as a warning badge.

---

## Recommended Priority

| # | Feature | Effort | Regulatory Weight |
|---|---------|--------|-------------------|
| 1 | Owner ID as hard requirement | Small | High (KYC) |
| 2 | Beneficial ownership collection | Medium | High (FinCEN CDD) |
| 3 | Duplicate merchant check | Medium | Medium (operational) |
| 4 | OFAC screening in AI review | Small | High (BSA/AML) |
| 5 | Stage SLA timers + escalation | Medium | Medium (operational) |
| 6 | High-risk MCC flagging | Small | Medium (risk mgmt) |

All six are standard in ISO/acquirer onboarding workflows. Items 1 and 4 are the quickest wins with the highest regulatory significance.

