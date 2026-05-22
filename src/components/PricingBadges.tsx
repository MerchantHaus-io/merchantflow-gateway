import { cn } from "@/lib/utils";
import {
  GATEWAY_TIER_LABEL,
  PRICING_PLAN_LABEL,
  PRICING_PLAN_SHORT,
  planBadgeClass,
  tierBadgeClass,
  type GatewayTier,
  type PricingPlan,
} from "@/lib/pricing-tier";

interface Props {
  pricingPlan?: PricingPlan | string | null;
  gatewayTier?: GatewayTier | string | null;
  size?: "xs" | "sm";
  short?: boolean;
  className?: string;
}

/**
 * Compact display of an opportunity's Pricing Plan + Gateway Tier.
 * Renders nothing when both values are missing.
 */
export const PricingBadges = ({
  pricingPlan,
  gatewayTier,
  size = "xs",
  short = false,
  className,
}: Props) => {
  if (!pricingPlan && !gatewayTier) return null;

  const sizing =
    size === "xs"
      ? "text-[9px] px-1.5 py-0.5"
      : "text-[11px] px-2 py-0.5";

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {gatewayTier && (
        <span
          className={cn(
            "font-bold uppercase tracking-wide rounded-md border",
            sizing,
            tierBadgeClass(gatewayTier as GatewayTier),
          )}
        >
          {GATEWAY_TIER_LABEL[gatewayTier as GatewayTier] ?? gatewayTier}
        </span>
      )}
      {pricingPlan && (
        <span
          className={cn(
            "font-semibold rounded-md border",
            sizing,
            planBadgeClass(pricingPlan as PricingPlan),
          )}
        >
          {short
            ? PRICING_PLAN_SHORT[pricingPlan as PricingPlan] ?? pricingPlan
            : PRICING_PLAN_LABEL[pricingPlan as PricingPlan] ?? pricingPlan}
        </span>
      )}
    </div>
  );
};

export default PricingBadges;
