// MerchantHaus gateway pricing — tier definitions + Fee & Margin Schedule.
// Suggested prices come from the internal Fee & Margin Schedule (Pricing.pdf).

export type TierId = "foundation" | "growth" | "scale" | "enterprise";

export interface PricingTier {
  id: TierId;
  name: string;
  tagline: string;
  monthlyPrice: number | null; // null = custom / contact sales
  annualPrice: number | null;  // 17% off monthly when populated
  popular?: boolean;
  customPriceLabel?: string;
  ctaLabel: string;
  included: string[];
  excluded: string[];
  // Bundled features at no extra cost — used by the quote generator to
  // exclude already-bundled add-ons from the optional list.
  bundledAddOnIds: AddOnId[];
}

export type AddOnId =
  | "mobile_device"
  | "txt2pay_monthly"
  | "card_updater_monthly"
  | "customer_token_vault_monthly"
  | "customer_vault_monthly"
  | "fraud_prevention_monthly"
  | "kount_monthly"
  | "level_iii_monthly"
  | "shopify_monthly";

export interface AddOn {
  id: AddOnId;
  label: string;
  /** Recurring monthly price suggested in the Fee & Margin Schedule. */
  monthly: number;
  /** Optional per-event/per-transaction passthrough fee. */
  perEvent?: { label: string; amount: number };
  /** Short merchant-facing description. */
  description: string;
}

export const ADD_ONS: AddOn[] = [
  {
    id: "mobile_device",
    label: "Mobile Payment Gateway Device",
    monthly: 10,
    description: "Hardware fee for mobile card-present acceptance.",
  },
  {
    id: "txt2pay_monthly",
    label: "TXT2PAY (SMS Billing)",
    monthly: 10,
    perEvent: { label: "per conversation", amount: 0.3 },
    description: "Send pay-by-text payment links to customers.",
  },
  {
    id: "card_updater_monthly",
    label: "Automatic Card Updater",
    monthly: 10,
    perEvent: { label: "per update event", amount: 0.4 },
    description: "Refreshes saved cards to reduce involuntary churn.",
  },
  {
    id: "customer_token_vault_monthly",
    label: "Customer Token Vault (Network Tokens)",
    monthly: 27.5,
    perEvent: { label: "per token lifecycle event", amount: 0.3 },
    description: "Network-token upgrade — higher auth rates and PCI scope reduction.",
  },
  {
    id: "customer_vault_monthly",
    label: "Customer Vault",
    monthly: 17.5,
    perEvent: { label: "per vault event", amount: 0.25 },
    description: "Secure storage for recurring billing tokens.",
  },
  {
    id: "fraud_prevention_monthly",
    label: "Basic Fraud Prevention",
    monthly: 10,
    perEvent: { label: "per fraud event", amount: 0.15 },
    description: "Velocity, AVS/CVV, and rule-based filtering.",
  },
  {
    id: "kount_monthly",
    label: "Kount AI Fraud Manager",
    monthly: 22.5,
    perEvent: { label: "per Kount event", amount: 0.2 },
    description: "AI-powered decisioning and chargeback defense.",
  },
  {
    id: "level_iii_monthly",
    label: "Level III Data Optimization",
    monthly: 50,
    perEvent: { label: "per Level III txn", amount: 0.5 },
    description: "B2B/B2G interchange optimization for commercial cards.",
  },
  {
    id: "shopify_monthly",
    label: "Shopify Premium Integration",
    monthly: 20,
    description: "Shopify gateway connector + reporting (plus 0.75–1% % fee).",
  },
];

export const TIERS: PricingTier[] = [
  {
    id: "foundation",
    name: "Foundation",
    tagline: "Essential fraud-first platform for growing organizations",
    monthlyPrice: 59,
    annualPrice: 49,
    ctaLabel: "Get Started",
    included: [
      "Network Tokens (Customer Token Vault)",
      "Customer Vault secure storage",
      "Basic Fraud Prevention engine",
      "Mobile Payment Gateway device",
      "TXT2PAY billing tools",
      "Automatic Card Updater",
      "Standard dashboard & reporting",
      "Email support",
    ],
    excluded: [
      "AI-powered fraud scoring (Kount)",
      "Level III data optimization",
      "Shopify premium integration",
      "Priority support",
      "API access",
      "Dedicated account manager",
      "White-label options",
    ],
    bundledAddOnIds: [
      "customer_token_vault_monthly",
      "customer_vault_monthly",
      "fraud_prevention_monthly",
      "mobile_device",
      "txt2pay_monthly",
      "card_updater_monthly",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Advanced fraud protection with AI decisioning",
    monthlyPrice: 99,
    annualPrice: 82,
    popular: true,
    ctaLabel: "Get Started",
    included: [
      "Everything in Foundation",
      "Kount AI Fraud Manager",
      "Enhanced rule-based risk controls",
      "Priority support",
      "API access",
    ],
    excluded: [
      "Level III data optimization",
      "Shopify premium integration",
      "Dedicated account manager",
      "White-label options",
    ],
    bundledAddOnIds: [
      "customer_token_vault_monthly",
      "customer_vault_monthly",
      "fraud_prevention_monthly",
      "mobile_device",
      "txt2pay_monthly",
      "card_updater_monthly",
      "kount_monthly",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "Full fraud suite + advanced data optimization",
    monthlyPrice: 149,
    annualPrice: 124,
    ctaLabel: "Get Started",
    included: [
      "Everything in Growth",
      "Level III Advantage (B2B optimization)",
      "Shopify Integration",
      "Custom analytics & reporting",
      "Dedicated account manager",
      "White-label options",
    ],
    excluded: [],
    bundledAddOnIds: [
      "customer_token_vault_monthly",
      "customer_vault_monthly",
      "fraud_prevention_monthly",
      "mobile_device",
      "txt2pay_monthly",
      "card_updater_monthly",
      "kount_monthly",
      "level_iii_monthly",
      "shopify_monthly",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Bespoke solutions for high-volume organizations",
    monthlyPrice: null,
    annualPrice: null,
    customPriceLabel: "Custom",
    ctaLabel: "Contact Sales",
    included: [
      "Everything in Scale",
      "Custom Fraud Rulesets",
      "SLA performance guarantees",
      "Multi-entity & Org management",
      "Dedicated engineering support",
      "Volume-based processing rates",
      "Tailored implementation",
    ],
    excluded: [],
    bundledAddOnIds: [
      "customer_token_vault_monthly",
      "customer_vault_monthly",
      "fraud_prevention_monthly",
      "mobile_device",
      "txt2pay_monthly",
      "card_updater_monthly",
      "kount_monthly",
      "level_iii_monthly",
      "shopify_monthly",
    ],
  },
];

export const ANNUAL_DISCOUNT_LABEL = "Save 17%";

export const getTier = (id: TierId): PricingTier =>
  TIERS.find((t) => t.id === id) ?? TIERS[0];

export const getAddOn = (id: AddOnId): AddOn =>
  ADD_ONS.find((a) => a.id === id) ?? ADD_ONS[0];
