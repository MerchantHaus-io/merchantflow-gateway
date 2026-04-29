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
    label: "Mobile Payment Gateway Device",
    cost: 2.5,
    resale: 10,
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Per-device fee for mobile card-present acceptance.",
  },
  {
    id: "txt2pay",
    label: "TXT2PAY (SMS Billing)",
    cost: 5,
    resale: 10,
    perEvent: { label: "per conversation", cost: 0.18, resale: 0.30 },
    bundledIn: ["foundation", "growth", "scale", "enterprise"],
    description: "Pay-by-text payment links.",
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
    id: "shopify",
    label: "Shopify Premium Integration",
    cost: 10,
    resale: 20,
    bundledIn: ["scale", "enterprise"],
    description: "Shopify gateway connector + reporting (additional 0.75–1% fee applies).",
  },
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
