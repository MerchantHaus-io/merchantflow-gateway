import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  Shield,
  CreditCard,
  Cable,
  Layers,
  ArrowRight,
  Search,
  Sparkles,
  Settings,
  BookOpen,
  Wallet,
  Server,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

const tierData = [
  { tier: "0–5M", costBps: 20, costTxnCents: 20, label: "Launch" },
  { tier: "5–25M", costBps: 15, costTxnCents: 15, label: "Scaling" },
  { tier: "25M+", costBps: 10, costTxnCents: 10, label: "Mature" },
];

const features = [
  {
    key: "basic-fraud",
    name: "Basic Fraud Controls",
    bucket: "Fraud",
    tags: ["velocity", "thresholds", "ip", "card testing"],
    summary:
      "Set transaction thresholds and velocity checks (per-card, per-IP, per-window) to reduce card testing and abuse.",
  },
  {
    key: "kount",
    name: "Advanced Fraud (Kount)",
    bucket: "Fraud",
    tags: ["advanced", "risk scoring", "premium"],
    summary:
      "Premium fraud tooling for tougher scenarios; often sold as an upgrade to merchants who want 'best of the best'.",
  },
  {
    key: "3ds",
    name: "3DS / Authentication",
    bucket: "Risk & Auth",
    tags: ["3ds", "verification", "liability"],
    summary:
      "Extra verification on the cardholder side; optional based on channel and risk tolerance.",
  },
  {
    key: "text-to-pay",
    name: "Text-to-Pay",
    bucket: "Engagement",
    tags: ["sms", "payment links", "invoice"],
    summary:
      "Send a payment link via SMS; great for remote collections and fast payment capture.",
  },
  {
    key: "invoicing",
    name: "Invoicing",
    bucket: "Engagement",
    tags: ["recurring", "reminders", "templates"],
    summary:
      "Manage invoices, reminders, and customer records—use as-is or via API-driven templates.",
  },
  {
    key: "tap-to-pay",
    name: "Tap-to-Pay",
    bucket: "In-Person",
    tags: ["iphone", "android", "cutting table", "mobile"],
    summary:
      "Turn phones into acceptance devices—strong for roaming checkout and modern in-store workflows.",
  },
  {
    key: "vault",
    name: "Customer Vault / Tokenization",
    bucket: "Core",
    tags: ["tokens", "pci", "subscriptions"],
    summary:
      "Encrypt and tokenize card data; store once, charge later via token or portal workflows.",
  },
  {
    key: "card-updater",
    name: "Card Updater",
    bucket: "Core",
    tags: ["expiry", "billing updates", "retention"],
    summary:
      "Automatically refresh expired/updated card details to reduce failed payments and churn.",
  },
  {
    key: "level3",
    name: "Level 3 Data",
    bucket: "B2B",
    tags: ["line items", "purchase cards", "savings"],
    summary:
      "Pass extra transaction data (POs, tax, line items) for B2B cards; can reduce interchange in some cases.",
  },
  {
    key: "ach",
    name: "ACH",
    bucket: "Alt Payments",
    tags: ["bank", "high ticket", "checks"],
    summary:
      "Enable bank transfers for merchants who want non-card options—useful for high-ticket or legacy payer preferences.",
  },
  {
    key: "iprocess",
    name: "iProcess Mobile App",
    bucket: "In-Person",
    tags: ["app store", "receipts", "signatures"],
    summary:
      "Ready-to-download mobile app (not fully white-labeled) for simple, quick in-person payment capture.",
  },
];

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function safeNumber(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function Pill({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border p-4 shadow-sm">
      <div className="mt-0.5 rounded-2xl border p-2">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function FlowStep({
  n,
  title,
  text,
}: {
  n: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold">
        {n}
      </div>
      <div className="space-y-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{text}</div>
      </div>
    </div>
  );
}

function SmallStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{note}</div>
    </div>
  );
}

function Chip({ children, active, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs transition hover:shadow-sm " +
        (active ? "bg-foreground text-background" : "bg-background")
      }
    >
      {children}
    </button>
  );
}

export default function NMIPaymentsExplainedPage() {
  const [tab, setTab] = useState<string>("overview");
  const [q, setQ] = useState<string>("");
  const [bucket, setBucket] = useState<string>("All");

  // Waterfall toggles
  const [pricingMode, setPricingMode] = useState<"interchange" | "flat">(
    "interchange"
  );
  const [gatewayOnly, setGatewayOnly] = useState<boolean>(false);
  const [exampleAmount, setExampleAmount] = useState<number>(100);

  const economicsExample = useMemo(() => {
    const amt = Number.isFinite(exampleAmount) ? Math.max(0, exampleAmount) : 0;

    const merchantRatePct = 2.9;
    const merchantFeeCents = 30;
    const merchantFees = amt * (merchantRatePct / 100) + merchantFeeCents / 100;

    const interchangePct = 1.85;
    const interchangeCents = 10;

    const nmiBps = 20;
    const nmiTxnCents = 20;

    const interchangeAndNetwork =
      amt * (interchangePct / 100) + interchangeCents / 100;
    const nmiCostLayer = amt * (nmiBps / 10000) + nmiTxnCents / 100;
    const buyCostInterchangePlus = interchangeAndNetwork + nmiCostLayer;

    const partnerGrossMarginInterchange = merchantFees - buyCostInterchangePlus;

    const flatCost = merchantFees;
    const partnerGrossMarginFlat = merchantFees - flatCost;

    return {
      amt,
      merchantRatePct,
      merchantFeeCents,
      merchantFees,
      interchangePct,
      interchangeCents,
      nmiBps,
      nmiTxnCents,
      interchangeAndNetwork,
      nmiCostLayer,
      buyCostInterchangePlus,
      partnerGrossMarginInterchange,
      flatCost,
      partnerGrossMarginFlat,
    };
  }, [exampleAmount]);

  const buckets = useMemo(() => {
    const s = new Set(features.map((f) => f.bucket));
    return ["All", ...Array.from(s)];
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return features
      .filter((f) => (bucket === "All" ? true : f.bucket === bucket))
      .filter((f) => {
        if (!query) return true;
        const blob =
          `${f.name} ${f.bucket} ${f.summary} ${f.tags.join(" ")}`.toLowerCase();
        return blob.includes(query);
      });
  }, [q, bucket]);

  const chartData = useMemo(() => {
    return tierData.map((t) => ({
      name: t.tier,
      cost: t.costBps + t.costTxnCents / 100,
    }));
  }, []);

  const partnerMarginLabel = gatewayOnly
    ? "Gateway SaaS Margin"
    : pricingMode === "interchange"
      ? "Buy + Markup"
      : "Flat / SaaS-style";

  return (
    <AppLayout pageTitle="NMI Payments Explained">
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.06 } },
            }}
            className="space-y-8"
          >
            {/* Header */}
            <motion.div variants={fadeUp} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-2xl border p-2 shadow-sm">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <Badge variant="secondary">Partner-facing explainer</Badge>
                    <Badge
                      className="ml-2"
                      variant={
                        gatewayOnly || pricingMode === "interchange"
                          ? "default"
                          : "secondary"
                      }
                    >
                      Partner Margin: {partnerMarginLabel}
                    </Badge>
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    How NMI Payments Works
                  </h1>
                  <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                    A practical, no-fluff overview of the NMI Payments
                    platform—flow, economics, features, fraud controls, and
                    hardware patterns.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (typeof window !== "undefined") window.print();
                    }}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Print / Save PDF
                  </Button>
                  <Button
                    onClick={() => {
                      setTab("flow");
                      const el =
                        typeof document !== "undefined"
                          ? document.getElementById("tabs")
                          : null;
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Jump to Flow
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Pill
                  icon={Layers}
                  title="Modular platform"
                  desc="Sell processing + gateway, or gateway-only (bring your own bank)."
                />
                <Pill
                  icon={Wallet}
                  title="Partner-controlled margins"
                  desc="Buy rate + markup = 100% partner margin on add-ons; scalable economics."
                />
                <Pill
                  icon={Shield}
                  title="Operational support"
                  desc="White-labeled support posture + tools for fraud, compliance, and troubleshooting."
                />
              </div>
            </motion.div>

            {/* Tabs */}
            <motion.div variants={fadeUp} id="tabs">
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="flow">How it works</TabsTrigger>
                  <TabsTrigger value="economics">Economics</TabsTrigger>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="hardware">Hardware</TabsTrigger>
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview" className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>What NMI Payments is</CardTitle>
                        <CardDescription>
                          Think of it as configurable payments infrastructure for
                          partners and platforms.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Positioning:
                          </span>{" "}
                          NMI is an agnostic gateway + payments enablement layer.
                          Partners can bundle processing, provide gateway-only,
                          and monetize value-added services while keeping the
                          merchant experience aligned to their brand.
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <SmallStat
                            label="Primary win"
                            value="Retention"
                            note="High-touch onboarding + support + stable tech stack reduces churn."
                          />
                          <SmallStat
                            label="Partner leverage"
                            value="Control"
                            note="Own pricing, packaging, feature toggles, and merchant experience."
                          />
                        </div>

                        <Separator />

                        {/* Partner Profit Waterfall */}
                        <div className="space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <div className="text-sm font-semibold">
                                Partner profit waterfall
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Toggle between interchange+ processing, flat-rate
                                processing, and gateway-only to see how partner
                                economics change.
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-2 rounded-2xl border p-2">
                                <div className="text-xs text-muted-foreground">
                                  Example ticket
                                </div>
                                <Input
                                  value={String(exampleAmount)}
                                  onChange={(e) =>
                                    setExampleAmount(safeNumber(e.target.value))
                                  }
                                  className="h-8 w-[110px]"
                                  inputMode="decimal"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Chip
                                  active={
                                    !gatewayOnly && pricingMode === "interchange"
                                  }
                                  onClick={() => {
                                    setGatewayOnly(false);
                                    setPricingMode("interchange");
                                  }}
                                >
                                  Processing (Interchange+)
                                </Chip>
                                <Chip
                                  active={!gatewayOnly && pricingMode === "flat"}
                                  onClick={() => {
                                    setGatewayOnly(false);
                                    setPricingMode("flat");
                                  }}
                                >
                                  Processing (Flat-rate)
                                </Chip>
                                <Chip
                                  active={gatewayOnly}
                                  onClick={() => setGatewayOnly(true)}
                                >
                                  Gateway-only
                                </Chip>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border p-4 text-sm">
                            <div className="grid gap-3 sm:grid-cols-2">
                              {/* LEFT COLUMN */}
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">
                                  What the merchant pays (illustrative)
                                </div>
                                <div className="rounded-2xl border p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="font-semibold">
                                      Pricing anchor
                                    </div>
                                    <Badge variant="secondary">
                                      {economicsExample.merchantRatePct}% +{" "}
                                      {economicsExample.merchantFeeCents}¢
                                    </Badge>
                                  </div>
                                  <div className="mt-1 text-muted-foreground">
                                    Fees collected:{" "}
                                    <span className="font-medium text-foreground">
                                      {formatMoney(economicsExample.merchantFees)}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-xs font-semibold text-muted-foreground">
                                  Cost layers
                                </div>

                                {gatewayOnly ? (
                                  <div className="rounded-2xl border p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold">
                                        Gateway fees
                                      </div>
                                      <Badge variant="outline">illustrative</Badge>
                                    </div>
                                    <div className="mt-2 space-y-1 text-muted-foreground">
                                      <div>
                                        Monthly gateway fee:{" "}
                                        <span className="font-medium text-foreground">
                                          $15
                                        </span>
                                      </div>
                                      <div>
                                        Per-transaction fee:{" "}
                                        <span className="font-medium text-foreground">
                                          10¢
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      Gateway-only avoids interchange exposure.
                                      Margin scales on merchant count, not ticket
                                      size.
                                    </div>
                                  </div>
                                ) : pricingMode === "interchange" ? (
                                  <div className="space-y-2">
                                    <div className="rounded-2xl border p-3">
                                      <div className="flex items-center justify-between">
                                        <div className="font-semibold">
                                          Interchange + network
                                        </div>
                                        <Badge variant="outline">
                                          ~{economicsExample.interchangePct}% +{" "}
                                          {economicsExample.interchangeCents}¢
                                        </Badge>
                                      </div>
                                      <div className="mt-1 text-muted-foreground">
                                        Mandatory cost:{" "}
                                        <span className="font-medium text-foreground">
                                          {formatMoney(
                                            economicsExample.interchangeAndNetwork
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="rounded-2xl border p-3">
                                      <div className="flex items-center justify-between">
                                        <div className="font-semibold">
                                          NMI buy-rate add-on
                                        </div>
                                        <Badge variant="outline">
                                          {economicsExample.nmiBps} bps +{" "}
                                          {economicsExample.nmiTxnCents}¢
                                        </Badge>
                                      </div>
                                      <div className="mt-1 text-muted-foreground">
                                        Platform cost layer:{" "}
                                        <span className="font-medium text-foreground">
                                          {formatMoney(
                                            economicsExample.nmiCostLayer
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold">
                                        Processor cost (flat-rate model)
                                      </div>
                                      <Badge variant="outline">Stripe-like</Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      Cost:{" "}
                                      <span className="font-medium text-foreground">
                                        {formatMoney(economicsExample.flatCost)}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      In flat-rate setups, your margin typically
                                      shifts to software fees, add-ons, or
                                      negotiated enterprise deals.
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* RIGHT COLUMN */}
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">
                                  Partner margin
                                </div>

                                {gatewayOnly ? (
                                  <div className="rounded-2xl border p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold">
                                        Gross margin
                                      </div>
                                      <Badge variant="secondary">
                                        Gateway-only
                                      </Badge>
                                    </div>
                                    <div className="mt-2 text-muted-foreground">
                                      SaaS-style margin: primarily driven by
                                      merchant count + retention.
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      Best when the merchant refuses to switch
                                      banks, or when you're monetizing platform
                                      access more than payments.
                                    </div>
                                  </div>
                                ) : pricingMode === "interchange" ? (
                                  <div className="rounded-2xl border p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold">
                                        Gross processing margin
                                      </div>
                                      <Badge variant="secondary">
                                        Buy + markup
                                      </Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      Buy cost:{" "}
                                      <span className="font-medium text-foreground">
                                        {formatMoney(
                                          economicsExample.buyCostInterchangePlus
                                        )}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      Margin (illustrative):{" "}
                                      <span className="font-medium text-foreground">
                                        {formatMoney(
                                          economicsExample.partnerGrossMarginInterchange
                                        )}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      As volume tiers improve (bps + cents drop),
                                      buy cost decreases and margin
                                      expands—without changing merchant-facing
                                      pricing.
                                    </div>
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold">
                                        Gross processing margin
                                      </div>
                                      <Badge variant="secondary">Flat-rate</Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      Margin (illustrative):{" "}
                                      <span className="font-medium text-foreground">
                                        {formatMoney(
                                          economicsExample.partnerGrossMarginFlat
                                        )}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      Flat-rate providers compress processing
                                      margin; you typically monetize via software
                                      fees, add-ons, or negotiated enterprise
                                      pricing.
                                    </div>
                                  </div>
                                )}

                                {!gatewayOnly && (
                                  <div className="rounded-2xl border p-3">
                                    <div className="font-semibold">
                                      Where profit really scales
                                    </div>
                                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                                      <li>
                                        Markup discipline (price floors +
                                        packages)
                                      </li>
                                      <li>
                                        Value-added services (fraud, invoicing,
                                        text-to-pay, etc.)
                                      </li>
                                      <li>
                                        Cost-down tiers (lower bps + cents as TPV
                                        grows)
                                      </li>
                                      <li className="mt-2">
                                        <span className="font-medium text-foreground">
                                          Break-even intuition:
                                        </span>{" "}
                                        10–15 gateway-only merchants can rival
                                        the margin of a low-volume processing
                                        merchant—without interchange risk.
                                      </li>
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="is-not">
                            <AccordionTrigger>What it is NOT</AccordionTrigger>
                            <AccordionContent>
                              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                                <li>
                                  Not a single, fixed POS experience—partners
                                  choose hardware patterns and UI strategy.
                                </li>
                                <li>
                                  Not "one price for everyone"—partners can
                                  negotiate, tier, and package by segment.
                                </li>
                                <li>
                                  Not a black box—partners have visibility via
                                  portals and can support merchants directly.
                                </li>
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Quick glossary</CardTitle>
                        <CardDescription>
                          Short definitions used throughout.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="rounded-2xl border p-3">
                          <div className="font-semibold">Interchange</div>
                          <div className="text-muted-foreground">
                            Non-negotiable fees set by issuers/networks (Visa/MC)
                            per transaction type.
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3">
                          <div className="font-semibold">
                            Interchange + (bps + cents)
                          </div>
                          <div className="text-muted-foreground">
                            Your buy rate: interchange plus a fixed add-on (basis
                            points and per-tx fee).
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold">Gateway-only</div>
                            <Badge variant="secondary">Platform-first</Badge>
                          </div>
                          <div className="text-muted-foreground">
                            Merchant keeps their processor/bank; pays gateway
                            monthly + per-tx fee.
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* FLOW */}
                <TabsContent value="flow" className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>End-to-end flow</CardTitle>
                        <CardDescription>
                          From lead → underwriting → activation → ongoing support.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <FlowStep
                          n="1"
                          title="Lead is submitted"
                          text="Partner submits a prospect/lead for onboarding and underwriting."
                        />
                        <FlowStep
                          n="2"
                          title="White-labeled onboarding"
                          text="Merchant completes required info via a partner-facing experience (links/forms)."
                        />
                        <FlowStep
                          n="3"
                          title="Risk checks + review"
                          text="Automated checks plus human review to validate risk profile and reduce friction."
                        />
                        <FlowStep
                          n="4"
                          title="Account + gateway setup"
                          text="Upon approval, the merchant is set up in the gateway (tokenization/features available)."
                        />
                        <FlowStep
                          n="5"
                          title="Partner portal + merchant portal"
                          text="Partner gains visibility to merchant configuration and can support or impersonate for troubleshooting."
                        />
                        <FlowStep
                          n="6"
                          title="Go-live"
                          text="Merchant integrates via e-commerce, virtual terminal, POS/hardware, or mobile workflows."
                        />
                        <FlowStep
                          n="7"
                          title="Ongoing support + operations"
                          text="White-labeled support posture, merchant issue resolution, and operational management at scale."
                        />

                        <Separator />

                        <div className="rounded-2xl border p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-2xl border p-2">
                              <Server className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <div className="text-sm font-semibold">
                                Support posture
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Support can be presented neutrally so merchants
                                get help without feeling like they've been handed
                                off. Partner identity and merchant association are
                                preserved behind the scenes.
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Where issues usually show up</CardTitle>
                        <CardDescription>
                          So you can document the right guardrails.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-2xl border p-3 text-sm">
                          <div className="flex items-center gap-2 font-semibold">
                            <CreditCard className="h-4 w-4" />
                            Funding & "where's my money?"
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            Settlement timing, batch close times, and expectation
                            setting.
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3 text-sm">
                          <div className="flex items-center gap-2 font-semibold">
                            <Shield className="h-4 w-4" />
                            Fraud / card testing
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            Velocity controls, per-card limits, per-IP rules,
                            optional advanced tooling.
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3 text-sm">
                          <div className="flex items-center gap-2 font-semibold">
                            <Cable className="h-4 w-4" />
                            Hardware & network
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            Device standardization, connectivity, and replicating
                            issues at scale.
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3 text-sm">
                          <div className="flex items-center gap-2 font-semibold">
                            <Settings className="h-4 w-4" />
                            Configuration drift
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            Feature toggles per merchant, permissions, and
                            consistent packaging.
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ECONOMICS */}
                <TabsContent value="economics" className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>How the money works</CardTitle>
                        <CardDescription>
                          Interchange is mandatory; your controllable layer is
                          markup + packaging.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                          <div className="font-semibold text-foreground">
                            Mental model
                          </div>
                          <div className="mt-1">
                            <span className="font-medium text-foreground">
                              Non-negotiable:
                            </span>{" "}
                            issuer interchange + network fees.{" "}
                            <span className="font-medium text-foreground">
                              Controllable:
                            </span>{" "}
                            your processor/gateway margin and your value-added
                            service packaging.
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <SmallStat
                            label="Typical market floor"
                            value="2.9% + 30¢"
                            note="Common fixed/flat rate anchor for competitive packages."
                          />
                          <SmallStat
                            label="Trend"
                            value="3.5%+"
                            note="Flat rates at 3.5% are increasingly accepted in many segments."
                          />
                          <SmallStat
                            label="Partner margin style"
                            value="Buy + Markup"
                            note="Above buy rate = partner margin (especially on add-ons)."
                          />
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">
                                Cost-down tiers (illustrative)
                              </div>
                              <div className="text-sm text-muted-foreground">
                                As volume grows, partner costs drop (bps + cents).
                              </div>
                            </div>
                            <Badge variant="secondary">Example structure</Badge>
                          </div>

                          <div className="h-[220px] w-full rounded-2xl border p-3">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="cost"
                                  strokeWidth={2}
                                  dot
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            {tierData.map((t) => (
                              <div
                                key={t.tier}
                                className="rounded-2xl border p-3 text-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold">{t.tier}</div>
                                  <Badge variant="outline">{t.label}</Badge>
                                </div>
                                <div className="mt-2 text-muted-foreground">
                                  Cost:{" "}
                                  <span className="font-medium text-foreground">
                                    {t.costBps} bps
                                  </span>{" "}
                                  +{" "}
                                  <span className="font-medium text-foreground">
                                    {t.costTxnCents}¢
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="gateway-only">
                            <AccordionTrigger>
                              Gateway-only vs Processing + Gateway
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 text-sm text-muted-foreground">
                                <div>
                                  <span className="font-medium text-foreground">
                                    Gateway-only:
                                  </span>{" "}
                                  merchant keeps their bank/processor; pays
                                  gateway monthly + per-transaction fees.
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">
                                    Processing + gateway:
                                  </span>{" "}
                                  gateway fees can be waived to keep the offer
                                  competitive vs all-in-one providers.
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">
                                    Add-ons:
                                  </span>{" "}
                                  fraud, engagement, vaulting, and other services
                                  can be packaged as upgrades.
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>

                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Pricing & packaging tips</CardTitle>
                          <CardDescription>
                            Simple ways partners market without overcommitting.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div className="rounded-2xl border p-3">
                            <div className="font-semibold">
                              Avoid hard pricing on the homepage
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              Use "competitive pricing" or packages
                              (Bronze/Silver/Gold) and price at discovery.
                            </div>
                          </div>
                          <div className="rounded-2xl border p-3">
                            <div className="font-semibold">
                              Sell on value, not commodity
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              Lead with fraud controls, tap-to-pay, invoicing,
                              vaulting, and support posture.
                            </div>
                          </div>
                          <div className="rounded-2xl border p-3">
                            <div className="font-semibold">
                              Standardize for scale
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              Reduce "it might be their hardware" ambiguity by
                              offering a consistent kit.
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Stripe vs NMI (partner view)</CardTitle>
                          <CardDescription>
                            A blunt comparison for positioning.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div className="grid gap-3">
                            <div className="rounded-2xl border p-4">
                              <div className="flex items-center justify-between">
                                <div className="font-semibold">
                                  Stripe (typical)
                                </div>
                                <Badge variant="secondary">Flat-rate first</Badge>
                              </div>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                                <li>
                                  Pricing often anchored to a fixed rate (e.g.,
                                  2.9% + 30¢)
                                </li>
                                <li>
                                  Margin is usually in software fees, add-ons, or
                                  volume-negotiated enterprise pricing
                                </li>
                                <li>
                                  Strong developer UX; less built for partner
                                  resale economics out of the box
                                </li>
                              </ul>
                            </div>

                            <div className="rounded-2xl border p-4">
                              <div className="flex items-center justify-between">
                                <div className="font-semibold">
                                  NMI (partner model)
                                </div>
                                <Badge variant="secondary">Buy + markup</Badge>
                              </div>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                                <li>
                                  Interchange+ buy rate + your markup =
                                  controllable margin
                                </li>
                                <li>
                                  Cost-down tiers: as TPV grows, your buy rate
                                  improves
                                </li>
                                <li>
                                  Gateway-only option for "bring your own bank"
                                  situations
                                </li>
                                <li>
                                  White-label posture: you keep the relationship
                                  and retention
                                </li>
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>

                {/* FEATURES */}
                <TabsContent value="features" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Feature library</CardTitle>
                      <CardDescription>
                        Search, filter, and use these as building blocks for
                        packaging and enablement.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-md">
                          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search features (e.g., 'velocity', 'tap', 'token')"
                            className="pl-9"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {buckets.map((b) => (
                            <Chip
                              key={b}
                              active={bucket === b}
                              onClick={() => setBucket(b)}
                            >
                              {b}
                            </Chip>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((f) => (
                          <div
                            key={f.key}
                            className="rounded-2xl border p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">
                                  {f.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {f.bucket}
                                </div>
                              </div>
                              <div className="rounded-2xl border p-2">
                                <Check className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="mt-3 text-sm text-muted-foreground">
                              {f.summary}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1">
                              {f.tags.slice(0, 5).map((t) => (
                                <Badge
                                  key={t}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {filtered.length === 0 && (
                        <div className="rounded-2xl border p-6 text-sm text-muted-foreground">
                          No matches. Try a different keyword.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* HARDWARE */}
                <TabsContent value="hardware" className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>Hardware patterns</CardTitle>
                        <CardDescription>
                          Standardize devices to reduce support chaos and
                          replicate issues quickly.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Pill
                            icon={Cable}
                            title="Puck + tablet POS"
                            desc="A modern Android POS paired with a wireless payment puck for acceptance."
                          />
                          <Pill
                            icon={CreditCard}
                            title="Tap-to-pay first"
                            desc="Phones become acceptance devices; great for roaming checkout and tableside workflows."
                          />
                          <Pill
                            icon={Settings}
                            title="SDK-driven builds"
                            desc="Android + iOS SDKs enable tighter integration when partners own the POS UI."
                          />
                          <Pill
                            icon={Layers}
                            title="Family certifications"
                            desc="One certification can unlock multiple device models (handheld → countertop)."
                          />
                        </div>

                        <Separator />

                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="standardize">
                            <AccordionTrigger>
                              Why partners standardize hardware
                            </AccordionTrigger>
                            <AccordionContent>
                              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                                <li>
                                  Fewer points of failure: less "is it their
                                  terminal / their processor / their network?"
                                </li>
                                <li>
                                  Faster troubleshooting: keep a mirrored device
                                  kit in-house to replicate bugs.
                                </li>
                                <li>
                                  Easier training + support scripts: one workflow,
                                  one set of screens.
                                </li>
                                <li>
                                  Better rollouts: hardware can be shipped
                                  directly to install locations.
                                </li>
                              </ul>
                            </AccordionContent>
                          </AccordionItem>

                          <AccordionItem value="iprocess">
                            <AccordionTrigger>
                              Quick-start option: iProcess
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-2 text-sm text-muted-foreground">
                                <div>
                                  iProcess is a ready-to-download mobile app
                                  approach: login, take payments, capture
                                  signatures, and send receipts (text/email). It's
                                  a simple fallback when full POS customization
                                  isn't ready yet.
                                </div>
                                <div className="rounded-2xl border p-3">
                                  <div className="font-semibold text-foreground">
                                    Trade-off
                                  </div>
                                  <div className="mt-1">
                                    It's not fully white-labeled. Use it when
                                    speed matters more than fully branded UX.
                                  </div>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Hardware tips</CardTitle>
                        <CardDescription>
                          Quick wins for hardware strategy.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="rounded-2xl border p-3">
                          <div className="font-semibold">Pick a family</div>
                          <div className="mt-1 text-muted-foreground">
                            Certify one device family (handheld + countertop) to
                            cover most use cases.
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3">
                          <div className="font-semibold">Keep a test kit</div>
                          <div className="mt-1 text-muted-foreground">
                            Mirror your merchant's hardware in-house for fast
                            issue replication.
                          </div>
                        </div>
                        <div className="rounded-2xl border p-3">
                          <div className="font-semibold">
                            Tap-to-pay as fallback
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            When hardware is delayed, phones can accept payments
                            immediately.
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
