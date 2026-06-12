// Builds default invoice line items from the gateway pricing schedule used by
// QuoteBuilder. Reuses TIER_PLATFORM_FEE, QUOTE_LINES, GATEWAY_FEE_DEFAULTS,
// and ANCILLARY_FEE_DEFAULTS so invoices and receipts mirror the active quote.

import {
  TIER_PLATFORM_FEE,
  QUOTE_LINES,
  GATEWAY_FEE_DEFAULTS,
  ANCILLARY_FEE_DEFAULTS,
} from "@/config/quoteSchedule";
import type { TierId } from "@/config/pricing";
import type { BillingDocLine, BillingDocAncillary } from "@/lib/billingDocPdf";

export interface ScheduleContext {
  tier: TierId;
  billingCycle: "monthly" | "annual";
  /** Optional NMI transaction count for the period — drives per-tx line. */
  txnCount?: number;
  /** Optional volume (used as a note; not multiplied here). */
  monthlyVolume?: number;
  /** Add-on ids to include alongside the platform bundle. */
  addOnIds?: string[];
  /** Whether to include the gateway-auth monthly fee line. */
  includeGatewayAuth?: boolean;
  /** Whether to include the per-transaction fee line. */
  includePerTxn?: boolean;
}

export function buildScheduleLines(ctx: ScheduleContext): BillingDocLine[] {
  const lines: BillingDocLine[] = [];
  const tier = TIER_PLATFORM_FEE[ctx.tier] ?? TIER_PLATFORM_FEE.growth;

  // Platform bundle
  const bundlePrice = ctx.billingCycle === "annual" ? tier.resale * 12 * 0.83 : tier.resale;
  lines.push({
    label: `${capitalize(ctx.tier)} Platform Bundle`,
    description: `${ctx.billingCycle === "annual" ? "Annual" : "Monthly"} platform subscription, all bundled gateway services included.`,
    qty: 1,
    unit_price: round2(bundlePrice),
    amount: round2(bundlePrice),
    cadence: ctx.billingCycle,
  });

  // Selected add-ons (only those not already bundled in tier)
  if (ctx.addOnIds?.length) {
    for (const id of ctx.addOnIds) {
      const def = QUOTE_LINES.find((q) => q.id === id);
      if (!def) continue;
      if (def.bundledIn.includes(ctx.tier)) continue;
      lines.push({
        label: def.label,
        description: def.description,
        qty: 1,
        unit_price: round2(def.resale),
        amount: round2(def.resale),
        cadence: "monthly",
      });
    }
  }

  // Gateway auth monthly fee
  if (ctx.includeGatewayAuth) {
    const f = GATEWAY_FEE_DEFAULTS.find((g) => g.id === "gateway_auth");
    if (f) {
      lines.push({
        label: f.label,
        description: f.description,
        qty: 1,
        unit_price: round2(f.resale),
        amount: round2(f.resale),
        cadence: "monthly",
      });
    }
  }

  // Per-transaction fee
  if (ctx.includePerTxn) {
    const f = GATEWAY_FEE_DEFAULTS.find((g) => g.id === "per_transaction");
    const qty = ctx.txnCount ?? 0;
    if (f && qty > 0) {
      lines.push({
        label: f.label,
        description: f.description,
        qty,
        unit_price: round2(f.resale),
        amount: round2(qty * f.resale),
        cadence: "per_transaction",
      });
    }
  }

  return lines;
}

export function buildAncillary(): BillingDocAncillary[] {
  return ANCILLARY_FEE_DEFAULTS.map((a) => ({
    label: a.label,
    description: a.description,
    amount: a.amount,
    cadence: a.cadence,
    waived: a.amount === 0,
  }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
