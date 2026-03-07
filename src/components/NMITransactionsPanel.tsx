import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CheckCircle, XCircle, Activity, RefreshCw, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Transaction {
  id: string;
  date: string;
  amount: string;
  condition: string;
  type: string;
  card_type: string;
  last_four: string;
  customer_name: string;
}

interface TransactionSummary {
  total_count: number;
  approved_count: number;
  declined_count: number;
  total_amount: number;
  approved_amount: number;
}

interface GatewayResult {
  gateway_id: string;
  error?: string;
  transactions: Transaction[];
  summary: TransactionSummary | null;
}

interface NMITransactionsPanelProps {
  gatewayIds: string[];
  accountName?: string;
}

type DatePreset = "30d" | "7d" | "60d" | "90d" | "this_month" | "last_month";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "7d",         label: "Last 7 days" },
  { value: "30d",        label: "Last 30 days" },
  { value: "60d",        label: "Last 60 days" },
  { value: "90d",        label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

function formatNmiDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function getDateRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  switch (preset) {
    case "7d":
      return { startDate: formatNmiDate(subDays(now, 7)), endDate: formatNmiDate(now) };
    case "30d":
      return { startDate: formatNmiDate(subDays(now, 30)), endDate: formatNmiDate(now) };
    case "60d":
      return { startDate: formatNmiDate(subDays(now, 60)), endDate: formatNmiDate(now) };
    case "90d":
      return { startDate: formatNmiDate(subDays(now, 90)), endDate: formatNmiDate(now) };
    case "this_month":
      return { startDate: formatNmiDate(startOfMonth(now)), endDate: formatNmiDate(now) };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { startDate: formatNmiDate(startOfMonth(lm)), endDate: formatNmiDate(endOfMonth(lm)) };
    }
  }
}

export const NMITransactionsPanel = ({ gatewayIds, accountName }: NMITransactionsPanelProps) => {
  const isMobile = useIsMobile();
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");

  const { startDate, endDate } = getDateRange(datePreset);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["nmi-transactions", ...gatewayIds, datePreset],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("nmi-transactions", {
        body: { gateway_ids: gatewayIds, start_date: startDate, end_date: endDate },
      });
      if (error) throw error;
      return (result?.results || []) as GatewayResult[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: gatewayIds.length > 0,
  });

  // Merge all gateway results into one unified view
  const merged = data?.reduce<{ transactions: Transaction[]; summary: TransactionSummary; errors: { gateway_id: string; message: string }[] }>(
    (acc, r) => {
      if (r.error) acc.errors.push({ gateway_id: r.gateway_id, message: r.error });
      acc.transactions.push(...(r.transactions || []));
      if (r.summary) {
        acc.summary.total_count    += r.summary.total_count;
        acc.summary.approved_count += r.summary.approved_count;
        acc.summary.declined_count += r.summary.declined_count;
        acc.summary.total_amount   += r.summary.total_amount;
        acc.summary.approved_amount += r.summary.approved_amount;
      }
      return acc;
    },
    {
      transactions: [],
      summary: { total_count: 0, approved_count: 0, declined_count: 0, total_amount: 0, approved_amount: 0 },
      errors: [],
    }
  );

  // Sort transactions newest-first
  const sortedTransactions = (merged?.transactions || []).sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const getConditionBadge = (condition: string) => {
    const c = (condition || "").toLowerCase();
    if (["complete", "pending", "pendingsettlement", "pending_settlement"].includes(c)) {
      return (
        <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/5">
          Approved
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs border-destructive/50 text-destructive bg-destructive/5">
        Declined
      </Badge>
    );
  };

  const formatTxDate = (dateStr: string) => {
    try {
      // NMI date format is "YYYY-MM-DD HH:MM:SS" or "YYYYMMDDHHMMSS"
      const normalized = dateStr.includes("-") ? dateStr : dateStr.replace(
        /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
        "$1-$2-$3T$4:$5:$6"
      );
      return format(new Date(normalized), "MMM dd, HH:mm");
    } catch {
      return dateStr || "—";
    }
  };

  if (gatewayIds.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Gateway Transactions
          {gatewayIds.length > 1 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({gatewayIds.length} gateways)
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {/* Date range picker */}
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="h-7 text-xs w-[130px] bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 h-7 text-xs"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Gateway ID pills */}
      <div className="flex flex-wrap gap-1.5">
        {gatewayIds.map((id) => (
          <span key={id} className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded border border-border/50 text-muted-foreground">
            ID: {id}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive/50" />
            <p className="text-sm text-muted-foreground">Failed to load transactions.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Gateway-level errors */}
          {merged?.errors && merged.errors.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-3 space-y-1">
                {merged.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span><span className="font-mono">{e.gateway_id}</span>: {e.message}</span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Tip: Verify the gateway ID is correct and the NMI_API_KEY has access to this sub-merchant.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">{merged?.summary.total_count ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Transactions</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">{merged?.summary.approved_count ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Approved</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center shrink-0">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">{merged?.summary.declined_count ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Declined</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground truncate">{formatCurrency(merged?.summary.approved_amount ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">Approved volume</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transaction list */}
          {sortedTransactions.length > 0 ? (
            isMobile ? (
              <div className="space-y-2">
                {sortedTransactions.map((tx, idx) => (
                  <Card key={tx.id || idx} className="border-border/50">
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">${tx.amount || "0.00"}</span>
                        {getConditionBadge(tx.condition)}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tx.customer_name || "—"}</span>
                        <span className="capitalize">{tx.type || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tx.card_type}{tx.last_four ? ` ···${tx.last_four}` : ""}</span>
                        <span>{tx.date ? formatTxDate(tx.date) : "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Card</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTransactions.map((tx, idx) => (
                      <TableRow key={tx.id || idx}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {tx.date ? formatTxDate(tx.date) : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{tx.customer_name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground capitalize">{tx.type || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {tx.card_type}{tx.last_four ? ` ···${tx.last_four}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold">${tx.amount || "0.00"}</TableCell>
                        <TableCell>{getConditionBadge(tx.condition)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">No transactions found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No activity for {DATE_PRESETS.find(p => p.value === datePreset)?.label.toLowerCase()}.
                  Try expanding the date range.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
