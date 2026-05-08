// MerchantHaus quote-line schedule.
// Each line item carries the underlying cost, suggested markup, and resale.
// Defaults match the Fee & Margin Schedule (Pricing.pdf) and are EDITABLE
// in the Quote Generator UI before sending the quote.

import type { TierId } from "./pricing";

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
    id: "level_iii",
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

/** Standard quote disclaimers shown in the preview/PDF and required for acceptance. */
export const QUOTE_DISCLAIMERS = [
  "Quote valid for thirty (30) (30) days from the date of issue. All pricing subject to underwriting approval.",
  "The Monthly Cost is a fixed Flat Rate predicated on the transaction volumes and business model represented by Merchant as of the quote date. Provider reserves the right to review and renegotiate the Monthly Cost on thirty (30) days' written notice if processing volume materially changes (e.g., exceeds 50% of disclosed figures) or if the nature of business changes materially.",
  "This flat rate applies strictly to MerchantHaus Gateway Services and does not replace or fix the interchange and processing rates charged by the Merchant's processor.",
  "Per-event and per-transaction fees apply where listed in addition to monthly platform fees.",
  "Acceptance of this quote constitutes Merchant's agreement to the MerchantHaus Gateway Platform & Services Agreement, including the General Terms & Conditions (Indemnification, Limitation of Liability, Arbitration, Confidentiality, PCI DSS, and Term & Termination) attached as Appendix A.",
  "Initial term: twelve (12) months. Merchant may terminate with thirty (30) days' written notice.",
];

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
    email: "sales@merchanthaus.io",
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
