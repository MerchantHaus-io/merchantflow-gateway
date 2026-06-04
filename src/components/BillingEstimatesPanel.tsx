import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Receipt, RefreshCw, Download, DollarSign, FileText } from "lucide-react";
import { subDays, subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { cn } from "@/lib/utils";

// Invoice-mirrored pricing (per Eldred Auto Mgmt example: MH-2026-04-0-005)
const MONTHLY_GATEWAY_FEE = 59.0;
const PER_TX_GATEWAY_FEE = 0.25;
const PER_TX_EXTENSION_FEE = 0.15; // Vault + Kount

type DatePreset = "last_month" | "this_month" | "7d" | "30d" | "60d" | "90d";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "last_month", label: "Last month" },
  { value: "this_month", label: "This month" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
];

function fmtCompact(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function getRange(p: DatePreset) {
  const now = new Date();
  switch (p) {
    case "7d": return { start: subDays(now, 7), end: now };
    case "30d": return { start: subDays(now, 30), end: now };
    case "60d": return { start: subDays(now, 60), end: now };
    case "90d": return { start: subDays(now, 90), end: now };
    case "this_month": return { start: startOfMonth(now), end: now };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
  }
}
const currency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export interface BillingAccountInput {
  account_id: string;
  account: { name?: string; nmi_merchant_id?: string | null } | null | undefined;
  pipelines: ("processing" | "gateway_only")[];
}

interface Props {
  accounts: BillingAccountInput[];
}

export const BillingEstimatesPanel = ({ accounts }: Props) => {
  const [preset, setPreset] = useState<DatePreset>("last_month");
  const [includeExtensions, setIncludeExtensions] = useState(true);
  const { start, end } = getRange(preset);

  const accountIds = accounts.map((a) => a.account_id);

  // Pull boarding submissions to enrich gateway IDs
  const { data: boardings } = useQuery({
    queryKey: ["billing-boarding-ids", accountIds.sort().join(",")],
    queryFn: async () => {
      if (accountIds.length === 0) return [];
      const { data } = await supabase
        .from("nmi_boarding_submissions")
        .select("account_id, nmi_gateway_id")
        .in("account_id", accountIds)
        .not("nmi_gateway_id", "is", null);
      return data || [];
    },
    enabled: accountIds.length > 0,
  });

  // gateway_id -> account_id map; account -> [gateway_ids]
  const { allGatewayIds, accountToIds } = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of accounts) {
      const ids: string[] = [];
      if (a.account?.nmi_merchant_id) ids.push(String(a.account.nmi_merchant_id).trim());
      for (const b of boardings || []) {
        if (b.account_id === a.account_id && b.nmi_gateway_id) ids.push(String(b.nmi_gateway_id).trim());
      }
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length) map.set(a.account_id, unique);
    }
    const all = [...new Set([...map.values()].flat())];
    return { allGatewayIds: all, accountToIds: map };
  }, [accounts, boardings]);

  const { data, isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ["billing-estimates", allGatewayIds.sort().join(","), preset],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("nmi-transactions", {
        body: {
          gateway_ids: allGatewayIds,
          start_date: fmtCompact(start),
          end_date: fmtCompact(end),
        },
      });
      if (error) throw error;
      const results = (result?.results || []) as Array<{
        gateway_id: string;
        summary: { approved_count: number; total_count: number; approved_amount: number } | null;
      }>;
      const byId: Record<string, { count: number; volume: number }> = {};
      for (const r of results) {
        byId[r.gateway_id] = {
          count: r.summary?.approved_count ?? 0,
          volume: r.summary?.approved_amount ?? 0,
        };
      }
      return byId;
    },
    enabled: allGatewayIds.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const rows = useMemo(() => {
    return accounts
      .filter((a) => accountToIds.has(a.account_id))
      .map((a) => {
        const ids = accountToIds.get(a.account_id)!;
        const count = ids.reduce((sum, id) => sum + (data?.[id]?.count ?? 0), 0);
        const volume = ids.reduce((sum, id) => sum + (data?.[id]?.volume ?? 0), 0);
        const hasGateway = a.pipelines.includes("gateway_only") || a.pipelines.includes("processing");
        const monthly = hasGateway ? MONTHLY_GATEWAY_FEE : 0;
        const perTx = count * PER_TX_GATEWAY_FEE;
        const ext = includeExtensions ? count * PER_TX_EXTENSION_FEE : 0;
        return {
          account_id: a.account_id,
          name: a.account?.name || "Unknown",
          ids,
          pipelines: a.pipelines,
          count,
          volume,
          monthly,
          perTx,
          ext,
          total: monthly + perTx + ext,
        };
      })
      .sort((x, y) => y.total - x.total);
  }, [accounts, accountToIds, data, includeExtensions]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          count: acc.count + r.count,
          volume: acc.volume + r.volume,
          monthly: acc.monthly + r.monthly,
          perTx: acc.perTx + r.perTx,
          ext: acc.ext + r.ext,
          total: acc.total + r.total,
        }),
        { count: 0, volume: 0, monthly: 0, perTx: 0, ext: 0, total: 0 },
      ),
    [rows],
  );

  const exportCsv = () => {
    const header = [
      "Account", "MIDs", "Pipelines", "Transactions", "Approved Volume",
      "Monthly Gateway Fee", "Per-Tx Gateway Fee", "Extension Fee", "Total Billable",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.ids.join("; ")}"`,
        `"${r.pipelines.join("; ")}"`,
        r.count,
        r.volume.toFixed(2),
        r.monthly.toFixed(2),
        r.perTx.toFixed(2),
        r.ext.toFixed(2),
        r.total.toFixed(2),
      ].join(","));
    }
    lines.push([
      "TOTAL", "", "",
      totals.count, totals.volume.toFixed(2),
      totals.monthly.toFixed(2), totals.perTx.toFixed(2), totals.ext.toFixed(2), totals.total.toFixed(2),
    ].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-estimates_${preset}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-amber-400/30 dark:border-amber-500/20 bg-gradient-to-br from-amber-50/40 to-background dark:from-amber-950/15 dark:to-background">
      <CardContent className="p-4 lg:p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <Receipt className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Monthly Billing Estimates</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-calculated from NMI gateway transactions · ${MONTHLY_GATEWAY_FEE.toFixed(2)} monthly + ${PER_TX_GATEWAY_FEE.toFixed(2)}/tx
                {includeExtensions && ` + $${PER_TX_EXTENSION_FEE.toFixed(2)}/tx ext`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border/50 bg-background">
              <Switch
                id="include-ext"
                checked={includeExtensions}
                onCheckedChange={setIncludeExtensions}
                className="scale-75"
              />
              <Label htmlFor="include-ext" className="text-xs cursor-pointer">Vault + Kount</Label>
            </div>
            <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
              <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs gap-1.5">
              <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} className="h-8 text-xs gap-1.5">
              <Download className="h-3 w-3" />
              CSV
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Service period: {format(start, "MMM d, yyyy")} – {format(end, "MMM d, yyyy")} (CT)
        </p>

        {/* Empty / loading / error */}
        {allGatewayIds.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No gateway IDs found across these accounts.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Failed to load transaction data.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">Retry</Button>
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <SummaryTile label="Accounts billed" value={String(rows.filter((r) => r.total > 0).length)} />
              <SummaryTile label="Transactions" value={totals.count.toLocaleString()} />
              <SummaryTile label="Approved volume" value={currency(totals.volume)} />
              <SummaryTile label="Total billable" value={currency(totals.total)} highlight />
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border/50 bg-background overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Account</TableHead>
                    <TableHead className="text-xs text-right">Tx Count</TableHead>
                    <TableHead className="text-xs text-right hidden md:table-cell">Volume</TableHead>
                    <TableHead className="text-xs text-right">Monthly</TableHead>
                    <TableHead className="text-xs text-right">Per-Tx</TableHead>
                    {includeExtensions && <TableHead className="text-xs text-right hidden md:table-cell">Ext.</TableHead>}
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={includeExtensions ? 7 : 6} className="text-center text-xs text-muted-foreground py-6">
                        No billable accounts in this period.
                      </TableCell>
                    </TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.account_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium text-foreground">{r.name}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {r.ids.map((id) => (
                            <span key={id} className="text-[9px] font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                              {id}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{r.count.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-muted-foreground hidden md:table-cell">
                        {currency(r.volume)}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{currency(r.monthly)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{currency(r.perTx)}</TableCell>
                      {includeExtensions && (
                        <TableCell className="text-xs text-right tabular-nums hidden md:table-cell">{currency(r.ext)}</TableCell>
                      )}
                      <TableCell className="text-xs text-right tabular-nums font-semibold text-foreground">
                        {currency(r.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {rows.length > 0 && (
                  <tfoot className="border-t border-border bg-muted/30">
                    <tr>
                      <td className="px-4 py-2 text-xs font-semibold">Totals</td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums font-semibold">{totals.count.toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums font-semibold hidden md:table-cell">{currency(totals.volume)}</td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums font-semibold">{currency(totals.monthly)}</td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums font-semibold">{currency(totals.perTx)}</td>
                      {includeExtensions && (
                        <td className="px-4 py-2 text-xs text-right tabular-nums font-semibold hidden md:table-cell">{currency(totals.ext)}</td>
                      )}
                      <td className="px-4 py-2 text-xs text-right tabular-nums font-bold text-amber-700 dark:text-amber-400">
                        {currency(totals.total)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const SummaryTile = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className={cn(
    "rounded-md border px-3 py-2 bg-background",
    highlight ? "border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/20" : "border-border/50",
  )}>
    <div className="flex items-center gap-1.5">
      <DollarSign className={cn("h-3 w-3", highlight ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
    <p className={cn("text-base font-bold mt-0.5 tabular-nums", highlight ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
      {value}
    </p>
  </div>
);
