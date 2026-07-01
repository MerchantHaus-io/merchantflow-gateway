// Fee-benchmarking engine for the Statement Analyzer tool.
//
// Takes the figures extracted from a merchant's current processing statement
// (see supabase/functions/analyze-statement) and benchmarks them against true
// interchange + assessment cost and MerchantHaus's proposed Interchange+
// pricing, to surface effective rate, hidden markup, junk fees and estimated
// savings. All functions here are pure so the UI can re-run them live as a
// rep edits/verifies the extracted values.

export type FeeCategory =
  | "interchange"
  | "assessments"
  | "processor_markup"
  | "authorization"
  | "monthly_fee"
  | "other";

export interface FeeLineItem {
  label: string;
  amount: number;
  category: FeeCategory;
  is_junk: boolean;
}

export interface CardBrand {
  brand: string;
  volume?: number | null;
  transactions?: number | null;
}

export interface ExtractedStatement {
  is_processing_statement?: boolean;
  merchant_name?: string | null;
  current_processor?: string | null;
  statement_period?: string | null;
  total_volume: number;
  transaction_count?: number | null;
  average_ticket?: number | null;
  total_fees: number;
  effective_rate?: number | null;
  fee_line_items: FeeLineItem[];
  card_mix?: CardBrand[] | null;
  confidence?: "high" | "medium" | "low";
  notes?: string | null;
}

export interface BenchmarkAssumptions {
  /** True-cost interchange baseline (% of volume) when the statement doesn't itemise it. */
  interchangeRatePct: number;
  /** True-cost interchange per-transaction baseline (dollars). */
  interchangePerTx: number;
  /** Network dues & assessments baseline (% of volume) when not itemised. */
  assessmentsPct: number;
  /** MerchantHaus proposed Interchange+ margin over cost (% of volume). */
  proposedMarkupPct: number;
  /** MerchantHaus proposed per-transaction fee (dollars). */
  proposedPerTx: number;
  /** MerchantHaus proposed fixed monthly fees (gateway + PCI). */
  proposedMonthlyFees: number;
}

// Industry-standard baselines. Interchange ~1.81% + $0.10 and assessments
// ~0.13% mirror the estimates already used in the Revenue Calculator.
export const DEFAULT_ASSUMPTIONS: BenchmarkAssumptions = {
  interchangeRatePct: 1.81,
  interchangePerTx: 0.10,
  assessmentsPct: 0.13,
  proposedMarkupPct: 0.35,
  proposedPerTx: 0.08,
  proposedMonthlyFees: 14.9,
};

export interface BenchmarkResult {
  volume: number;
  txCount: number;
  avgTicket: number;
  currentFees: number;
  /** Current effective rate = total fees / volume, as a percentage. */
  effectiveRate: number;

  // True cost floor (interchange + assessments)
  interchangeCost: number;
  assessmentsCost: number;
  trueCost: number;
  /** Whether interchange/assessments came from the statement's own line items. */
  costFromStatement: boolean;

  // What the current processor is keeping above true cost
  currentMarkup: number;
  currentMarkupPct: number;

  // Junk / padding fees
  junkFees: number;
  junkFeeItems: FeeLineItem[];

  // MerchantHaus proposed pricing
  proposedMarkup: number;
  proposedMonthly: number;
  proposedFeesTotal: number;
  proposedEffectiveRate: number;

  // Savings
  monthlySavings: number;
  annualSavings: number;
  savingsPct: number;

  overchargeRisk: "low" | "moderate" | "high";
  flags: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const sumCategory = (items: FeeLineItem[], cat: FeeCategory): number =>
  items.filter((i) => i.category === cat).reduce((s, i) => s + num(i.amount), 0);

export function benchmarkStatement(
  s: ExtractedStatement,
  a: BenchmarkAssumptions = DEFAULT_ASSUMPTIONS,
): BenchmarkResult {
  const volume = Math.max(0, num(s.total_volume));
  const currentFees = Math.max(0, num(s.total_fees));
  const items = Array.isArray(s.fee_line_items) ? s.fee_line_items : [];

  // Transaction count: prefer stated, else derive from average ticket, else
  // fall back to a $75 average ticket assumption.
  let txCount = num(s.transaction_count);
  const avgTicketStated = num(s.average_ticket);
  if (txCount <= 0) {
    if (avgTicketStated > 0) txCount = Math.round(volume / avgTicketStated);
    else if (volume > 0) txCount = Math.round(volume / 75);
  }
  const avgTicket = txCount > 0 ? volume / txCount : avgTicketStated;

  // True cost: use the statement's own interchange/assessment lines when it
  // itemises them, otherwise fall back to the industry baseline estimate.
  const statedInterchange = sumCategory(items, "interchange");
  const statedAssessments = sumCategory(items, "assessments");
  const costFromStatement = statedInterchange > 0;

  const interchangeCost = costFromStatement
    ? statedInterchange
    : volume * (a.interchangeRatePct / 100) + txCount * a.interchangePerTx;
  const assessmentsCost = statedAssessments > 0
    ? statedAssessments
    : volume * (a.assessmentsPct / 100);

  const trueCost = interchangeCost + assessmentsCost;

  const currentMarkup = Math.max(0, currentFees - trueCost);
  const currentMarkupPct = volume > 0 ? (currentMarkup / volume) * 100 : 0;

  const junkFeeItems = items.filter((i) => i.is_junk);
  const junkFees = junkFeeItems.reduce((sum, i) => sum + num(i.amount), 0);

  const effectiveRate = volume > 0 ? (currentFees / volume) * 100 : 0;

  // Proposed MerchantHaus pricing: pass true cost through, add our margin.
  const proposedMarkup = volume * (a.proposedMarkupPct / 100) + txCount * a.proposedPerTx;
  const proposedMonthly = a.proposedMonthlyFees;
  const proposedFeesTotal = trueCost + proposedMarkup + proposedMonthly;
  const proposedEffectiveRate = volume > 0 ? (proposedFeesTotal / volume) * 100 : 0;

  const monthlySavings = currentFees - proposedFeesTotal;
  const annualSavings = monthlySavings * 12;
  const savingsPct = currentFees > 0 ? (monthlySavings / currentFees) * 100 : 0;

  // Overcharge risk keys off both the effective rate and the markup over cost.
  let overchargeRisk: BenchmarkResult["overchargeRisk"] = "low";
  if (effectiveRate >= 3.5 || currentMarkupPct >= 1.2) overchargeRisk = "high";
  else if (effectiveRate >= 2.9 || currentMarkupPct >= 0.75) overchargeRisk = "moderate";

  const flags: string[] = [];
  if (effectiveRate >= 3.5) {
    flags.push(`Effective rate of ${effectiveRate.toFixed(2)}% is well above the ~2.5–2.9% norm.`);
  } else if (effectiveRate >= 2.9) {
    flags.push(`Effective rate of ${effectiveRate.toFixed(2)}% is on the high side.`);
  }
  if (currentMarkupPct >= 0.75) {
    flags.push(`Processor markup of ${currentMarkupPct.toFixed(2)}% over cost is above a competitive ~0.3–0.5%.`);
  }
  if (junkFeeItems.length > 0) {
    flags.push(
      `${junkFeeItems.length} padding/junk fee${junkFeeItems.length > 1 ? "s" : ""} detected (${
        junkFeeItems.slice(0, 3).map((i) => i.label).join(", ")
      }${junkFeeItems.length > 3 ? "…" : ""}).`,
    );
  }
  if (monthlySavings > 0 && savingsPct >= 10) {
    flags.push(`Est. ${savingsPct.toFixed(0)}% fee reduction available on the MerchantHaus program.`);
  }

  return {
    volume,
    txCount,
    avgTicket,
    currentFees,
    effectiveRate,
    interchangeCost,
    assessmentsCost,
    trueCost,
    costFromStatement,
    currentMarkup,
    currentMarkupPct,
    junkFees,
    junkFeeItems,
    proposedMarkup,
    proposedMonthly,
    proposedFeesTotal,
    proposedEffectiveRate,
    monthlySavings,
    annualSavings,
    savingsPct,
    overchargeRisk,
    flags,
  };
}

export const fmtCurrency = (v: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);

export const fmtPct = (v: number, dp = 2): string =>
  `${(Number.isFinite(v) ? v : 0).toFixed(dp)}%`;
