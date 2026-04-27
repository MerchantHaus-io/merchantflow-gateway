import { useState } from "react";
import { Check, FileText, X } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TIERS, type PricingTier, ANNUAL_DISCOUNT_LABEL } from "@/config/pricing";
import { QuoteGeneratorDialog } from "@/components/pricing/QuoteGeneratorDialog";

type BillingCycle = "monthly" | "annual";

const formatPrice = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

interface TierCardProps {
  tier: PricingTier;
  billing: BillingCycle;
  onGetStarted: (tier: PricingTier) => void;
  onGenerateQuote: (tier: PricingTier) => void;
}

function TierCard({
  tier,
  billing,
  onGetStarted,
  onGenerateQuote,
}: TierCardProps) {
  const price =
    billing === "annual" ? tier.annualPrice : tier.monthlyPrice;
  const isCustom = tier.monthlyPrice === null;

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-card p-6 flex flex-col h-full transition-shadow",
        tier.popular
          ? "border-primary shadow-xl ring-1 ring-primary/30"
          : "border-border shadow-sm hover:shadow-md",
      )}
    >
      {tier.popular && (
        <Badge className="absolute -top-3 right-6 bg-foreground text-background hover:bg-foreground">
          POPULAR
        </Badge>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-semibold">{tier.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{tier.tagline}</p>
      </div>

      <div className="mb-6">
        {isCustom ? (
          <span className="text-4xl font-bold tracking-tight">
            {tier.customPriceLabel ?? "Custom"}
          </span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tight">
              {formatPrice(price ?? 0)}
            </span>
            <span className="text-sm text-muted-foreground">/month</span>
            {billing === "annual" && (
              <span className="ml-2 text-xs text-muted-foreground">
                billed annually
              </span>
            )}
          </div>
        )}
      </div>

      <ul className="space-y-2.5 mb-6 flex-1">
        {tier.included.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 mt-0.5 text-foreground shrink-0" />
            <span>{item}</span>
          </li>
        ))}
        {tier.excluded.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-sm text-muted-foreground/60"
          >
            <X className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <Button
          onClick={() => onGetStarted(tier)}
          variant={tier.popular ? "default" : "outline"}
          className="w-full"
        >
          {tier.ctaLabel}
        </Button>
        <Button
          onClick={() => onGenerateQuote(tier)}
          variant="ghost"
          className="w-full text-primary hover:text-primary"
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Quote
        </Button>
      </div>
    </div>
  );
}

export default function Pricing() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [activeTier, setActiveTier] = useState<PricingTier | null>(null);

  return (
    <AppLayout pageTitle="Pricing">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Transparent Pricing
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 max-w-2xl mx-auto">
              Every plan includes our fraud-first foundation: Network Tokens,
              Customer Vault, and Basic Fraud Prevention. Custom volume pricing
              available.
            </p>

            <div className="inline-flex items-center gap-1 mt-6 rounded-full border border-border bg-muted/40 p-1">
              <button
                onClick={() => setBilling("monthly")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-full transition-colors",
                  billing === "monthly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("annual")}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-full transition-colors flex items-center gap-2",
                  billing === "annual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Annual
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                  {ANNUAL_DISCOUNT_LABEL}
                </Badge>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TIERS.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                billing={billing}
                onGetStarted={setActiveTier}
                onGenerateQuote={setActiveTier}
              />
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-10">
            Use <span className="font-medium text-foreground">Generate Quote</span>{" "}
            on any plan to build a tailored proposal with your client&apos;s details.
          </p>
        </div>
      </div>

      {activeTier && (
        <QuoteGeneratorDialog
          initialTier={activeTier.id}
          initialBilling={billing}
          lockTier
          open={activeTier !== null}
          onOpenChange={(next) => {
            if (!next) setActiveTier(null);
          }}
        />
      )}
    </AppLayout>
  );
}
