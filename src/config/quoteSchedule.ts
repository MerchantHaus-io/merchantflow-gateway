// MerchantHaus quote-line schedule.
// Each line item carries the underlying cost, suggested markup, and resale.
// Defaults match the Fee & Margin Schedule (Pricing.pdf) and are EDITABLE
// in the Quote Generator UI before sending the quote.

import type { TierId, GatewayFeeId } from "./pricing";

export interface QuoteLineDefault {
  /** Stable id used as form key. */
  id: string;
  label: string;
  /** Internal cost ($/month or $/event). */
  cost: number;
  /** Suggested resale to merchant. */
  resale: number;
  /** Optional per-event/per-transaction passthrough. */
  perEvent?: {
    label: string;
    cost: number;
    resale: number;
  };
  /** Plans that bundle this line by default (no extra cost to merchant). */
  bundledIn: TierId[];
  description: string;
}

/** Suggested base monthly platform fee per tier (matches src/config/pricing.ts). */
export const TIER_PLATFORM_FEE: Record<TierId, { cost: number; resale: number }> = {
  foundation: { cost: 25, resale: 59 },
  growth:     { cost: 40, resale: 99 },
  scale:      { cost: 65, resale: 149 },
  enterprise: { cost: 95, resale: 249 }, // editable; "Custom" by default in UI
};

/**
 * Configurable core gateway fees — a monthly gateway authentication/access fee
 * and a per-transaction (per-authorization) fee. Both are opt-in: off by
 * default on a new quote and toggled on + edited per quote in the generator.
 * Suggested amounts track the NMI Schedule A economics referenced below.
 */
export interface GatewayFeeDefault {
  id: GatewayFeeId;
  label: string;
  description: string;
  /** Internal cost. $/month for monthly cadence, $/txn for per_transaction. */
  cost: number;
  /** Suggested resale to merchant (same unit as cost). */
  resale: number;
  cadence: "monthly" | "per_transaction";
  /** Opt-in default — false means the rep must enable it per quote. */
  enabledByDefault: boolean;
}

export const GATEWAY_FEE_DEFAULTS: GatewayFeeDefault[] = [
  {
    id: "gateway_auth",
    label: "Gateway Auth Fee",
    description:
      "Monthly gateway authentication & access fee (NMI gateway monthly).",
    cost: 5,
    resale: 10,
    cadence: "monthly",
    enabledByDefault: false,
  },
  {
    id: "per_transaction",
    label: "Per-Transaction Fee",
    description:
      "Per-authorization gateway transaction fee, billed on actual volume.",
    cost: 0.3,
    resale: 0.3,
    cadence: "per_transaction",
    enabledByDefault: false,
  },
];

/**
 * Optional one-time activation fee. Off by default. When charged, the quote
 * renders a Payment Instructions block (receiving-bank details come from
 * src/config/paymentInstructions.ts — never hardcoded here).
 */
export interface ActivationFeeDefault {
  label: string;
  description: string;
  amount: number;
  cadence: "one_time";
}

export const ACTIVATION_FEE_DEFAULT: ActivationFeeDefault = {
  label: "Gateway Activation Fee",
  description:
    "One-time gateway activation. The gateway account is activated upon receipt of payment.",
  amount: 0,
  cadence: "one_time",
};

export const QUOTE_LINES: QuoteLineDefault[] = [
  {
    id: "mobile_device",
    label: "iProcess Mobile Payments (per device)",
    cost: 2.5,
    resale: 10,
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Swiped/dipped/keyed mobile acceptance via card reader. NMI partner cost $2.50/mo/device.",
  },
  {
    id: "cloud_device",
    label: "Customer-Present Cloud Device (EMV/Contactless)",
    cost: 8,
    resale: 20,
    bundledIn: [],
    description: "Cloud-connected POS hardware for in-person EMV/contactless. NMI partner cost $8.00/mo/device.",
  },
  {
    id: "tap_to_pay",
    label: "Tap to Pay (mobile contactless)",
    cost: 0,
    resale: 0,
    perEvent: { label: "per Tap to Pay txn", cost: 0.10, resale: 0.25 },
    bundledIn: [],
    description: "Turn mobile devices into contactless payment terminals. NMI partner cost $0.10/txn.",
  },
  {
    id: "txt2pay",
    label: "Pay via Text (TXT2PAY)",
    cost: 5,
    resale: 10,
    perEvent: { label: "per conversation", cost: 0.18, resale: 0.30 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Pay-by-text payment links. NMI partner cost $5/mo + $0.18/txn.",
  },
  {
    id: "electronic_invoicing",
    label: "Electronic Invoicing",
    cost: 5,
    resale: 10,
    perEvent: { label: "per invoice create/edit/delete", cost: 0.05, resale: 0.15 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Digital invoices with embedded payment links. NMI partner cost $5/mo + $0.05/event.",
  },
  {
    id: "card_updater",
    label: "Automatic Card Updater",
    cost: 5,
    resale: 10,
    perEvent: { label: "per update event", cost: 0.20, resale: 0.40 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Refreshes saved cards to reduce involuntary churn.",
  },
  {
    id: "customer_token_vault",
    label: "Customer Token Vault (Network Tokens)",
    cost: 15,
    resale: 27.5,
    perEvent: { label: "per token lifecycle event", cost: 0.15, resale: 0.30 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Network-token upgrade — higher auth rates and PCI scope reduction.",
  },
  {
    id: "customer_vault",
    label: "Customer Vault",
    cost: 8,
    resale: 17.5,
    perEvent: { label: "per vault event", cost: 0.08, resale: 0.25 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Secure storage for recurring billing tokens.",
  },
  {
    id: "fraud_prevention",
    label: "Basic Fraud Prevention",
    cost: 5,
    resale: 10,
    perEvent: { label: "per fraud event", cost: 0.05, resale: 0.15 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Velocity, AVS/CVV, and rule-based filtering.",
  },
  {
    id: "kount",
    label: "Kount AI Fraud Manager",
    cost: 7,
    resale: 22.5,
    perEvent: { label: "per Kount event", cost: 0.07, resale: 0.20 },
    bundledIn: ["growth", "scale", "enterprise"],
    description: "AI-powered decisioning and chargeback defense.",
  },
  {
    id: "level_iii",
    label: "Level III Data Optimization",
    cost: 25,
    resale: 50,
    perEvent: { label: "per Level III txn", cost: 0.25, resale: 0.50 },
    bundledIn: ["scale", "enterprise"],
    description: "B2B/B2G interchange optimization for commercial cards.",
  },
  {
    id: "payer_authentication",
    label: "Payer Authentication (3DS)",
    cost: 9,
    resale: 19,
    perEvent: { label: "per 3DS txn", cost: 0.09, resale: 0.20 },
    bundledIn: [],
    description: "3D Secure liability shift on card-not-present. NMI partner cost $9/mo + $0.09/txn.",
  },
  {
    id: "level_3_advantage",
    label: "Level 3 Advantage",
    cost: 25,
    resale: 50,
    perEvent: { label: "per Level III txn", cost: 0.25, resale: 0.50 },
    bundledIn: ["scale", "enterprise"],
    description: "B2B/B2G interchange optimization. NMI partner: $25 setup + $25/mo + $0.25/txn.",
  },
  {
    id: "shopify",
    label: "Shopify Integration",
    cost: 10,
    resale: 20,
    perEvent: { label: "% of Shopify txn volume", cost: 0.0035, resale: 0.0075 },
    bundledIn: ["scale", "enterprise"],
    description: "Shopify gateway connector. NMI partner: $10/mo + 0.35% per txn.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// NMI All-in-One Plan — Schedule A reference (effective 2025-11-14)
// Source: signed NMI proposal for merchanthaus.io. These are the underlying
// partner economics MerchantHaus inherits when reselling NMI processing.
// ───────────────────────────────────────────────────────────────────────────

export interface NMIScheduleARate {
  name: string;
  value: string;
  note?: string;
}

export const NMI_SCHEDULE_A_RATES: NMIScheduleARate[] = [
  { name: "Revenue Share to MerchantHaus", value: "30.00%" },
  { name: "Sales Volume Rate — Card Present", value: "2.90%" },
  { name: "Sales Volume Rate — Card Not Present", value: "3.40%" },
  { name: "Sales Volume Rate — ACH", value: "0.80%" },
  { name: "Per Authorization Fee", value: "$0.30 / txn" },
  { name: "Per ACH Fee", value: "$0.50 / txn" },
];

export interface NMIFeeRow {
  label: string;
  partner: string;
  merchant: string;
  category: "per_occurrence" | "monthly" | "one_time";
  revenueEligible: boolean;
}

export const NMI_REVENUE_ELIGIBLE_FEES: NMIFeeRow[] = [
  { label: "Voice Authorization Fee", partner: "$0.45", merchant: "$0.95", category: "per_occurrence", revenueEligible: true },
  { label: "Chargeback Fee", partner: "$15.00", merchant: "$25.00", category: "per_occurrence", revenueEligible: true },
  { label: "Retrieval Fee", partner: "$5.00", merchant: "$10.00", category: "per_occurrence", revenueEligible: true },
  { label: "Batch Fee", partner: "$0.05", merchant: "$0.25", category: "per_occurrence", revenueEligible: true },
  { label: "Address Verification Fee (AVS)", partner: "$0.05", merchant: "$0.07", category: "per_occurrence", revenueEligible: true },
  { label: "ACH Transaction Fee", partner: "$0.20", merchant: "$0.50", category: "per_occurrence", revenueEligible: true },
  { label: "Monthly Fee", partner: "$5.00", merchant: "$10.00", category: "monthly", revenueEligible: true },
  { label: "Monthly Breach Protection Fee", partner: "$2.50", merchant: "$7.95", category: "monthly", revenueEligible: true },
  { label: "Annual PCI Fee", partner: "—", merchant: "$99.00", category: "monthly", revenueEligible: true },
  { label: "Annual Fee", partner: "—", merchant: "$99.00", category: "monthly", revenueEligible: true },
  { label: "Monthly ACH Fee", partner: "$5.00", merchant: "$10.00", category: "monthly", revenueEligible: true },
];

export const NMI_NON_REVENUE_FEES: NMIFeeRow[] = [
  { label: "Breach Monitoring (per sales-volume event)", partner: "$0.45", merchant: "$0.95", category: "per_occurrence", revenueEligible: false },
  { label: "Insufficient Funds Fee", partner: "$15.00", merchant: "$25.00", category: "per_occurrence", revenueEligible: false },
  { label: "PCI Non-Compliance Fee", partner: "$5.00", merchant: "$24.95", category: "per_occurrence", revenueEligible: false },
  { label: "ACH NOC / Return Fee", partner: "$2.00", merchant: "$2.00", category: "per_occurrence", revenueEligible: false },
  { label: "ACH Premium Fee (txns > $35,000)", partner: "$25.00", merchant: "$25.00", category: "per_occurrence", revenueEligible: false },
  { label: "Regulatory / 1099 Fee", partner: "$6.95", merchant: "$6.95", category: "monthly", revenueEligible: false },
  { label: "Monthly Processing Minimum", partner: "$10.00", merchant: "$10.00", category: "monthly", revenueEligible: false },
  { label: "ACH Setup Fee (one-time)", partner: "$25.00", merchant: "$25.00", category: "one_time", revenueEligible: false },
];

export interface NMIGatewayFeature {
  group: string;
  name: string;
  description: string;
  pricing: string;
  partnerCost: string;
}

export const NMI_GATEWAY_FEATURES: NMIGatewayFeature[] = [
  { group: "Digital Billing", name: "Pay via Text", description: "Receive & pay invoices via SMS.", pricing: "$5.00/mo + $0.18/txn", partnerCost: "$5.00/mo + $0.18/txn" },
  { group: "Digital Billing", name: "Electronic Invoicing", description: "Digital invoices with embedded payment links.", pricing: "$5.00/mo + $0.05/event", partnerCost: "$5.00/mo + $0.05/event" },
  { group: "Customer Data", name: "Customer Token Vault", description: "Network-token security for stored payments.", pricing: "$15.00/mo + $0.15/lifecycle event + $0.02/cryptogram", partnerCost: "$15.00/mo + $0.15/event + $0.02/cryptogram" },
  { group: "Customer Data", name: "Customer Vault", description: "Securely store customer payment info.", pricing: "$8.00/mo + $0.08/txn", partnerCost: "$8.00/mo + $0.08/txn" },
  { group: "Customer Data", name: "Automatic Card Updater", description: "Keep stored card data current.", pricing: "$5.00/mo + $0.20/record", partnerCost: "$5.00/mo + $0.20/record" },
  { group: "Fraud & Security", name: "Fraud Prevention", description: "Rule-based velocity / AVS / CVV controls.", pricing: "$5.00/mo + $0.05/txn", partnerCost: "$5.00/mo + $0.05/txn" },
  { group: "Fraud & Security", name: "Kount Advanced Fraud Prevention", description: "AI-powered scoring & decisioning.", pricing: "$7.00/mo + $0.07/txn", partnerCost: "$7.00/mo + $0.07/txn" },
  { group: "Fraud & Security", name: "Payer Authentication (3DS)", description: "3D Secure liability shift on CNP.", pricing: "$9.00/mo + $0.09/txn", partnerCost: "$9.00/mo + $0.09/txn" },
  { group: "In-Person & Mobile", name: "Customer-Present Cloud Device", description: "EMV/contactless via cloud-connected POS.", pricing: "$8.00/mo per device", partnerCost: "$8.00/mo/device" },
  { group: "In-Person & Mobile", name: "iProcess Mobile Payments", description: "Swiped/dipped/keyed via mobile reader.", pricing: "$2.50/mo per device", partnerCost: "$2.50/mo/device" },
  { group: "In-Person & Mobile", name: "Tap to Pay", description: "Contactless on mobile devices.", pricing: "$0.10/txn", partnerCost: "$0.10/txn" },
  { group: "Advanced Processing", name: "Level 3 Advantage", description: "Commercial-card interchange optimization.", pricing: "$25.00 setup + $25.00/mo + $0.25/txn", partnerCost: "$25 setup + $25/mo + $0.25/txn" },
  { group: "eCommerce", name: "Shopify Integration", description: "Shopify storefront/checkout connector.", pricing: "Setup included + $10.00/mo + 0.35%/txn", partnerCost: "$10/mo + 0.35%/txn" },
];

export const NMI_ONE_TIME_FEES: { label: string; amount: string }[] = [
  { label: "Merchant Name Change Fee", amount: "$15.95 / change" },
  { label: "Platform Change Fee", amount: "$15.95 / change" },
  { label: "Bank Account Change Fee", amount: "$15.95 / change" },
  { label: "Account Reactivation Fee", amount: "$25.00 / reactivation" },
  { label: "Hardware Restocking Fee", amount: "25% / return" },
];

// ───────────────────────────────────────────────────────────────────────────
// Ancillary fee defaults — disclosed on every quote even when waived.
// Per Quotes/Contracts/Billing research report: chargebacks, PCI, and setup
// must be explicitly disclosed (never silently embedded in margin or omitted).
// ───────────────────────────────────────────────────────────────────────────

export interface AncillaryFeeDefault {
  id: "chargeback" | "pci" | "setup" | "return_payment";
  label: string;
  description: string;
  amount: number;
  cadence: "per_occurrence" | "monthly" | "annual" | "one_time";
  waivedDescription?: string;
}

export const ANCILLARY_FEE_DEFAULTS: AncillaryFeeDefault[] = [
  {
    id: "chargeback",
    label: "Chargeback Fee",
    description: "Per chargeback or retrieval received, in addition to any network penalty pass-through.",
    amount: 25,
    cadence: "per_occurrence",
    waivedDescription: "Pass-through only — no MerchantHaus markup applied.",
  },
  {
    id: "pci",
    label: "PCI Compliance Fee",
    description: "Annual PCI attestation support, scan management, and compliance tooling.",
    amount: 99,
    cadence: "annual",
    waivedDescription: "Waived — Merchant manages its own PCI attestation.",
  },
  {
    id: "setup",
    label: "Setup & Onboarding Fee",
    description: "One-time gateway provisioning, processor connection, descriptor configuration, and white-glove activation.",
    amount: 0,
    cadence: "one_time",
    waivedDescription: "Waived for this engagement.",
  },
  {
    id: "return_payment",
    label: "Return Payment Fee",
    description: "Per failed ACH debit or returned card-on-file collection attempt.",
    amount: 25,
    cadence: "per_occurrence",
  },
];

/**
 * Standard quote disclaimers shown in the preview/PDF and required for acceptance.
 *
 * Restructured per Quotes/Contracts/Billing report: every recurring fee gets a
 * cadence, every operational control (UTC, dispute window, ACH authority,
 * proration, fee-change, data security, exit) is named, and the "Included vs
 * per-event" ambiguity is resolved up front.
 */
export const QUOTE_DISCLAIMERS = [
  "Quote validity. This quote is valid for thirty (30) days from the date of issue. All pricing is subject to underwriting approval and accurate disclosure of the Merchant's processing profile.",
  "Scope. Pricing covers MerchantHaus Gateway Services only — it does not include, fix, or replace interchange, assessments, scheme fees, or the processing rates charged by the Merchant's acquirer or processor, which are governed by separate agreement.",
  "Bundled vs metered services. Items marked \"Included\" are bundled into the Platform Bundle at no additional charge. Per-event unit prices shown alongside bundled items are informational only and not billed unless the line is configured as metered in the Fee Schedule.",
  "Volume basis. The Platform Bundle price assumes the disclosed monthly volume and average ticket. A sustained deviation of more than fifty percent (50%) over two consecutive months entitles Provider to a pricing review on thirty (30) days' written notice.",
  "Ancillary fees. Chargeback, retrieval, return-payment, and network-penalty items are billed as incurred. PCI and setup fees are billed on the cadence shown in the Fee Schedule. All ancillary fees are disclosed on this quote — no undisclosed fees apply.",
  "Billing cadence. Recurring fees are billed monthly in arrears, computed on UTC calendar boundaries, and debited on the first business day of the following month via ACH. Where accrued ancillary balances exceed $50, Provider may bill more frequently. One-time fees are due on signature or milestone achievement.",
  "Payment method. Merchant authorizes Provider to debit the nominated bank account via ACH for sums due. A card-on-file may be retained as a fallback collection method where ACH fails. ACH authority is captured at acceptance.",
  "Proration. Recurring fees prorate only in the first billing month following activation. One-time and ancillary fees do not prorate.",
  "Fee changes. Provider may amend recurring fees on thirty (30) days' written notice. Third-party pass-through cost changes (interchange, assessments, network penalties) may flow through immediately where mandated externally.",
  "Billing disputes. Merchant must raise billing objections in writing within thirty (30) days of the billing statement date, specifying the disputed line items and grounds. Charges not disputed within this window are deemed accepted.",
  "PCI & data security. Each party shall maintain security measures appropriate to its role under PCI DSS. Merchant remains responsible for its own PCI scope, attestation, and the lawful handling of cardholder and customer data.",
  "Term & termination. Initial term: twelve (12) months from activation, renewing monthly thereafter unless either party gives thirty (30) days' written notice. Provider may suspend or terminate immediately for fraud, excessive chargebacks, regulatory or card-network risk, or non-payment beyond a thirty (30) day cure period.",
  "Data portability on exit. On termination, Provider will cooperate in good faith on orderly wind-down and the return or migration of Merchant data, subject to payment of accrued fees and any agreed migration charges.",
  "Master Agreement. Acceptance of this quote constitutes the Merchant's binding agreement to the MerchantHaus Gateway Platform & Services Agreement (including Indemnification, Limitation of Liability, Arbitration, Confidentiality, and the obligations summarized above) attached or referenced as Appendix A.",
];

/** Terms version string baked into each acceptance audit record. Bump when QUOTE_DISCLAIMERS changes materially. */
export const QUOTE_TERMS_VERSION = "2026.05.26";

/** Roster of MerchantHaus senders that can be selected as "Prepared by".
 *  All fields remain editable in the Quote Generator after selection. */
export interface QuoteSender {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  address: string;
}

const MH_ADDRESS = "1209 Mountain Road Pl NE Ste N, Albuquerque, NM 87110, USA";
const MH_COMPANY = "MerchantHaus LLC";

// Names + emails resolve through the team roster — edit src/config/team.ts to rename.
import { resolveDisplayName as rnq, resolveEmail as req } from "@/config/team";

export const QUOTE_SENDERS: QuoteSender[] = [
  {
    id: "taryn",
    name: rnq("taryn") ?? "Taryn Engledoe",
    title: "Managing Director",
    company: MH_COMPANY,
    email: req("taryn") ?? "taryn@merchanthaus.io",
    phone: "+1 (505) 600-6042",
    address: MH_ADDRESS,
  },
  {
    id: "jamie",
    name: rnq("jamie") ?? "Jamie",
    title: "Partner",
    company: MH_COMPANY,
    email: req("jamie") ?? "jamie@merchanthaus.io",
    phone: "",
    address: MH_ADDRESS,
  },
  {
    id: "darryn",
    name: rnq("darryn") ?? "Darryn",
    title: "Partner",
    company: MH_COMPANY,
    email: req("darryn") ?? "admin@merchanthaus.io",
    phone: "",
    address: MH_ADDRESS,
  },
  {
    id: "sheiky",
    name: rnq("yaseen") ?? "Yaseen Sheik",
    title: "Support Lead",
    company: MH_COMPANY,
    email: req("yaseen") ?? "support@merchanthaus.io",
    phone: "",
    address: MH_ADDRESS,
  },
  {
    id: "sales",
    name: "MerchantHaus Sales",
    title: "Sales Team",
    company: MH_COMPANY,
    email: "support@merchanthaus.io",
    phone: "",
    address: MH_ADDRESS,
  },
  {
    id: "custom",
    name: "",
    title: "",
    company: MH_COMPANY,
    email: "",
    phone: "",
    address: MH_ADDRESS,
  },
];

/** Default quote sender — auto-prefilled, editable per quote. */
export const DEFAULT_QUOTE_SENDER = QUOTE_SENDERS[0];
