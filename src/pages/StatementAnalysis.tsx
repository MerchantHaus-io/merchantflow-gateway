import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ScanSearch, Upload, FileText, Loader2, CheckCircle2, AlertTriangle,
  TrendingDown, Sparkles, Plus, Trash2, FileDown, RotateCcw, ShieldCheck, Pencil,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ExtractedStatement, FeeLineItem, FeeCategory,
  BenchmarkAssumptions, DEFAULT_ASSUMPTIONS,
  benchmarkStatement, fmtCurrency, fmtPct,
} from "@/lib/statement-analysis";
import { generateStatementProposalPdf, ProposalMeta } from "@/lib/statementProposalPdf";

const MAX_FILE_MB = 12;

const CATEGORY_LABELS: Record<FeeCategory, string> = {
  interchange: "Interchange",
  assessments: "Assessments",
  processor_markup: "Processor markup",
  authorization: "Authorization",
  monthly_fee: "Monthly fee",
  other: "Other",
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  moderate: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const StatementAnalysis = () => {
  const { teamMemberName, user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [statement, setStatement] = useState<ExtractedStatement | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<BenchmarkAssumptions>(DEFAULT_ASSUMPTIONS);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [exporting, setExporting] = useState(false);

  const result = useMemo(
    () => (statement ? benchmarkStatement(statement, assumptions) : null),
    [statement, assumptions],
  );

  const analyze = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File is too large (max ${MAX_FILE_MB}MB).`);
      return;
    }
    const okType = /pdf|image\//.test(file.type) || /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!okType) {
      toast.error("Upload a PDF or image of the processing statement.");
      return;
    }

    setLoading(true);
    setStatement(null);
    setFileName(file.name);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { data, error } = await supabase.functions.invoke("analyze-statement", {
        body: { file_base64: dataUrl, file_name: file.name },
      });
      if (error) {
        // Edge function returns JSON error bodies on non-2xx.
        let msg = error.message || "Analysis failed";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      const s = data?.statement as ExtractedStatement | undefined;
      if (!s) throw new Error("No statement data returned.");

      // Normalise line items so the editor always has a well-formed array.
      s.fee_line_items = Array.isArray(s.fee_line_items)
        ? s.fee_line_items.map((i) => ({
            label: String(i.label ?? "Fee"),
            amount: Number(i.amount) || 0,
            category: (i.category as FeeCategory) ?? "other",
            is_junk: Boolean(i.is_junk),
          }))
        : [];
      setStatement(s);
      setConfidence(s.confidence ?? null);
      setNotes(s.notes ?? null);
      toast.success("Statement analyzed — review the figures below before generating a proposal.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
      setFileName(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) analyze(file);
    },
    [analyze],
  );

  const patch = (p: Partial<ExtractedStatement>) =>
    setStatement((prev) => (prev ? { ...prev, ...p } : prev));

  const patchLine = (idx: number, p: Partial<FeeLineItem>) =>
    setStatement((prev) => {
      if (!prev) return prev;
      const items = [...prev.fee_line_items];
      items[idx] = { ...items[idx], ...p };
      return { ...prev, fee_line_items: items };
    });

  const addLine = () =>
    setStatement((prev) =>
      prev
        ? {
            ...prev,
            fee_line_items: [
              ...prev.fee_line_items,
              { label: "New fee", amount: 0, category: "other", is_junk: false },
            ],
          }
        : prev,
    );

  const removeLine = (idx: number) =>
    setStatement((prev) =>
      prev ? { ...prev, fee_line_items: prev.fee_line_items.filter((_, i) => i !== idx) } : prev,
    );

  const reset = () => {
    setStatement(null);
    setFileName(null);
    setConfidence(null);
    setNotes(null);
    setAssumptions(DEFAULT_ASSUMPTIONS);
  };

  const exportProposal = useCallback(async () => {
    if (!statement || !result) return;
    setExporting(true);
    try {
      const meta: ProposalMeta = {
        merchantName: statement.merchant_name || "Prospective Merchant",
        currentProcessor: statement.current_processor || "",
        statementPeriod: statement.statement_period || "",
        preparedBy: teamMemberName || user?.email || "MerchantHaus",
        dateLabel: new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      };
      const doc = await generateStatementProposalPdf(statement, result, meta);
      const safe = (meta.merchantName || "merchant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      doc.save(`savings-proposal-${safe}.pdf`);
      toast.success("Branded proposal downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build proposal");
    } finally {
      setExporting(false);
    }
  }, [statement, result, teamMemberName, user]);

  const buildQuote = useCallback(() => {
    if (!statement || !result) return;
    navigate("/tools/quote-builder", {
      state: {
        prefill: {
          businessName: statement.merchant_name || "",
          monthlyVolume: Math.round(result.volume),
          averageTicket: result.avgTicket > 0 ? Math.round(result.avgTicket) : "",
          source: "statement-analyzer",
        },
      },
    });
  }, [statement, result, navigate]);

  return (
    <AppLayout pageTitle="Statement Analyzer">
      <div className="p-4 md:p-8 min-h-screen">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <ScanSearch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Statement Analyzer &amp; Fee Benchmarking
              </h1>
              <p className="text-xs text-muted-foreground">
                Upload a merchant statement, benchmark the fees against true cost, and generate a branded savings proposal.
              </p>
            </div>
          </div>

          {/* ─── Upload zone ─── */}
          {!statement && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "border-2 border-dashed rounded-2xl p-10 md:p-16 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border bg-card",
                loading && "pointer-events-none opacity-70",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) analyze(f);
                  e.target.value = "";
                }}
              />
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm font-medium text-foreground">Analyzing {fileName}…</p>
                  <p className="text-xs text-muted-foreground">
                    Reading every page and extracting volume, fees and line items. This usually takes a few seconds.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Drop a processing statement here
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF or image · up to {MAX_FILE_MB}MB · analysis in seconds, not hours
                    </p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <FileText className="h-4 w-4" />
                    Choose statement
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Results ─── */}
          {statement && result && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LEFT: verification / editing */}
              <div className="lg:col-span-1 space-y-5">
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Verify extracted data
                    </h2>
                    {confidence && (
                      <span
                        className={cn(
                          "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border",
                          confidence === "high"
                            ? RISK_STYLES.low
                            : confidence === "medium"
                              ? RISK_STYLES.moderate
                              : RISK_STYLES.high,
                        )}
                      >
                        {confidence} confidence
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-2 flex items-start gap-1.5">
                    <Pencil className="h-3 w-3 mt-0.5 shrink-0" />
                    AI extracts ~90% — check these numbers against the statement before sending anything to the merchant.
                  </p>

                  <Field label="Merchant / DBA">
                    <input
                      className={inputCls}
                      value={statement.merchant_name ?? ""}
                      onChange={(e) => patch({ merchant_name: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Current processor">
                      <input
                        className={inputCls}
                        value={statement.current_processor ?? ""}
                        onChange={(e) => patch({ current_processor: e.target.value })}
                      />
                    </Field>
                    <Field label="Statement period">
                      <input
                        className={inputCls}
                        value={statement.statement_period ?? ""}
                        onChange={(e) => patch({ statement_period: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Monthly volume ($)">
                      <input
                        type="number"
                        className={inputCls}
                        value={statement.total_volume ?? 0}
                        onChange={(e) => patch({ total_volume: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Transactions">
                      <input
                        type="number"
                        className={inputCls}
                        value={statement.transaction_count ?? 0}
                        onChange={(e) => patch({ transaction_count: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                  <Field label="Total fees charged ($)">
                    <input
                      type="number"
                      className={inputCls}
                      value={statement.total_fees ?? 0}
                      onChange={(e) => patch({ total_fees: Number(e.target.value) })}
                    />
                  </Field>
                </div>

                {/* Fee line items */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Fee line items</h2>
                    <button
                      onClick={addLine}
                      className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {statement.fee_line_items.length === 0 && (
                      <p className="text-xs text-muted-foreground">No itemised fees extracted.</p>
                    )}
                    {statement.fee_line_items.map((item, idx) => (
                      <div key={idx} className="border border-border rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            className={cn(inputCls, "flex-1")}
                            value={item.label}
                            onChange={(e) => patchLine(idx, { label: e.target.value })}
                          />
                          <button
                            onClick={() => removeLine(idx)}
                            className="text-muted-foreground hover:text-red-500"
                            aria-label="Remove fee"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className={cn(inputCls, "w-24")}
                            value={item.amount}
                            onChange={(e) => patchLine(idx, { amount: Number(e.target.value) })}
                          />
                          <select
                            className={cn(inputCls, "flex-1")}
                            value={item.category}
                            onChange={(e) => patchLine(idx, { category: e.target.value as FeeCategory })}
                          >
                            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={item.is_junk}
                              onChange={(e) => patchLine(idx, { is_junk: e.target.checked })}
                            />
                            junk
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Benchmark assumptions */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <button
                    className="w-full flex items-center justify-between text-sm font-semibold text-foreground"
                    onClick={() => setShowAssumptions((v) => !v)}
                  >
                    <span>Benchmark &amp; proposed pricing</span>
                    <span className="text-xs text-muted-foreground">{showAssumptions ? "Hide" : "Edit"}</span>
                  </button>
                  {showAssumptions && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <AssumptionField label="Interchange %" k="interchangeRatePct" a={assumptions} set={setAssumptions} step="0.01" />
                      <AssumptionField label="Interchange / tx" k="interchangePerTx" a={assumptions} set={setAssumptions} step="0.01" />
                      <AssumptionField label="Assessments %" k="assessmentsPct" a={assumptions} set={setAssumptions} step="0.01" />
                      <AssumptionField label="Our markup %" k="proposedMarkupPct" a={assumptions} set={setAssumptions} step="0.01" />
                      <AssumptionField label="Our fee / tx" k="proposedPerTx" a={assumptions} set={setAssumptions} step="0.01" />
                      <AssumptionField label="Our monthly $" k="proposedMonthlyFees" a={assumptions} set={setAssumptions} step="0.5" />
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: benchmark dashboard */}
              <div className="lg:col-span-2 space-y-6">
                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {fileName && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{fileName}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={reset}
                      className="inline-flex items-center gap-2 border border-border text-foreground rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" /> New statement
                    </button>
                    <button
                      onClick={buildQuote}
                      className="inline-flex items-center gap-2 border border-border text-foreground rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <FileSignature className="h-4 w-4" /> Build quote
                    </button>
                    <button
                      onClick={exportProposal}
                      disabled={exporting}
                      className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      Generate branded proposal
                    </button>
                  </div>
                </div>

                {/* Savings hero */}
                <div className="bg-foreground text-background rounded-2xl p-6 md:p-8">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70 mb-4">
                    <TrendingDown className="h-4 w-4" /> Estimated savings on the MerchantHaus program
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <HeroStat value={fmtCurrency(Math.max(0, result.monthlySavings))} label="Per month" highlight={result.monthlySavings > 0} />
                    <HeroStat value={fmtCurrency(Math.max(0, result.annualSavings))} label="Per year" highlight={result.monthlySavings > 0} />
                    <HeroStat value={result.savingsPct > 0 ? `${result.savingsPct.toFixed(0)}%` : "—"} label="Fee reduction" highlight={result.savingsPct > 0} />
                  </div>
                  {result.monthlySavings <= 0 && (
                    <p className="text-xs opacity-70 mt-4">
                      This merchant is already priced competitively — no clear savings at the current assumptions.
                    </p>
                  )}
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Metric label="Effective rate" value={fmtPct(result.effectiveRate)} sub="fees ÷ volume" />
                  <Metric label="Current fees" value={fmtCurrency(result.currentFees)} sub="this period" />
                  <Metric label="True cost" value={fmtCurrency(result.trueCost)} sub={result.costFromStatement ? "from statement" : "benchmarked"} />
                  <Metric label="Processor markup" value={fmtCurrency(result.currentMarkup)} sub={fmtPct(result.currentMarkupPct)} accent />
                </div>

                {/* Overcharge risk + flags */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-primary" /> Fee benchmarking findings
                    </h2>
                    <span className={cn("text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border", RISK_STYLES[result.overchargeRisk])}>
                      {result.overchargeRisk} overcharge risk
                    </span>
                  </div>
                  {result.flags.length > 0 ? (
                    <ul className="space-y-2">
                      {result.flags.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" /> No major red flags — fees look reasonable.
                    </p>
                  )}
                  {notes && <p className="text-[11px] text-muted-foreground border-t border-border pt-3">Analyst note: {notes}</p>}
                </div>

                {/* Comparison table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">Current vs. MerchantHaus</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-medium px-5 py-2.5"></th>
                        <th className="text-right font-medium px-5 py-2.5">Current</th>
                        <th className="text-right font-medium px-5 py-2.5">MerchantHaus</th>
                      </tr>
                    </thead>
                    <tbody>
                      <CompareRow label="Total monthly fees" a={fmtCurrency(result.currentFees)} b={fmtCurrency(result.proposedFeesTotal)} />
                      <CompareRow label="Effective rate" a={fmtPct(result.effectiveRate)} b={fmtPct(result.proposedEffectiveRate)} />
                      <CompareRow label="Markup over cost" a={fmtCurrency(result.currentMarkup)} b={fmtCurrency(result.proposedMarkup + result.proposedMonthly)} />
                      <CompareRow label="Junk / padding fees" a={fmtCurrency(result.junkFees)} b={fmtCurrency(0)} highlight />
                    </tbody>
                  </table>
                </div>

                {/* Junk fees */}
                {result.junkFeeItems.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-foreground mb-3">Padding &amp; junk fees identified</h2>
                    <div className="space-y-1.5">
                      {result.junkFeeItems.map((i, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{i.label}</span>
                          <span className="font-mono text-red-500 font-semibold">{fmtCurrency(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

const inputCls =
  "w-full bg-background border border-border rounded-lg py-1.5 px-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
    {children}
  </div>
);

const AssumptionField = ({
  label, k, a, set, step,
}: {
  label: string;
  k: keyof BenchmarkAssumptions;
  a: BenchmarkAssumptions;
  set: React.Dispatch<React.SetStateAction<BenchmarkAssumptions>>;
  step: string;
}) => (
  <Field label={label}>
    <input
      type="number"
      step={step}
      className={inputCls}
      value={a[k]}
      onChange={(e) => set((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
    />
  </Field>
);

const HeroStat = ({ value, label, highlight }: { value: string; label: string; highlight: boolean }) => (
  <div>
    <div className={cn("text-2xl md:text-3xl font-bold tracking-tight", highlight ? "text-green-400" : "text-background")}>
      {value}
    </div>
    <div className="text-[11px] uppercase tracking-wide opacity-70 mt-1">{label}</div>
  </div>
);

const Metric = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn("text-lg font-bold mt-1", accent ? "text-primary" : "text-foreground")}>{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

const CompareRow = ({ label, a, b, highlight }: { label: string; a: string; b: string; highlight?: boolean }) => (
  <tr className="border-b border-border last:border-0">
    <td className="px-5 py-2.5 text-muted-foreground">{label}</td>
    <td className={cn("px-5 py-2.5 text-right font-mono", highlight && "text-red-500")}>{a}</td>
    <td className="px-5 py-2.5 text-right font-mono font-semibold text-foreground">{b}</td>
  </tr>
);

export default StatementAnalysis;
