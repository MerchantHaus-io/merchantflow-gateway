// Field definitions for the public Payments & Gateway Scoping Form (/scoping).
// Shared by the public form, its review step, and the internal detail view in
// /admin/web-submissions so labels and grouping never drift apart.

export type ScopingFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "multi";

export interface ScopingField {
  key: string;
  label: string;
  type: ScopingFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: string[];
}

export interface ScopingSection {
  key: string;
  label: string;
  /** Optional sub-group divider shown before this field inside the step. */
  fields: ScopingField[];
}

export const SCOPING_SECTIONS: ScopingSection[] = [
  {
    key: "business",
    label: "Business Profile",
    fields: [
      { key: "legal_business_name", label: "Legal business name", type: "text", required: true, placeholder: "Acme Holdings LLC" },
      { key: "dba_name", label: "DBA / trading name", type: "text", placeholder: "Acme Supply Co" },
      { key: "entity_type", label: "Entity type", type: "select", options: ["Sole Proprietor", "LLC", "Corporation", "Partnership", "Non-Profit", "Other"] },
      { key: "state_of_incorporation", label: "State of incorporation", type: "text", placeholder: "Delaware" },
      { key: "years_in_operation", label: "Years in operation", type: "text", placeholder: "4" },
      { key: "employee_count", label: "Employee count", type: "text", placeholder: "12" },
      { key: "website_url", label: "Website", type: "text", placeholder: "https://" },
      { key: "business_address_line1", label: "Business address", type: "text", placeholder: "Street address" },
      { key: "business_city", label: "City", type: "text" },
      { key: "business_state", label: "State", type: "text" },
      { key: "business_zip", label: "ZIP", type: "text" },
      { key: "contact_first_name", label: "Contact first name", type: "text", required: true },
      { key: "contact_last_name", label: "Contact last name", type: "text", required: true },
      { key: "contact_title", label: "Contact title", type: "text", placeholder: "Owner, CFO…" },
      { key: "contact_email", label: "Contact email", type: "email", required: true, placeholder: "name@company.com" },
      { key: "contact_phone", label: "Contact phone", type: "phone", required: true, placeholder: "(555) 123-4567" },
      { key: "technical_contact_name", label: "Technical contact name", type: "text" },
      { key: "technical_contact_email", label: "Technical contact email", type: "email" },
      {
        key: "foreign_ownership",
        label: "Any owner with 25%+ beneficial interest based outside the United States?",
        type: "select",
        options: ["No", "Yes", "Unsure"],
      },
    ],
  },
  {
    key: "products",
    label: "Products & Processing",
    fields: [
      { key: "product_description", label: "What do you sell?", type: "textarea", required: true, placeholder: "Describe your products or services, and how customers buy them." },
      { key: "industry_vertical", label: "Industry / vertical", type: "text" },
      { key: "estimated_mcc", label: "Estimated MCC (if known)", type: "text", placeholder: "5999" },
      {
        key: "fulfilment_timeframe",
        label: "Fulfilment timeframe",
        type: "select",
        options: ["Immediate/digital", "0–7 days", "8–14 days", "15–30 days", "30+ days", "Milestone or staged", "Ongoing subscription", "Deposit then balance"],
      },
      { key: "refund_policy_summary", label: "Refund policy summary", type: "textarea" },
      { key: "typical_refund_rate", label: "Typical refund rate", type: "text", placeholder: "e.g. 2%" },
      {
        key: "restricted_verticals",
        label: "Do any of these apply?",
        type: "multi",
        hint: "Not disqualifying — it just routes you to the right sponsor bank.",
        options: ["Firearms/ammo", "CBD or hemp", "Nutraceuticals", "Adult", "Gaming/gambling", "Crypto", "Debt relief/credit repair", "Travel or ticketing", "Tobacco/vape", "Telemedicine", "Multi-level marketing", "None of these"],
      },
      {
        key: "currently_processing",
        label: "Are you currently processing card payments?",
        type: "select",
        options: ["Yes — currently live", "Previously, not now", "No — first-time merchant"],
      },
      { key: "current_processor", label: "Current processor", type: "text" },
      { key: "current_effective_rate", label: "Current effective rate", type: "text", placeholder: "e.g. 3.1%" },
      { key: "contract_end_date", label: "Contract end date", type: "text", placeholder: "MM/YYYY" },
      { key: "monthly_volume", label: "Monthly card volume", type: "number", placeholder: "150000" },
      { key: "monthly_transaction_count", label: "Monthly transaction count", type: "number", placeholder: "1200" },
      { key: "average_ticket", label: "Average ticket", type: "number", placeholder: "125" },
      { key: "highest_ticket", label: "Highest ticket", type: "number", placeholder: "5000" },
      { key: "projected_volume_12mo", label: "Projected volume (next 12 months)", type: "number" },
      { key: "seasonal_peak_months", label: "Seasonal peak months", type: "text", placeholder: "Nov–Jan" },
      {
        key: "channel_mix",
        label: "Channel mix",
        type: "multi",
        options: ["Card-not-present/online", "Card-present/in-store", "MOTO", "Recurring/subscription", "Invoicing/pay-by-link", "Mobile/field sales"],
      },
      { key: "channel_split_notes", label: "Channel split notes", type: "text", placeholder: "e.g. 70% online / 30% in-store" },
      { key: "chargeback_count_12mo", label: "Chargebacks in last 12 months", type: "number" },
      { key: "chargeback_ratio", label: "Chargeback ratio", type: "text", placeholder: "e.g. 0.4%" },
      { key: "prior_terminations", label: "Prior terminations, MATCH/TMF listings or declines", type: "textarea", hint: "Disclose upfront — it is far easier to underwrite around than to discover later." },
    ],
  },
  {
    key: "technical",
    label: "Payment Methods & Technical",
    fields: [
      {
        key: "payment_methods",
        label: "Payment methods needed",
        type: "multi",
        options: ["Visa/Mastercard", "American Express", "Discover", "PIN debit", "ACH/eCheck", "Apple Pay", "Google Pay", "Click to Pay", "PayPal/Venmo", "Buy now pay later", "Level II/Level III data", "Surcharging or cash discount"],
      },
      {
        key: "currency_geography",
        label: "Currency & geography",
        type: "multi",
        options: ["USD only", "Multi-currency", "US customers only", "International customers"],
      },
      { key: "storefront_platform", label: "Storefront / platform", type: "text", placeholder: "Shopify, WooCommerce, custom…" },
      { key: "crm_or_erp", label: "CRM or ERP", type: "text" },
      { key: "accounting_system", label: "Accounting system", type: "text" },
      {
        key: "integration_route",
        label: "Preferred integration route",
        type: "multi",
        options: ["Hosted payment page", "Embedded fields/Collect.js", "Direct API", "Plugin or cart extension", "Virtual terminal only", "Countertop/POS terminal", "Mobile SDK", "Not sure — advise us"],
      },
      {
        key: "gateway_capabilities",
        label: "Gateway capabilities required",
        type: "multi",
        options: ["Tokenisation/customer vault", "Recurring billing engine", "Multi-MID routing", "3-D Secure/SCA", "Webhooks/callbacks", "Batch upload", "Split or partial capture", "Pre-auth then capture", "Automated retries/dunning", "Fraud filter rules", "Reporting API", "User roles & permissions"],
      },
      { key: "has_developer_resource", label: "Developer resource available?", type: "select", options: ["Yes", "No", "Contractor"] },
      { key: "terminal_count", label: "Number of terminals needed", type: "number" },
      { key: "location_mid_count", label: "Number of locations / MIDs", type: "number" },
      { key: "unusual_flow_notes", label: "Unusual flows", type: "textarea", hint: "Marketplaces, split payouts, third-party billing, franchise structures, existing tokens to migrate." },
    ],
  },
  {
    key: "risk",
    label: "Risk & Compliance",
    fields: [
      {
        key: "pci_status",
        label: "PCI DSS status",
        type: "select",
        options: ["SAQ A", "SAQ A-EP", "SAQ D", "Level 1/RoC", "Not yet assessed", "Need guidance"],
      },
      {
        key: "data_collected",
        label: "Which of these does your business collect or store?",
        type: "multi",
        hint: "If you collect SSN or ID documents, we will scope a vaulted approach rather than direct storage. Do not enter any of this data on this form.",
        options: ["Card data at rest", "Bank account details", "SSN/tax ID", "Government ID images", "Health information", "None of these"],
      },
      { key: "existing_fraud_tooling", label: "Existing fraud tooling", type: "text" },
      { key: "chargeback_management_provider", label: "Chargeback management provider", type: "text" },
    ],
  },
  {
    key: "funding",
    label: "Funding, Timeline & Decision",
    fields: [
      { key: "funding_timeline", label: "Funding timeline needed", type: "select", options: ["Next day", "Next day + cutoff", "2-day standard", "Same-day where eligible"] },
      { key: "deposit_structure", label: "Deposit structure", type: "select", options: ["Single settlement account", "Split by location", "Split by entity", "Third-party payouts"] },
      { key: "reconciliation_owner", label: "Who owns reconciliation?", type: "text" },
      { key: "reporting_frequency", label: "Reporting frequency", type: "text", placeholder: "Daily, weekly, monthly" },
      { key: "reporting_requirements", label: "Reporting requirements", type: "textarea" },
      { key: "target_go_live_date", label: "Target go-live date", type: "date" },
      { key: "hard_deadline_reason", label: "Reason for any hard deadline", type: "text" },
      { key: "process_stage", label: "Where are you in the process?", type: "select", options: ["Exploring options", "Comparing quotes", "Ready to move", "Renewal or contract expiry"] },
      { key: "decision_makers", label: "Who is involved in the decision?", type: "multi", options: ["Owner/founder", "CFO or finance", "CTO or engineering", "Procurement", "Board approval"] },
      { key: "other_providers_evaluated", label: "Other providers being evaluated", type: "text" },
      { key: "budget_expectation", label: "Budget expectation", type: "text" },
      { key: "additional_notes", label: "Anything else we should know?", type: "textarea" },
    ],
  },
];

export const SCOPING_MULTI_FIELDS = SCOPING_SECTIONS.flatMap((s) =>
  s.fields.filter((f) => f.type === "multi").map((f) => f.key),
);

export const SCOPING_REQUIRED_FIELDS = [
  ...SCOPING_SECTIONS.flatMap((s) => s.fields.filter((f) => f.required).map((f) => f.key)),
  "acknowledgement_name",
];

export const SCOPING_DISCLOSURES: { heading: string; body: string }[] = [
  {
    heading: "NOT AN APPLICATION",
    body: "This document is a requirements questionnaire only. It is not an application for merchant services, not a request for credit, and does not create any agreement, obligation, offer or commitment between you and Merchant Haus LLC. Completing it does not guarantee that an account will be offered or approved.",
  },
  {
    heading: "ROLE OF MERCHANT HAUS",
    body: "Merchant Haus LLC is an independent sales organisation and authorised agent. It is not a bank, does not hold or settle funds, and does not extend credit. Payment processing and settlement are provided by sponsoring banks, processors and gateway providers under separate agreements entered into directly with you.",
  },
  {
    heading: "APPROVAL & UNDERWRITING",
    body: "Any merchant account or gateway access is subject to approval by the sponsoring bank and processor and remains subject to their underwriting criteria, applicable card brand and network rules, and ongoing risk review. Approved terms — including reserves, funding timing, volume caps and pricing — may differ from anything discussed at scoping stage, and accounts may be amended, suspended or closed in accordance with those agreements.",
  },
  {
    heading: "INDICATIVE PRICING ONLY",
    body: "Any rates, fees, timelines or structures discussed following this form are estimates based solely on the information you supply and are not an offer. Binding pricing and terms appear only in an executed merchant agreement. Volumes, averages and projections you state here are estimates and are not binding on either party.",
  },
  {
    heading: "ACCURACY OF INFORMATION",
    body: "You confirm that the information provided is accurate and complete to the best of your knowledge. Material omissions or inaccuracies — particularly regarding beneficial ownership, prior terminations, MATCH or Terminated Merchant File listings, chargeback history, or restricted products and services — may result in a declined application, or in closure of an account after it has been opened.",
  },
  {
    heading: "SENSITIVE DATA",
    body: "Do not enter full payment card numbers, bank account or routing numbers, Social Security or taxpayer identification numbers for individuals, or images of government identification on this form. Where such information is required at application stage it will be collected through a secure, purpose-built channel.",
  },
  {
    heading: "CONFIDENTIALITY & USE",
    body: "Information you provide is used solely to assess your payment processing requirements and to prepare a proposal. It may be shared with sponsoring banks, processors and gateway providers for that purpose. It is not sold, and is not used for unrelated marketing. Records are retained only as long as necessary for that purpose or as required by applicable law and network rules.",
  },
  {
    heading: "CONSENT TO CONTACT",
    body: "By providing contact details you agree that Merchant Haus may contact you at the email address and telephone number given in connection with this enquiry. You may withdraw that consent at any time by replying to any message or writing to sales@merchanthaus.io.",
  },
  {
    heading: "ELECTRONIC TRANSMISSION",
    body: "Information submitted through this form is transmitted over an encrypted connection. Do not send supplementary sensitive information by unsecured email.",
  },
  {
    heading: "NO PROFESSIONAL ADVICE",
    body: "Any guidance provided in connection with this form regarding PCI DSS scope, card brand rules, tax or regulatory obligations is general information only and does not constitute legal, accounting, tax or compliance advice. Responsibility for PCI DSS validation and for compliance with applicable law rests with the merchant.",
  },
];

export const SCOPING_CAUTION =
  "Please do not enter full card numbers, bank account or routing numbers, Social Security numbers, or images of government ID anywhere on this form. If we need any of that later, we will request it through a secure channel.";

export const SCOPING_ACK_TEXT =
  "I confirm that the information provided is accurate and complete to the best of my knowledge, that I am authorised to provide it on behalf of the business named above, and that I have read the disclosures above.";

/** Public URL for the scoping form, optionally scoped to an opportunity. */
export function scopingLink(oppId?: string | null): string {
  const base = "https://ops-terminal.merchant.haus/scoping";
  return oppId ? `${base}?opp_id=${oppId}` : base;
}
