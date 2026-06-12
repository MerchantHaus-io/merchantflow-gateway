import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Search } from "lucide-react";

type Merchant = Record<string, any>;

const STATUS_FILTERS = ["all", "active", "pending", "test", "inactive"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function GatewayAccounts() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["gateway-accounts", statusFilter, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("limit", "1000");

      const { data, error } = await supabase.functions.invoke(
        `gateway-accounts?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return data as {
        merchants: Merchant[];
        total: number;
        counts: Record<string, number>;
      };
    },
  });

  const merchants = data?.merchants ?? [];
  const counts = data?.counts ?? {};

  const statusColor = (s?: string) => {
    const v = (s || "").toLowerCase();
    if (v === "active") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    if (v === "pending") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    if (v === "test" || v === "sandbox") return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    if (v === "inactive" || v === "disabled") return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const totalsBar = useMemo(() => {
    const entries = Object.entries(counts);
    if (!entries.length) return null;
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        {entries.map(([k, v]) => (
          <Badge key={k} variant="outline" className={statusColor(k)}>
            {k}: {v}
          </Badge>
        ))}
      </div>
    );
  }, [counts]);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <PageHeader
          title="Gateway Accounts"
          subtitle="All merchants on the secure portal — active, pending, test, and inactive"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, DBA, email…"
                className="pl-8 w-64"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {totalsBar}

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading merchants…
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>DBA</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>NMI Gateway</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Activated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No merchants found.
                    </TableCell>
                  </TableRow>
                ) : (
                  merchants.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.company_name || m.legal_name || "—"}
                      </TableCell>
                      <TableCell>{m.dba_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.contact_email || m.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor(m.account_status)}>
                          {m.account_status || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{m.pricing_model || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {m.nmi_gateway_id || m.gateway_id || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.activated_at ? new Date(m.activated_at).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Source: secure portal <code>merchants</code> table. Includes every record regardless of status.
        </p>
      </div>
    </AppLayout>
  );
}
