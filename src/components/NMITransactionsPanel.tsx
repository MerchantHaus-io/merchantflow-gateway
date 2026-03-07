import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CheckCircle, XCircle, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
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

export const NMITransactionsPanel = ({ gatewayIds, accountName }: NMITransactionsPanelProps) => {
  const isMobile = useIsMobile();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["nmi-transactions", ...gatewayIds],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("nmi-transactions", {
        body: { gateway_ids: gatewayIds },
      });
      if (error) throw error;
      return (result?.results || []) as GatewayResult[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: gatewayIds.length > 0,
  });

  // Merge all results into one view
  const merged = data?.reduce<{ transactions: Transaction[]; summary: TransactionSummary; errors: string[] }>(
    (acc, r) => {
      if (r.error) acc.errors.push(`Gateway ${r.gateway_id}: ${r.error}`);
      acc.transactions.push(...(r.transactions || []));
      if (r.summary) {
        acc.summary.total_count += r.summary.total_count;
        acc.summary.approved_count += r.summary.approved_count;
        acc.summary.declined_count += r.summary.declined_count;
        acc.summary.total_amount += r.summary.total_amount;
        acc.summary.approved_amount += r.summary.approved_amount;
      }
      return acc;
    },
    { transactions: [], summary: { total_count: 0, approved_count: 0, declined_count: 0, total_amount: 0, approved_amount: 0 }, errors: [] }
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const getConditionBadge = (condition: string) => {
    const c = (condition || "").toLowerCase();
    if (["complete", "pending", "pendingsettlement", "pending_settlement"].includes(c)) {
      return <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 dark:text-green-400">Approved</Badge>;
    }
    return <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">Declined</Badge>;
  };

  if (gatewayIds.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Gateway Transactions
        </h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 h-7 text-xs">
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Failed to load transactions.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {merged?.errors && merged.errors.length > 0 && (
            <Card className="border-destructive/30">
              <CardContent className="p-3 text-xs text-destructive">
                {merged.errors.map((e, i) => <p key={i}>{e}</p>)}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
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
                  <p className="text-[10px] text-muted-foreground">Volume</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transaction list */}
          {merged?.transactions && merged.transactions.length > 0 ? (
            isMobile ? (
              <div className="space-y-2">
                {merged.transactions.map((tx, idx) => (
                  <Card key={tx.id || idx} className="border-border/50">
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">${tx.amount || "0.00"}</span>
                        {getConditionBadge(tx.condition)}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tx.customer_name || "—"}</span>
                        <span>{tx.type || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tx.card_type} ···{tx.last_four}</span>
                        <span>{tx.date ? format(new Date(tx.date), "MMM dd, HH:mm") : "—"}</span>
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
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {merged.transactions.map((tx, idx) => (
                      <TableRow key={tx.id || idx}>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.date ? format(new Date(tx.date), "MMM dd, HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{tx.customer_name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">{tx.type || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.card_type} {tx.last_four ? `···${tx.last_four}` : ""}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">${tx.amount || "0.00"}</TableCell>
                        <TableCell>{getConditionBadge(tx.condition)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No transactions found in the last 30 days</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
