import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, CheckCircle, XCircle, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const GATEWAY_ACCOUNTS = [
  { id: "1240273", name: "EZ Self Storage" },
  { id: "1279268", name: "Masqueskin" },
  { id: "1279623", name: "Pop Nexss" },
] as const;

interface TransactionSummary {
  total_count: number;
  approved_count: number;
  declined_count: number;
  total_amount: number;
  approved_amount: number;
}

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

interface GatewayResult {
  gateway_id: string;
  error?: string;
  transactions: Transaction[];
  summary: TransactionSummary | null;
}

export const NMITransactionsPanel = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(GATEWAY_ACCOUNTS[0].id);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["nmi-transactions"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const { data: result, error } = await supabase.functions.invoke("nmi-transactions", {
        body: {
          gateway_ids: GATEWAY_ACCOUNTS.map((g) => g.id),
        },
      });

      if (error) throw error;
      return (result?.results || []) as GatewayResult[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const getGatewayName = (id: string) =>
    GATEWAY_ACCOUNTS.find((g) => g.id === id)?.name || id;

  const getResult = (gatewayId: string) =>
    data?.find((r) => r.gateway_id === gatewayId);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const getConditionBadge = (condition: string) => {
    const c = (condition || "").toLowerCase();
    if (c === "complete" || c === "pending" || c === "pendingsettlement" || c === "pending_settlement") {
      return <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 dark:text-green-400">Approved</Badge>;
    }
    return <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">Declined</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Gateway Transactions</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Failed to load transaction data. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${GATEWAY_ACCOUNTS.length}, 1fr)` }}>
            {GATEWAY_ACCOUNTS.map((g) => (
              <TabsTrigger key={g.id} value={g.id} className="text-xs sm:text-sm truncate">
                {g.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {GATEWAY_ACCOUNTS.map((gateway) => {
            const result = getResult(gateway.id);
            const summary = result?.summary;

            return (
              <TabsContent key={gateway.id} value={gateway.id} className="space-y-4">
                {result?.error ? (
                  <Card className="border-destructive/30">
                    <CardContent className="p-4 text-sm text-destructive">
                      Error fetching data for {gateway.name}: {result.error}
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <Card>
                        <CardContent className="p-3 flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Activity className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-foreground">{summary?.total_count ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">Transactions</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-foreground">{summary?.approved_count ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">Approved</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                            <XCircle className="h-4 w-4 text-destructive" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-foreground">{summary?.declined_count ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">Declined</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                            <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-foreground truncate">
                              {formatCurrency(summary?.approved_amount ?? 0)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Volume</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Transaction Table */}
                    {result?.transactions && result.transactions.length > 0 ? (
                      isMobile ? (
                        <div className="space-y-2">
                          {result.transactions.map((tx, idx) => (
                            <Card key={tx.id || idx} className="border-border/50">
                              <CardContent className="p-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">
                                    ${tx.amount || "0.00"}
                                  </span>
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
                              {result.transactions.map((tx, idx) => (
                                <TableRow key={tx.id || idx}>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {tx.date ? format(new Date(tx.date), "MMM dd, HH:mm") : "—"}
                                  </TableCell>
                                  <TableCell className="text-sm font-medium">
                                    {tx.customer_name || "—"}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground capitalize">
                                    {tx.type || "—"}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {tx.card_type} {tx.last_four ? `···${tx.last_four}` : ""}
                                  </TableCell>
                                  <TableCell className="text-sm text-right font-medium">
                                    ${tx.amount || "0.00"}
                                  </TableCell>
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
                          <p className="text-sm text-muted-foreground">No transactions found in the last 30 days</p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
};
