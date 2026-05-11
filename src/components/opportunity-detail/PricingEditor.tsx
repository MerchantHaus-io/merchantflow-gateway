import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import {
  GATEWAY_TIER_LABEL,
  PRICING_PLAN_LABEL,
  tierFromVolume,
  type GatewayTier,
  type PricingPlan,
} from "@/lib/pricing-tier";

interface Props {
  opportunityId: string;
  pricingPlan?: PricingPlan | string | null;
  gatewayTier?: GatewayTier | string | null;
  monthlyVolume?: string | number | null;
  onUpdate?: (next: { pricing_plan?: PricingPlan | null; gateway_tier?: GatewayTier | null }) => void;
}

export const PricingEditor = ({
  opportunityId,
  pricingPlan,
  gatewayTier,
  monthlyVolume,
  onUpdate,
}: Props) => {
  const [plan, setPlan] = useState<string>(pricingPlan || "");
  const [tier, setTier] = useState<string>(gatewayTier || "");
  const autoTier = tierFromVolume(monthlyVolume);

  useEffect(() => setPlan(pricingPlan || ""), [pricingPlan]);
  useEffect(() => setTier(gatewayTier || ""), [gatewayTier]);

  // If tier is empty and we have a volume, auto-fill once.
  useEffect(() => {
    if (!gatewayTier && autoTier) {
      setTier(autoTier);
      void persist({ gateway_tier: autoTier });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTier]);

  const persist = async (patch: { pricing_plan?: PricingPlan | null; gateway_tier?: GatewayTier | null }) => {
    const { error } = await supabase
      .from("opportunities")
      .update(patch)
      .eq("id", opportunityId);
    if (error) {
      toast.error("Failed to update pricing");
      return;
    }
    onUpdate?.(patch);
  };

  const onPlanChange = (v: string) => {
    setPlan(v);
    void persist({ pricing_plan: v as PricingPlan });
  };
  const onTierChange = (v: string) => {
    setTier(v);
    void persist({ gateway_tier: v as GatewayTier });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Pricing
        </h3>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Pricing Plan
        </label>
        <Select value={plan} onValueChange={onPlanChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select plan…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRICING_PLAN_LABEL) as PricingPlan[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {PRICING_PLAN_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Gateway Tier
          {autoTier && (
            <span className="ml-1 normal-case text-muted-foreground/70">
              (auto: {GATEWAY_TIER_LABEL[autoTier]})
            </span>
          )}
        </label>
        <Select value={tier} onValueChange={onTierChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select tier…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(GATEWAY_TIER_LABEL) as GatewayTier[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {GATEWAY_TIER_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground/70 leading-tight">
          ≤$50k Foundation · ≤$100k Growth · &gt;$100k Scale
        </p>
      </div>
    </div>
  );
};

export default PricingEditor;
