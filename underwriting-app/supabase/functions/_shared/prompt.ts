import type { CaseRow, DocRow, HouseRules } from "./types.ts";

// Defaults mirror org_settings.house_rules in migration 0001. Used only when a
// tenant hasn't overridden them.
const DEFAULT_REQUIRED_DOCS = [
  "Articles of Organization",
  "EIN",
  "Voided Check / Bank Confirmation Letter",
  "Bank Statement",
  "Passport/Drivers License",
];
const DEFAULT_GATEWAY_DOCS = [
  "Voided Check / Bank Confirmation Letter",
  "VAR/Tear Sheet",
];

function str(v: unknown): string {
  return v === null || v === undefined || v === "" ? "" : String(v);
}

/** Build the merchant/application context block from a case + its documents. */
export function buildApplicationContext(
  caseRow: CaseRow,
  documents: DocRow[],
  website: { content: string; error: string },
  todayIso: string,
): string {
  const app = caseRow.application ?? {};
  const contact = caseRow.contact ?? {};
  const address = caseRow.address ?? {};
  const g = (o: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      const v = o[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "Not provided";
  };

  const docList = documents
    .map((d) => `- ${d.file_name} (type: ${d.document_type || "Unassigned"})`)
    .join("\n");

  const txMix = [
    app.percent_swiped ? `Swiped: ${app.percent_swiped}%` : null,
    app.percent_keyed ? `Keyed: ${app.percent_keyed}%` : null,
    app.percent_ecommerce ? `E-commerce: ${app.percent_ecommerce}%` : null,
    app.percent_moto ? `MOTO: ${app.percent_moto}%` : null,
  ].filter(Boolean).join(", ") || "Not provided";

  const customerMix = [
    app.percent_b2b ? `B2B: ${app.percent_b2b}%` : null,
    app.percent_b2c ? `B2C: ${app.percent_b2c}%` : null,
  ].filter(Boolean).join(", ") || "Not provided";

  const websiteBlock = caseRow.website_url
    ? website.error
      ? `WEBSITE FETCH ERROR: ${website.error}`
      : `WEBSITE CONTENT (extracted text):\n${website.content}`
    : "NO WEBSITE URL PROVIDED — flag as risk if service type requires web presence";

  return `TODAY'S DATE: ${todayIso}

ACCOUNT: ${str(caseRow.legal_name) || str(caseRow.dba_name) || "Unknown"}
WEBSITE URL: ${caseRow.website_url || "Not provided"}
ADDRESS: ${[address.address1, address.city, address.state, address.zip].filter(Boolean).join(", ") || "Not provided"}

CONTACT: ${[contact.first, contact.last].filter(Boolean).join(" ") || "Unknown"}
EMAIL: ${str(contact.email) || "Not provided"}
PHONE: ${str(contact.phone) || "Not provided"}

SERVICE TYPE: ${caseRow.service_type}

APPLICATION DATA:
- DBA Name: ${g(app, "dbaName", "dba_name")}
- Legal Entity: ${str(caseRow.legal_name) || g(app, "legalEntityName", "legal_entity_name")}
- Federal Tax ID: ${app.tin || app.federal_tax_id ? "Provided" : "Not provided"}
- Ownership Type: ${g(app, "ownershipType", "ownership_type")}
- Nature of Business: ${g(app, "nature_of_business", "product_description")}
- Products/Services: ${g(app, "products", "product_description")}
- MCC/SIC Code: ${g(app, "sic_mcc_code", "mcc")}
- Monthly Volume: ${g(app, "monthlyVolume", "monthly_volume")}
- Avg Ticket: ${g(app, "avgTicket", "average_transaction")}
- High Ticket: ${g(app, "highTicket", "high_ticket")}
- Transaction Mix: ${txMix}
- Customer Mix: ${customerMix}
- Beneficial Owners: ${
    Array.isArray(caseRow.owners) && caseRow.owners.length
      ? caseRow.owners.map((o) => (o as Record<string, unknown>)?.name).filter(Boolean).join(", ") || "Provided"
      : "Not provided"
  }

UPLOADED DOCUMENTS (${documents.length} total):
${docList || "No documents uploaded"}

${websiteBlock}
`;
}

function requiredDocsBlock(
  caseRow: CaseRow,
  documents: DocRow[],
  rules: HouseRules,
): string {
  const types = new Set(documents.map((d) => d.document_type).filter(Boolean) as string[]);
  const has = (t: string) => (types.has(t) ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT)");
  if (caseRow.service_type === "gateway_only") {
    const docs = rules.gateway_required_doc_types ?? DEFAULT_GATEWAY_DOCS;
    return docs.map((d) => `- ${d}: ${has(d)}`).join("\n");
  }
  const docs = rules.required_doc_types ?? DEFAULT_REQUIRED_DOCS;
  return docs.map((d) => `- ${d}: ${has(d)}`).join("\n");
}

const GATEWAY_SYSTEM =
  "You are an expert reviewer for gateway-only merchant onboarding. Gateway-only merchants are getting a payment gateway only — they have their own processing relationship. Apply proportionate, lighter scrutiny. Do NOT flag missing processing documents (Articles of Org, EIN, Bank Statements, Owner ID). Focus on business legitimacy, banking verification, VAR/Tear Sheet consistency, and OFAC screening. Label every key claim as Observed, Verified, Inferred, or Unverified. Mask all PII.";

const PROCESSING_SYSTEM =
  "You are an expert underwriting reviewer for payment processing merchant applications. You enforce Visa Core Rules & Dispute Management Guidelines, Mastercard requirements, FATF CDD expectations, PCI DSS standards, and U.S. CIP/beneficial-ownership rules. You behave like an auditor: decisive but falsifiable. You label every key claim as Observed, Verified via public lookup, Inferred, or Unverified. You mask all PII (EIN/SSN/DOB/account numbers to last 4 only). You never imply you verified something you did not verify.";

/**
 * Build the {system, user} messages for the review. House rules (foundation
 * volume threshold, required document list) come from tenant org_settings —
 * they were hardcoded in the origin CRM.
 */
export function buildPrompt(
  caseRow: CaseRow,
  documents: DocRow[],
  website: { content: string; error: string },
  rules: HouseRules,
  todayIso: string,
): { system: string; user: string } {
  const context = buildApplicationContext(caseRow, documents, website, todayIso);
  const docCheck = requiredDocsBlock(caseRow, documents, rules);
  const threshold = rules.foundation_tier_threshold ?? 50000;
  const bankMonths = rules.bank_statement_months ?? 3;

  if (caseRow.service_type === "gateway_only") {
    const user = `This is a GATEWAY-ONLY deal. Apply LIGHTER scrutiny — the merchant is getting a payment gateway only, not a processing account.

═══ GUARDRAILS ═══
EVIDENCE LABELING: For every key claim, label as Observed, Verified via public lookup, Inferred, or Unverified.
PII MASKING: Never repeat full EIN, SSN, DOB, or bank account numbers. Mask to last 4 digits only.

═══ REQUIRED DOCUMENTS (gateway-only) ═══
${docCheck}
Do NOT flag Articles of Organization, EIN, Bank Statements, or Owner ID as missing for gateway-only deals.

═══ REVIEW DIMENSIONS ═══
1. Business legitimacy & identity — is this a real, operating business? Does the name match the application?
2. Banking verification — voided check/bank letter present, routing number valid, account holder name matches.
3. VAR/Tear Sheet consistency — gateway config, pricing, merchant info consistent with the application.
4. Basic website review — legitimacy only (NOT full Visa compliance). Contact info present, no scam indicators.
5. Screening & compliance — OFAC screen business/DBA/owner names. ANY match = CRITICAL hard stop.

═══ SCORING (0–100) ═══
- Business legitimacy & identity (0–30)
- Banking verification (0–30)
- VAR/Tear Sheet consistency (0–20)
- Screening & compliance (0–10)
- Document integrity (0–10)

HARD-STOP OVERRIDES: Sanctions match, VMSS/MATCH adverse result, material tampering.

═══ VALIDITY CONCLUSION ═══
Provide "likely_valid", "inconclusive", or "likely_invalid" with confidence and justification.

${context}

Call the "underwriting_review_report" function. Apply proportionate scrutiny; do not flag missing processing documents.`;
    return { system: GATEWAY_SYSTEM, user };
  }

  const user = `Perform a full processing-account underwriting review. Behave like an auditor: decisive but falsifiable. NEVER imply you verified something you did not.

═══ GUARDRAILS ═══
EVIDENCE LABELING: Label every key claim as Observed, Verified via public lookup, Inferred, or Unverified.
PII MASKING: Never repeat full EIN, SSN, DOB, or bank account numbers. Mask to last 4 digits only.
TRUTHFULNESS: Unless you have formal TIN-matching capability, say "EIN coherence check: passed/failed" — never claim you "verified the EIN with the IRS". If a registry check cannot be performed, label entity status "Unverified".

═══ REQUIRED DOCUMENTS ═══
${docCheck}

FOUNDATION TIER NOTE (monthly volume ≤ $${threshold.toLocaleString("en-US")}):
If stated/projected monthly volume is ≤ $${threshold.toLocaleString("en-US")}, ${bankMonths} months of processing/transaction history is NOT strictly required — treat missing processing history as an informational note, not a red flag, hard stop, or score deduction. All other required documents still apply.

═══ DIMENSION 1: DOCUMENT SCRUTINY ═══
- Formation Document: parse legal entity name, formation state, filing date, entity/file number, registered agent, principal address; cross-check against state registry if possible.
- EIN / Tax Document (CP 575, 147C, SS-4, W-9): extract EIN (masked), legal name, address; cross-check across docs.
- Voided Check / Bank Letter: ties account holder name to account/routing; check routing vs Fed directory if possible.
- Bank Statements (min ${bankMonths} months): coherence, recency/coverage, tamper indicators. Strong tamper indicators → escalate, don't conclude fraud.
- Owner ID (Passport/Drivers License): MANDATORY KYC/CDD. Verify identity matches principal owner.
- Cross-document consistency and classification issues.

═══ DIMENSION 2: WEBSITE SCRUTINY (Card-Not-Present) ═══
Identity/contactability; policy disclosures (refund/return/cancel/shipping, terms/privacy, accessible before checkout); HTTPS/TLS; business-model consistency; domain maturity (ICANN/Wayback); Safe Browsing reputation.

═══ DIMENSION 3: APPLICATION DETAIL ═══
Transaction mix (must total 100% and match model/website); business description vs website; recommend the MOST APPROPRIATE MCC with rationale; volume plausibility; customer mix.

═══ DIMENSION 4: SCREENING & COMPLIANCE ═══
OFAC screen legal name, DBA, principal owner(s). ANY match/near-match = CRITICAL hard stop. VMSS/MATCH: mark "Not run — programme access required" if unavailable.

═══ DIMENSION 5: HIGH-RISK MCC ═══
Flag if recommended MCC is high-risk (5962-5969 Direct Marketing, 6051 Money Services, 7801-7802/7995 Gambling, 7273 Dating, 4816 Computer Network Services, 5122 Drugs/Pharma) requiring reserves/delayed funding/enhanced monitoring.

═══ SCORING (0–100) ═══
- Entity & ownership verification (0–20)
- Tax identity coherence (0–10)
- Bank settlement proof (0–20)
- Financial evidence & capacity (0–15)
- Website transparency & dispute-risk controls (0–20)
- Screening & compliance (0–10)
- Document integrity & internal consistency (0–5)

HARD-STOP OVERRIDES: sanctions probable match; VMSS/MATCH adverse; entity not found/dissolved; material tampering.

═══ PUBLIC CHECKS PERFORMED ═══
List each considered check and outcome (state registry, OFAC, ICANN, Fed routing, Wayback, Safe Browsing) — "Not performed" with reason where applicable.

═══ VALIDITY CONCLUSION ═══
Categorical: "likely_valid", "inconclusive", or "likely_invalid" with confidence and justification.

${context}

Call the "underwriting_review_report" function with your complete analysis. Label evidence. Include score breakdown, hard stops, public checks, and validity conclusion.`;
  return { system: PROCESSING_SYSTEM, user };
}
