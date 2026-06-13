// Catalog of every billable line item available on the gateway schedule —
// used by the invoice / receipt builder so reps can drop any quote-builder
// line straight onto a billing document.
//
// Sources:
//   • TIER_PLATFORM_FEE       — platform bundles per tier
//   • QUOTE_LINES             — NMI gateway features (mobile, vault, fraud, …)
//   • GATEWAY_FEE_DEFAULTS    — gateway auth & per-transaction
//   • ACTIVATION_FEE_DEFAULT  — one-time activation
//   • ANCILLARY_FEE_DEFAULTS  — chargeback / PCI / setup / return payment
//   • NMI_REVENUE_ELIGIBLE_FEES / NMI_NON_REVENUE_FEES — Schedule A pass-throughs
//   • NMI_ONE_TIME_FEES       — name/bank/platform change, restocking, …

import {
  TIER_PLATFORM_FEE,
  QUOTE_LINES,
  GATEWAY_FEE_DEFAULTS,
  ACTIVATION_FEE_DEFAULT,
  ANCILLARY_FEE_DEFAULTS,
  NMI_REVENUE_ELIGIBLE_FEES,
  NMI_NON_REVENUE_FEES,
  NMI_ONE_TIME_FEES,
} from "@/config/quoteSchedule";
import type { TierId } from "@/config/pricing";
import type { BillingDocLine } from "@/lib/billingDocPdf";

export type CatalogGroup =
  | "Platform Bundle"
  | "Gateway Features"
  | "Gateway Core Fees"
  | "Ancillary"
  | "NMI Schedule A — Revenue"
  | "NMI Schedule A — Pass-through"
  | "One-Time Fees"
  | "Custom";

export interface CatalogItem {
  id: string;
  group: CatalogGroup;
  label: string;
  description?: string;
  unit_price: number;
  qty: number;
  cadence?: string;
}

const parseAmount = (raw: string): number => {
  const m = String(raw).replace(/[^0-9.]/g, "");
  return m ? Number(m) : 0;
};

export function buildBillingCatalog(): CatalogItem[] {
  const items: CatalogItem[] = [];

  // Platform bundles (monthly resale)
  (Object.keys(TIER_PLATFORM_FEE) as TierId[]).forEach((tier) => {
    const t = TIER_PLATFORM_FEE[tier];
    items.push({
      id: `tier-${tier}`,
      group: "Platform Bundle",
      label: `${cap(tier)} Platform Bundle`,
      description: "Monthly platform subscription, bundled gateway services included.",
      unit_price: t.resale,
      qty: 1,
      cadence: "monthly",
    });
  });

  // Gateway features (monthly resale; per-event price ignored here — billed via metered usage)
  QUOTE_LINES.forEach((q) => {
    if (q.resale > 0) {
      items.push({
        id: `feat-${q.id}`,
        group: "Gateway Features",
        label: q.label,
        description: q.description,
        unit_price: q.resale,
        qty: 1,
        cadence: "monthly",
      });
    }
    if (q.perEvent) {
      items.push({
        id: `feat-${q.id}-per-event`,
        group: "Gateway Features",
        label: `${q.label} — ${q.perEvent.label}`,
        description: q.description,
        unit_price: q.perEvent.resale,
        qty: 0,
        cadence: "per_event",
      });
    }
  });

  // Core gateway fees
  GATEWAY_FEE_DEFAULTS.forEach((g) => {
    items.push({
      id: `core-${g.id}`,
      group: "Gateway Core Fees",
      label: g.label,
      description: g.description,
      unit_price: g.resale,
      qty: g.cadence === "monthly" ? 1 : 0,
      cadence: g.cadence,
    });
  });

  // Activation
  if (ACTIVATION_FEE_DEFAULT) {
    items.push({
      id: "activation",
      group: "One-Time Fees",
      label: ACTIVATION_FEE_DEFAULT.label,
      description: ACTIVATION_FEE_DEFAULT.description,
      unit_price: ACTIVATION_FEE_DEFAULT.amount,
      qty: 1,
      cadence: "one_time",
    });
  }

  // Ancillary
  ANCILLARY_FEE_DEFAULTS.forEach((a) => {
    items.push({
      id: `anc-${a.id}`,
      group: "Ancillary",
      label: a.label,
      description: a.description,
      unit_price: a.amount,
      qty: a.cadence === "per_occurrence" ? 0 : 1,
      cadence: a.cadence,
    });
  });

  // NMI Schedule A — revenue-eligible
  NMI_REVENUE_ELIGIBLE_FEES.forEach((f, idx) => {
    items.push({
      id: `nmi-rev-${idx}`,
      group: "NMI Schedule A — Revenue",
      label: f.label,
      description: `Merchant rate: ${f.merchant} (partner cost ${f.partner}).`,
      unit_price: parseAmount(f.merchant),
      qty: f.category === "monthly" || f.category === "one_time" ? 1 : 0,
      cadence: f.category,
    });
  });

  // NMI Schedule A — pass-through
  NMI_NON_REVENUE_FEES.forEach((f, idx) => {
    items.push({
      id: `nmi-pass-${idx}`,
      group: "NMI Schedule A — Pass-through",
      label: f.label,
      description: `Merchant rate: ${f.merchant} (pass-through).`,
      unit_price: parseAmount(f.merchant),
      qty: f.category === "monthly" || f.category === "one_time" ? 1 : 0,
      cadence: f.category,
    });
  });

  // One-time NMI fees (Name change, etc.)
  NMI_ONE_TIME_FEES.forEach((f, idx) => {
    items.push({
      id: `nmi-ot-${idx}`,
      group: "One-Time Fees",
      label: f.label,
      description: `Merchant rate: ${f.amount}.`,
      unit_price: parseAmount(f.amount),
      qty: 1,
      cadence: "one_time",
    });
  });

  return items;
}

export function catalogItemToLine(item: CatalogItem): BillingDocLine {
  const qty = item.qty || 1;
  return {
    label: item.label,
    description: item.description,
    qty,
    unit_price: item.unit_price,
    amount: Math.round(qty * item.unit_price * 100) / 100,
    cadence: item.cadence,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
