import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  Calculator, DollarSign, TrendingUp, CreditCard,
  PieChart, BarChart3, Info, Percent, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   MerchantHaus Revenue Calculator
   
   Pricing model:
   • Merchant pays 2.92% + $0.30 per transaction (interchange included)
   • MerchantHaus keeps 30% revenue share on the processing fee margin
   • Interchange cost is estimated at ~1.80% + $0.10 per transaction
   ═══════════════════════════════════════════════════════════ */

const DEFAULTS = {
  merchantRate: 2.92,          // % charged to merchant
  perTransaction: 0.30,        // $ per transaction
  revenueShare: 30,            // % MerchantHaus keeps
  interchangeRate: 1.80,       // estimated avg interchange %
  interchangePerTx: 0.10,      // estimated avg interchange per-tx
  monthlyPlatformFee: 9.95,    // monthly gateway/platform fee
  pciFee: 4.95,                // monthly PCI compliance fee
};

const fmt = (val: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

const RevenueCalculator = () => {
  // Merchant inputs
  const [volume, setVolume] = useState(50000);
  const [avgTicket, setAvgTicket] = useState(75);

  // Rate inputs (adjustable)
  const [merchantRate, setMerchantRate] = useState(DEFAULTS.merchantRate);
  const [perTx, setPerTx] = useState(DEFAULTS.perTransaction);
  const [revShare, setRevShare] = useState(DEFAULTS.revenueShare);
  const [interchangeRate, setInterchangeRate] = useState(DEFAULTS.interchangeRate);
  const [interchangePerTx, setInterchangePerTx] = useState(DEFAULTS.interchangePerTx);
  const [monthlyFee, setMonthlyFee] = useState(DEFAULTS.monthlyPlatformFee);
  const [pciFee, setPciFee] = useState(DEFAULTS.pciFee);

  // Derived
  const txCount = avgTicket > 0 ? Math.ceil(volume / avgTicket) : 0;

  // What the merchant pays
  const merchantPercentFee = volume * (merchantRate / 100);
  const merchantTxFee = txCount * perTx;
  const merchantFixedFees = monthlyFee + pciFee;
  const totalMerchantCost = merchantPercentFee + merchantTxFee + merchantFixedFees;
  const effectiveRate = volume > 0 ? (totalMerchantCost / volume) * 100 : 0;

  // Interchange cost (what we pay the card networks)
  const interchangeCostPercent = volume * (interchangeRate / 100);
  const interchangeCostPerTx = txCount * interchangePerTx;
  const totalInterchange = interchangeCostPercent + interchangeCostPerTx;

  // Gross margin (what's left after interchange)
  const grossMarginPercent = merchantPercentFee - interchangeCostPercent;
  const grossMarginPerTx = merchantTxFee - interchangeCostPerTx;
  const totalGrossMargin = grossMarginPercent + grossMarginPerTx;

  // Revenue share split
  const hausShare = totalGrossMargin * (revShare / 100);
  const processorShare = totalGrossMargin * ((100 - revShare) / 100);

  // Per-transaction breakdown for merchant
  const costPerTransaction = volume > 0 && txCount > 0
    ? totalMerchantCost / txCount
    : 0;

  return (
    <AppLayout pageTitle="Revenue Calculator">
      <div className="p-4 md:p-8 min-h-screen">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Processing Fee Calculator
              </h1>
              <p className="text-xs text-muted-foreground">
                Calculate what a merchant pays &amp; our revenue share
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ─── LEFT: INPUTS ─── */}
            <div className="lg:col-span-1 space-y-5">

              {/* Merchant Volume */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Merchant Volume
                </h2>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Monthly Volume ($)</label>
                  <input
                    type="number"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Average Ticket ($)</label>
                  <input
                    type="number"
                    value={avgTicket}
                    onChange={(e) => setAvgTicket(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="pt-2 border-t border-border flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Transactions</span>
                  <span className="font-mono font-bold text-primary">{txCount.toLocaleString()}</span>
                </div>
              </div>

              {/* Rate Configuration */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" />
                  Rate Configuration
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Merchant Rate (%)</label>
                    <input
                      type="number" step="0.01"
                      value={merchantRate}
                      onChange={(e) => setMerchantRate(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Per Transaction ($)</label>
                    <input
                      type="number" step="0.01"
                      value={perTx}
                      onChange={(e) => setPerTx(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Interchange (%)</label>
                    <input
                      type="number" step="0.01"
                      value={interchangeRate}
                      onChange={(e) => setInterchangeRate(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">IC Per Tx ($)</label>
                    <input
                      type="number" step="0.01"
                      value={interchangePerTx}
                      onChange={(e) => setInterchangePerTx(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Revenue Share (Our %)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min="0" max="100"
                      value={revShare}
                      onChange={(e) => setRevShare(Number(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className="w-12 text-right font-mono text-sm text-foreground font-bold">{revShare}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Monthly Fee ($)</label>
                    <input
                      type="number" step="0.01"
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">PCI Fee ($)</label>
                    <input
                      type="number" step="0.01"
                      value={pciFee}
                      onChange={(e) => setPciFee(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── RIGHT: RESULTS ─── */}
            <div className="lg:col-span-2 space-y-5">

              {/* Hero Result */}
              <div className="bg-card border border-border rounded-xl p-6 md:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-3xl rounded-full pointer-events-none" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Merchant Pays Monthly</p>
                    <p className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">{fmt(totalMerchantCost)}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Effective rate: <span className="font-mono font-bold text-primary">{effectiveRate.toFixed(2)}%</span>
                    </p>
                  </div>
                  <div className="flex flex-col justify-center space-y-3 border-t md:border-t-0 md:border-l border-border md:pl-6 pt-4 md:pt-0">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Our Revenue Share</span>
                      <span className="text-lg font-bold text-emerald-500">{fmt(hausShare)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Processor Share</span>
                      <span className="text-lg font-bold text-foreground">{fmt(processorShare)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="text-sm text-muted-foreground">Cost Per Transaction</span>
                      <span className="text-sm font-mono font-bold text-foreground">{fmt(costPerTransaction)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Merchant Fee Breakdown */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 bg-muted/30 border-b border-border flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">What The Merchant Pays</h3>
                </div>
                <div className="p-5">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left pb-3 font-medium">Fee</th>
                        <th className="text-right pb-3 font-medium">Rate</th>
                        <th className="text-right pb-3 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <tr>
                        <td className="py-3">
                          <div className="font-medium text-foreground">Processing Fee</div>
                          <div className="text-xs text-muted-foreground">Interchange included</div>
                        </td>
                        <td className="text-right py-3 text-muted-foreground">{merchantRate}%</td>
                        <td className="text-right py-3 font-mono font-medium text-foreground">{fmt(merchantPercentFee)}</td>
                      </tr>
                      <tr>
                        <td className="py-3">
                          <div className="font-medium text-foreground">Per Transaction</div>
                          <div className="text-xs text-muted-foreground">{txCount.toLocaleString()} transactions</div>
                        </td>
                        <td className="text-right py-3 text-muted-foreground">${perTx.toFixed(2)}/tx</td>
                        <td className="text-right py-3 font-mono font-medium text-foreground">{fmt(merchantTxFee)}</td>
                      </tr>
                      <tr>
                        <td className="py-3">
                          <div className="font-medium text-foreground">Monthly Fees</div>
                          <div className="text-xs text-muted-foreground">Platform + PCI compliance</div>
                        </td>
                        <td className="text-right py-3 text-muted-foreground">Fixed</td>
                        <td className="text-right py-3 font-mono font-medium text-foreground">{fmt(merchantFixedFees)}</td>
                      </tr>
                    </tbody>
                    <tfoot className="border-t-2 border-border">
                      <tr>
                        <td className="pt-4 font-bold text-foreground">Total Monthly Cost</td>
                        <td className="pt-4 text-right text-xs text-muted-foreground">{effectiveRate.toFixed(2)}% eff.</td>
                        <td className="pt-4 text-right font-bold text-xl font-mono text-primary">{fmt(totalMerchantCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Margin Waterfall */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 bg-muted/30 border-b border-border flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Margin Waterfall</h3>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { label: "Merchant Processing Fees", value: merchantPercentFee + merchantTxFee, color: "bg-primary" },
                    { label: "Less: Interchange Cost", value: -totalInterchange, color: "bg-destructive" },
                    { label: "= Gross Margin", value: totalGrossMargin, color: "bg-amber-500" },
                    { label: `Our Share (${revShare}%)`, value: hausShare, color: "bg-emerald-500" },
                    { label: `Processor Share (${100 - revShare}%)`, value: processorShare, color: "bg-blue-500" },
                  ].map((row, i) => {
                    const maxVal = merchantPercentFee + merchantTxFee;
                    const pct = maxVal > 0 ? (Math.abs(row.value) / maxVal) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-[180px] shrink-0 text-xs text-muted-foreground">{row.label}</div>
                        <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", row.color)} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className={cn("w-24 text-right text-xs font-mono font-bold", row.value < 0 ? "text-destructive" : "text-foreground")}>
                          {row.value < 0 ? `(${fmt(Math.abs(row.value))})` : fmt(row.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: "Merchant Pays", value: fmt(totalMerchantCost), sub: `${effectiveRate.toFixed(2)}% effective`, accent: false },
                  { label: "Interchange", value: fmt(totalInterchange), sub: `${interchangeRate}% + $${interchangePerTx.toFixed(2)}/tx`, accent: false },
                  { label: "Gross Margin", value: fmt(totalGrossMargin), sub: "After interchange", accent: false },
                  { label: "Our Residual", value: fmt(hausShare), sub: `${revShare}% rev share`, accent: true },
                ].map((card, i) => (
                  <div key={i} className={cn("bg-card border rounded-xl p-4 text-center", card.accent ? "border-emerald-500/40 bg-emerald-500/5" : "border-border")}>
                    <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                    <p className={cn("text-lg font-bold font-mono", card.accent ? "text-emerald-500" : "text-foreground")}>{card.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Interchange rates are estimated averages (varies by card type, network, and transaction method). 
                  Actual interchange is set by Visa/Mastercard and passed through at cost. The {merchantRate}% rate charged to the merchant includes interchange — 
                  our margin is the spread above interchange, split {revShare}/{100 - revShare} with the processor.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default RevenueCalculator;
