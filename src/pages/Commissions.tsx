import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, TrendingUp, TrendingDown, Users, BarChart3, RefreshCw, Download, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format, subMonths } from "date-fns";

/* ─────────────── helpers ─────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

const fmtCompact = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);

const pct = (v: number | null | undefined) =>
  v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";

const avatarColors = [
  { bg: "bg-blue-50 dark:bg-blue-950", text: "text-blue-600 dark:text-blue-400" },
  { bg: "bg-purple-50 dark:bg-purple-950", text: "text-purple-600 dark:text-purple-400" },
  { bg: "bg-teal-50 dark:bg-teal-950", text: "text-teal-600 dark:text-teal-400" },
  { bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
  { bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-600 dark:text-amber-400" },
];

const getAvatarColor = (name: string) => {
  const idx = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[idx];
};

/* ─────────────── types ─────────────── */
interface CommissionPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_volume: number;
  total_transactions: number;
  total_commission: number;
  fetched_at: string | null;
}

interface CommissionRecord {
  id: string;
  period_id: string;
  account_id: string | null;
  nmi_gateway_id: string;
  company_name: string | null;
  transaction_count: number;
  transaction_volume: number;
  transaction_fees: number;
  chargeback_fees: number;
  residual_amount: number;
  total_commission: number;
  volume_change_pct: number | null;
  commission_change_pct: number | null;
}

/* ─────────────── component ─────────────── */
export default function Commissions() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Generate last 12 months for selector
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(now, i);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: format(d, "MMM yyyy") };
  });

  const [selYear, selMonth] = selectedMonth.split("-").map(Number);

  // Fetch periods from DB
  const { data: periods } = useQuery({
    queryKey: ["commission-periods"],
    queryFn: async () => {
      const { data } = await supabase
        .from("commission_periods")
        .select("*")
        .order("period_start", { ascending: false })
        .limit(12);
      return (data || []) as CommissionPeriod[];
    },
  });

  // Fetch records for selected period
  const currentPeriod = periods?.find(
    (p) => p.period_start === `${selYear}-${String(selMonth).padStart(2, "0")}-01`
  );

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["commission-records", currentPeriod?.id],
    queryFn: async () => {
      if (!currentPeriod) return [];
      const { data } = await supabase
        .from("commission_records")
        .select("*")
        .eq("period_id", currentPeriod.id)
        .order("total_commission", { ascending: false });
      return (data || []) as CommissionRecord[];
    },
    enabled: !!currentPeriod,
  });

  // Previous period for comparison
  const prevPeriodDate = subMonths(new Date(selYear, selMonth - 1, 1), 1);
  const prevPeriod = periods?.find(
    (p) => p.period_start === `${prevPeriodDate.getFullYear()}-${String(prevPeriodDate.getMonth() + 1).padStart(2, "0")}-01`
  );

  const commissionChange = currentPeriod && prevPeriod
    ? ((currentPeriod.total_commission - prevPeriod.total_commission) / (prevPeriod.total_commission || 1)) * 100
    : null;

  const volumeChange = currentPeriod && prevPeriod
    ? ((currentPeriod.total_volume - prevPeriod.total_volume) / (prevPeriod.total_volume || 1)) * 100
    : null;

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("nmi-commissions", {
        body: { month: selMonth, year: selYear, persist: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Commission data synced for ${format(new Date(selYear, selMonth - 1), "MMM yyyy")}`);
      queryClient.invalidateQueries({ queryKey: ["commission-periods"] });
      queryClient.invalidateQueries({ queryKey: ["commission-records"] });
    },
    onError: (err: any) => {
      toast.error(`Sync failed: ${err.message || "Unknown error"}`);
    },
  });

  // Build trend data from periods
  const trendData = (periods || [])
    .slice(0, 6)
    .reverse()
    .map((p) => ({
      label: format(new Date(p.period_start), "MMM"),
      commission: p.total_commission,
      volume: p.total_volume,
      isCurrent: p.id === currentPeriod?.id,
    }));

  const maxCommission = Math.max(...trendData.map((d) => d.commission), 1);

  // Top earners (top 5)
  const topEarners = (records || []).slice(0, 5);

  // Export CSV
  const exportCSV = () => {
    if (!records?.length) return;
    const header = "Merchant,Merchant ID,Transactions,Volume,Fees,Commission,Change %";
    const rows = records.map((r) =>
      [r.company_name, r.nmi_gateway_id, r.transaction_count, r.transaction_volume, r.transaction_fees, r.total_commission, r.commission_change_pct ?? ""].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commissions-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader icon={BarChart3} title="Commission Reports" />

        {/* Period selector + actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px] font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="font-mono text-sm">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!records?.length}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing…" : "Sync from NMI"}
            </Button>
          </div>
        </div>

        {/* Hero stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden">
          <HeroStat
            label="Total Commission"
            value={currentPeriod ? fmt(currentPeriod.total_commission) : "—"}
            change={commissionChange}
            primary
          />
          <HeroStat
            label="Processing Volume"
            value={currentPeriod ? fmtCompact(currentPeriod.total_volume) : "—"}
            change={volumeChange}
          />
          <HeroStat
            label="Active Merchants"
            value={currentPeriod ? String(records?.length || 0) : "—"}
            sub={currentPeriod?.fetched_at ? `Last synced ${format(new Date(currentPeriod.fetched_at), "MMM d, HH:mm")}` : "Not yet synced"}
          />
        </div>

        {/* Content grid: chart + top earners */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Commission trend chart */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <span className="text-sm font-medium">Commission Trend</span>
              <span className="text-xs text-muted-foreground">Last 6 months</span>
            </div>
            <div className="p-6 h-[240px] flex items-end gap-3">
              {trendData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  No historical data yet — sync a few months to see trends
                </div>
              ) : (
                trendData.map((d, i) => {
                  const heightPct = (d.commission / maxCommission) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {fmtCompact(d.commission)}
                      </span>
                      <div className="w-full h-[160px] flex items-end justify-center">
                        <div
                          className={`w-[70%] rounded-t-md transition-all ${
                            d.isCurrent
                              ? "bg-gradient-to-t from-blue-600 to-blue-400"
                              : "bg-gradient-to-t from-emerald-600 to-emerald-400"
                          }`}
                          style={{ height: `${Math.max(heightPct, 4)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{d.label}</span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Top earners */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <span className="text-sm font-medium">Top Earners</span>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              {recordsLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : topEarners.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No commission data for this period
                </div>
              ) : (
                topEarners.map((r, i) => {
                  const color = getAvatarColor(r.company_name || "?");
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-6 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                      <span className="font-mono text-xs text-muted-foreground w-5">{i + 1}</span>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${color.bg} ${color.text}`}>
                        {(r.company_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.company_name || "Unknown"}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          Vol: {fmtCompact(r.transaction_volume)}
                        </div>
                      </div>
                      <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {fmt(r.total_commission)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Full merchant table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <span className="text-sm font-medium">All Merchants</span>
            <Badge variant="secondary" className="font-mono">
              {records?.length || 0} merchants
            </Badge>
          </div>

          {recordsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !records?.length ? (
            <div className="p-12 text-center">
              <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No commission data for {format(new Date(selYear, selMonth - 1), "MMMM yyyy")}</p>
              <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                Sync Now
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Merchant</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">MID</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Txns</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Volume</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fees</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Commission</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const color = getAvatarColor(r.company_name || "?");
                    const declining = (r.commission_change_pct ?? 0) < -10;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-border hover:bg-muted/20 transition-colors ${declining ? "border-l-[3px] border-l-amber-400" : ""}`}
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${color.bg} ${color.text}`}>
                              {(r.company_name || "?").charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{r.company_name || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{r.nmi_gateway_id}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm">{r.transaction_count.toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm">{fmt(r.transaction_volume)}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm">{fmt(r.transaction_fees)}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          {fmt(r.total_commission)}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {r.commission_change_pct != null ? (
                            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${r.commission_change_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {r.commission_change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {pct(r.commission_change_pct)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

/* ─────────────── sub-components ─────────────── */
function HeroStat({
  label,
  value,
  change,
  sub,
  primary,
}: {
  label: string;
  value: string;
  change?: number | null;
  sub?: string;
  primary?: boolean;
}) {
  return (
    <div className={`p-7 ${primary ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-card"}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
      <div className={`font-mono text-3xl font-medium tracking-tight ${primary ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        {value}
      </div>
      {change != null && (
        <div className="flex items-center gap-1 mt-1 text-xs">
          {change >= 0 ? (
            <TrendingUp className="h-3 w-3 text-emerald-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600" />
          )}
          <span className={change >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
            {pct(change)}
          </span>
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
