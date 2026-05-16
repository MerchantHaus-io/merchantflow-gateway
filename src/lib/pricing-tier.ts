// Shared helpers for opportunity Pricing Plan + Gateway Tier
// Tier rule: ≤$50k Foundation · ≤$100k Growth · >$100k Scale
// Enterprise is manual-only.

export type PricingPlan = "flat_rate" | "interchange_plus";
export type GatewayTier = "foundation" | "growth" | "scale" | "enterprise";

export const PRICING_PLAN_LABEL: Record<PricingPlan, string> = {
  flat_rate: "Flat Rate",
  interchange_plus: "Interchange+",
};

export const PRICING_PLAN_SHORT: Record<PricingPlan, string> = {
  flat_rate: "Flat",
  interchange_plus: "IC+",
};

export const GATEWAY_TIER_LABEL: Record<GatewayTier, string> = {
  foundation: "Foundation",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

/** Parse a numeric monthly volume from any string/number input. */
export function parseMonthlyVolume(input: any): number | null {
  if (input == null) return null;
  const n =
    typeof input === "number"
      ? input
      : Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Auto-derive gateway tier from monthly volume. */
export function tierFromVolume(volume: any): GatewayTier | null {
  const v = parseMonthlyVolume(volume);
  if (v == null) return null;
  if (v <= 50_000) return "foundation";
  if (v <= 100_000) return "growth";
  return "scale";
}

/** Tailwind classes for Tier badges (semantic, theme-aware). */
export function tierBadgeClass(tier: GatewayTier | null | undefined): string {
  switch (tier) {
    case "foundation":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    case "growth":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "scale":
      return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "enterprise":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/** Tailwind classes for Pricing Plan badges. */
export function planBadgeClass(plan: PricingPlan | null | undefined): string {
  switch (plan) {
    case "flat_rate":
      return "bg-muted text-foreground border-border";
    case "interchange_plus":
      return "bg-primary/15 text-primary border-primary/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
