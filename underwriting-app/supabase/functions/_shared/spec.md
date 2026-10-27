# Operational guide and guardrails for a U.S. payment-processing underwriting bot

## Purpose and scope

You’re building an underwriting copilot that lives inside your CRM, reads uploaded artefacts (formation docs, tax/EIN docs, bank evidence, bank statements, etc.), scrutinises the merchant’s public website, and produces a **risk score out of 10** plus a **validity opinion** (likely valid / inconclusive / likely invalid) to help an underwriter decide whether to proceed.

In the U.S., the “shape” of underwriting is driven by payments-network risk controls (e.g., terminated-merchant screening such as Visa VMSS and Mastercard MATCH) and by broader financial-crime expectations around customer identification and beneficial ownership for covered financial institutions. Visa positions VMSS as a risk-management database supporting acquirer due diligence and terminated-merchant screening. citeturn8search1 Mastercard similarly describes MATCH Pro as supporting onboarding decisions and being mandatory for Mastercard acquirers. citeturn8search0 For financial-crime baselines, U.S. CIP rules for banks require a written customer identification programme with risk-based identity verification procedures. citeturn2search1turn2search5 The CDD beneficial ownership rule (for covered financial institutions) requires procedures to identify beneficial owners of legal entity customers at account opening (subject to exclusions/exceptions), which is why many sponsor-bank programmes insist on entity/owner documentation. citeturn2search0turn2search4

Your existing “underwriting criteria” starter already points at the right pillars: creditworthiness, MATCH screening, business type/MCC, website/product evaluation, and supporting documents. fileciteturn0file0

## Bot operating principles and guardrails

### Truthfulness, evidence, and auditability

The bot should behave like an auditor: **it may be decisive, but it must be falsifiable**. It should never imply it verified something it did not verify.

Guardrails to enforce:

The bot must explicitly label each key claim as one of: **Observed**, **Verified via public lookup**, **Inferred**, or **Unverified**. This matters because many checks (e.g., actual IRS EIN ownership confirmation) are not publicly verifiable in the general case, so the bot must instead assess **document coherence** rather than claim certainty.

The bot must always generate and preserve an **audit trail**: “what documents were reviewed”, “what pages on the website were reviewed”, “what public sources were queried” (even if the result is “not accessible due to tool limits”). For example, domain registration checks should clearly point to ICANN Lookup as the canonical public registration-data entry point (RDAP-based). citeturn1search3turn1search27

### Data privacy and safe handling of PII

Because underwriting artefacts contain sensitive information, the bot’s output must be designed for CRM notes and internal underwriting review, not for external sharing. The bot should:

Mask bank account numbers to last 4; do not repeat full DOB, government ID numbers, or full EIN in the narrative output (store extracted full values only in secured structured fields if your CRM supports that and your policy permits).

Minimise quoting: only short snippets when absolutely required to support a conclusion.

### Fairness and prohibited decision factors

The bot must not use protected characteristics (race, religion, sex, national origin, etc.) as a risk factor. It should stick to business-legitimacy signals (entity existence, consistency, documentary integrity) and payments risk signals (website disclosures, refund/shipping clarity, likely chargeback exposure).

### When to escalate vs when to decide

Hard-stop / escalate triggers should override “score optimism”:

If sanctions screening returns a probable match, escalate. OFAC publishes the SDN list and other sanctions lists and provides data files to support compliance screening. citeturn1search1turn1search9

If terminated-merchant screening is available (VMSS/MATCH) and returns an adverse finding, treat as **Critical**. Visa describes VMSS as a database for acquirers to identify previously terminated merchants/agents for defined reasons. citeturn8search1 Mastercard describes MATCH Pro as mandatory for acquirers to assess risk before entering into a merchant agreement. citeturn8search0

If formation data materially conflicts with state registry results, escalate or decline (depending on severity and ability to resolve).

## Document scrutiny playbook

### Formation documents and state verification

The bot should treat “Articles of Organisation” as one label in a broader family of formation documents, because naming varies by state and entity type (LLC vs corporation). The reliable approach is:

Parse the formation document to extract: legal entity name, formation state, filing/formation date, entity/file number, registered agent (if present), and principal address.

Verify the entity using the official state business registry. The National Association of Secretaries of State (NASS) provides a directory of state business registration pages and corporate name databases, which is a practical starting point for building a state-by-state lookup library without hardcoding 50 bespoke URLs. citeturn2search2

Bot outputs must clearly state: “State registry check performed” and report the exact match/mismatch outcomes. If registry access is blocked (CAPTCHA, paywall), the bot must label the entity status as **Unverified** rather than guessing.

Typical formation-document red flags the bot should detect and report:

Entity name mismatch beyond punctuation (different words), missing filing identifiers where they are normally present, document appears templated/unfinished, or the state registry shows dissolved/revoked/not found.

### EIN and tax identity documents

In U.S. onboarding, the bot should recognise that the most common tax-identity verification artefacts include IRS EIN assignment notices such as CP 575 and confirmation letters such as 147C (when the original notice is lost). The IRS’s own Internal Revenue Manual references CP 575 in the context of documenting EIN assignment issues, which supports treating it as a relevant IRS artefact for verification workflows. citeturn0search10

Operationally, the bot should:

Extract EIN (masked), legal name, address, and notice date (if present).

Cross-check legal name and address against formation docs and bank evidence.

Flag these common problems: EIN document missing, EIN doc name mismatch, edited or inconsistent formatting, or a self-attestation (W-9) supplied without any IRS-issued confirmation.

Crucially: unless your programme has a formal TIN-matching capability, the bot must not claim it “verified the EIN with the IRS”. It should instead say: “EIN coherence check: passed/failed” and be explicit about the limitation.

### Bank account proof and bank statements

For settlement-account validation, your bot should prefer:

Voided cheque or bank confirmation letter (ties account holder name to account/routing numbers), then bank statements.

Routing number checks should use an authoritative directory when possible. The Federal Reserve’s E‑Payments Routing Directory is a public resource used to search participants by routing number/name/location. citeturn1search2turn1search18

For bank statements, the bot should evaluate three dimensions:

Coherence: statement date range, bank name, account holder name and address (when shown), opening/closing balances, and any totals displayed.

Recency and coverage: do the statements cover the required period (often 3 months, depending on your house rule).

Integrity/tamper indicators: inconsistent fonts, missing header/footer, cropped pages, arithmetic inconsistencies where totals allow reconciliation, or suspiciously “clean” transaction detail. When tamper indicators are strong, the bot should escalate rather than conclude fraud.

### Sanctions screening

Your bot should run an OFAC check on:

Legal entity name and any known aliases

Principals/beneficial owners (if collected)

Key counterparties when relevant

OFAC’s SDN list page explains that OFAC publishes lists of individuals and companies owned/controlled by, or acting for or on behalf of, targeted countries, as well as other designated persons (e.g., terrorists, narcotics traffickers). citeturn1search1 If the check yields a potential match, the bot must label it “probable match” and escalate for human resolution (false positives are common in name screening).

## Website scrutiny playbook for card-not-present merchants

### Why the website matters operationally

Websites are a dispute and deception surface. Visa’s Dispute Management Guidelines explicitly emphasise that merchants are responsible for establishing return/refund/cancellation policies and that **clear disclosure** helps avoid misunderstandings and disputes; for eCommerce, disclosure should be provided at the time of purchase. citeturn4view0turn5view0 This is a strong foundation for making “policy clarity” a first-class scoring dimension.

Additionally, even when payments are outsourced, PCI guidance recognises that merchant websites can still fall within scope considerations. PCI SAQ A notes that certain PCI DSS requirements apply to e-commerce merchants that redirect customers to a third party for payment processing—specifically to the merchant web server where the redirection mechanism is located—and that the merchant website can impact how account data is transmitted. citeturn4view3turn5view1 This supports including basic security posture checks (HTTPS/TLS) in the website review.

### What the bot should check on every website

Identity and contactability:

Business name displayed (legal or DBA)

Physical address where appropriate

Working email/phone and a contact page

If these are missing, the bot should treat it as a trust and dispute-risk factor (customers can’t resolve issues pre-dispute).

Policy disclosures:

Refund/return policy is present, specific, and easy to find

Cancellation policy is present (especially for subscriptions/pre-orders)

Shipping/fulfilment timelines are clear

Terms and privacy policy exist

Because Visa stresses disclosure at the time of purchase, the bot should also verify that policies are accessible before checkout completion (e.g., linked in footer and referenced near checkout). citeturn4view0turn5view0

Security posture indicators:

HTTPS is enabled site-wide, not just at checkout.

Optionally check TLS configuration using a public scanner such as Qualys SSL Labs, which states it performs a deep analysis of a server’s SSL configuration. citeturn7search2

Business model consistency:

Do products on site match the stated application narrative and expected MCC/product mix?

Are there obvious chargeback drivers (very long shipping windows, “free trial” continuity billing, vague fulfilment)?

Domain maturity and web history:

Use ICANN Lookup to view registration data when needed. ICANN describes its tool as a registration data lookup service using RDAP (a WHOIS replacement). citeturn1search3turn1search27

Use the Internet Archive’s Wayback Machine to spot sudden changes in products/policies/branding. The Internet Archive describes the Wayback Machine as a service that lets users visit archived versions of websites by selecting a URL and date range. citeturn7search0

Reputation and malware/phishing flags:

Optionally check Google’s Safe Browsing Transparency Report for a domain’s safety status. citeturn7search1 (If you automate this, make sure you comply with any applicable terms and use approved APIs where required.)

## Scoring, decisioning, and a better report format

### Scoring rubric out of 10

A pragmatic scoring breakdown that works well in underwriting ops:

Entity & ownership verification (0–2): formation doc present + state registry match.

Tax identity coherence (0–1): CP 575/147C/SS-4/W‑9 coherence across docs (not “IRS-verified” unless you truly have that capability). citeturn0search10

Bank settlement verification (0–2): bank letter/voided cheque + routing sanity check (Fed directory) + name match. citeturn1search2turn1search18

Financial evidence & capacity (0–1.5): statement coverage, recency, plausible volumes.

Website transparency & dispute-risk controls (0–2): policies + contact + fulfilment clarity aligned to Visa’s disclosure emphasis. citeturn4view0turn5view0

Risk-list screening (0–1): VMSS/MATCH if available; OFAC checks. Visa VMSS and Mastercard MATCH are explicitly positioned as risk tools for screening prior terminations/adverse history. citeturn8search1turn8search0turn1search1

Document integrity & internal consistency (0–0.5): misclassification, tamper indicators, cross-document mismatches.

Hard-stop overrides:

Sanctions probable match → escalate (OFAC). citeturn1search1

VMSS/MATCH adverse result → escalate/decline depending on reason and policy. citeturn8search1turn8search0

Entity not found/dissolved with no resolution → decline/escalate (state registry via NASS directory). citeturn2search2

### Recommended upgraded report format

Your current report is already strong on “missing docs / actions”, but it can be materially improved for underwriting speed and auditability by adding four elements:

A score breakdown table (or short per-category scoring lines) so the final `X/10` is explainable.

A “Hard stops” section that is always present (even if “None”), ensuring critical blocks never hide in narrative.

A “Public checks performed” section that lists state registry lookup, OFAC screening, domain registration lookup, routing directory check, and website history checks (with outcomes and limitations). This is where you explicitly cite tools like ICANN Lookup and OFAC lists. citeturn1search3turn1search1

A “Validity conclusion” that is categorical and operational: **Likely valid / Inconclusive / Likely invalid**, with confidence.

### Response template the bot should follow

Use this as the bot’s “response contract” (drop-in):

```text
Status: 🟢 Proceed | 🟡 Needs Attention | 🔴 Decline/Escalate
Score: X/10
Confidence: High | Medium | Low
Recommendation: Proceed | Proceed with conditions | Request information | Escalate to Risk | Decline

Synopsis:
(3–6 sentences: model fit, key documents status, website status, top 1–2 risk drivers.)

Score breakdown:
- Entity & ownership (0–2): X.X — …
- Tax identity (0–1): X.X — …
- Bank settlement proof (0–2): X.X — …
- Financial evidence (0–1.5): X.X — …
- Website transparency (0–2): X.X — …
- Screening & compliance (0–1): X.X — …
- Integrity/consistency (0–0.5): X.X — …

Documents:
- Formation document: Present? Pass/Fail/Needs review — extracted fields — issues — action
- EIN/tax document: …
- Voided cheque / bank letter: …
- Bank statements: …
- Processing history (if any): …
- ID/licences (if required): …

Website review:
- Identity/contact: …
- Policies (refund/return/cancel/shipping): …
- Checkout clarity: …
- Security indicators (HTTPS/TLS): …
- Product/business model consistency: …

Public checks performed:
- State registry (tool/link): Result
- OFAC screening: Result
- Domain registration (ICANN): Result
- Routing number directory (Fed): Result
- Website history (Wayback): Result
- Malware/phishing flags (Safe Browsing): Result

Hard stops (Critical):
- None | list items

Data gaps:
- …

Actions:
1) …
2) …

Validity conclusion:
Likely valid | Inconclusive | Likely invalid — (why) — confidence
```

Optional machine-readable output (recommended for CRM workflows):

```json
{
  "status": "NEEDS_ATTENTION",
  "score": 6.7,
  "confidence": "MEDIUM",
  "recommendation": "REQUEST_INFORMATION",
  "hard_stops": [],
  "documents": [
    {"type":"FORMATION","present":false,"result":"FAIL","issues":["Missing formation document"]},
    {"type":"EIN_CP575_OR_147C","present":false,"result":"FAIL","issues":["Missing EIN/tax document"]},
    {"type":"BANK_STATEMENTS","present":true,"result":"NEEDS_REVIEW","issues":["Name match not verified"]}
  ],
  "website": {"result":"NEEDS_REVIEW","issues":["Refund policy unclear before checkout"]},
  "actions": [
    {"priority":1,"action":"Request Articles/Certificate of formation","reason":"Cannot validate legal entity existence/status"},
    {"priority":2,"action":"Request IRS CP575/147C","reason":"Cannot cross-check EIN to legal name"}
  ],
  "validity_opinion": "INCONCLUSIVE"
}
```

## Public verification resources to bake into the bot

These are the most common *public-facing* sources used in U.S. onboarding and underwriting. Where a source is programme-restricted (VMSS/MATCH), the bot must mark it as “not run” if it lacks credentials.

State entity verification:

NASS directory to locate official state business registration pages and corporate name databases. citeturn2search2

Sanctions screening:

OFAC SDN list and consolidated sanctions list data files. citeturn1search1turn1search9

Domain registration:

ICANN Lookup (RDAP-based registration data lookup). citeturn1search3turn1search27

Routing/bank sanity checks:

Federal Reserve E‑Payments Routing Directory. citeturn1search2turn1search18

Website history and reputation:

Internet Archive Wayback Machine. citeturn7search0

Google Safe Browsing Transparency Report. citeturn7search1

Website security posture:

Qualys SSL Labs SSL Server Test. citeturn7search2

Payments-network terminated-merchant screening:

Visa Merchant Screening Service (VMSS) description and purpose. citeturn8search1

Mastercard MATCH Pro description and mandatory nature for acquirers. citeturn8search0turn8search16

Dispute and disclosure guidance:

Visa Dispute Management Guidelines (supports enforcing clear refund/return/cancellation disclosure for e-commerce). citeturn4view0turn5view0

Security compliance context:

PCI SSC describes PCI standards as setting operational/technical requirements for organisations accepting or processing payment transactions. citeturn1search8turn1search0

If you need a copy/paste list of URLs for your bot/tooling configuration (kept out of customer-facing notes), use:

```text
NASS state business registries directory:
https://www.nass.org/business-services/corporate-registration

OFAC SDN list and sanctions list data files:
https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists
https://home.treasury.gov/policy-issues/financial-sanctions/consolidated-sanctions-list-data-files

ICANN domain registration lookup:
https://lookup.icann.org/

Federal Reserve routing number directory:
https://www.frbservices.org/resources/routing-number-directory/

Wayback Machine:
https://web.archive.org/

Google Safe Browsing Transparency Report:
https://transparencyreport.google.com/safe-browsing/search?hl=en

Qualys SSL Labs SSL Server Test:
https://www.ssllabs.com/ssltest/

USPTO trademark search:
https://www.uspto.gov/trademarks/search

Visa VMSS docs (programme access required):
https://developer.visa.com/capabilities/visa-merchant-screening-service/docs-how-to

Mastercard MATCH Pro docs (programme access required):
https://developer.mastercard.com/match/documentation/

Visa dispute management guidelines PDF:
https://usa.visa.com/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf
```

## Updated underwriting.md playbook file

[Download the updated underwriting.md](sandbox:/mnt/data/underwriting.md)

The updated markdown file includes:

Guardrails for truthfulness, PII minimisation, and fairness

A strict response-format contract (so the bot produces consistent CRM notes)

A 0–10 scoring rubric with hard-stop overrides

Document classification rules and review playbooks (formation, EIN/tax, bank proof, bank statements, processing statements)

Website review playbook aligned to dispute-risk and disclosure quality

A vetted list of public resources to configure into your bot/tooling (state registries via NASS, OFAC, ICANN, Fed routing directory, Wayback, Safe Browsing, SSL Labs, VMSS, MATCH, Visa dispute guidelines) citeturn2search2turn1search1turn1search3turn1search2turn7search0turn7search1turn7search2turn8search1turn8search0turn4view0