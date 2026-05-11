import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { DollarSign, AlertTriangle, TrendingUp } from "lucide-react";

interface PayoutRecord {
  record_id: string;
  period_id: string;
  period_start: string;
  period_end: string;
  account_id: string;
  company_name: string | null;
  transaction_volume: number;
  transaction_count: number;
  company_commission: number;
  commission_rate: number;
  monthly_cap_per_merchant: number;
  uncapped_payout: number;
  payout: number;
  at_cap: boolean;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function PortalCommissions() {
  const { referrer } = useAuth();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");

  const { data: allRecords, isLoading } = useQuery({
    queryKey: ["portal-commissions", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async (): Promise<PayoutRecord[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("referrer_commission_records" as any)
        .select("*")
        .order("period_start", { ascending: false });
      if (error) {
        // View may not exist yet on older deployments — fall back to empty.
        return [];
      }
      return (data ?? []) as unknown as PayoutRecord[];
    },
  });

  const periods = useMemo(() => {
    const map = new Map<string, { id: string; period_start: string; period_end: string }>();
    (allRecords ?? []).forEach((r) => {
      if (!map.has(r.period_id)) {
        map.set(r.period_id, { id: r.period_id, period_start: r.period_start, period_end: r.period_end });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.period_start.localeCompare(a.period_start));
  }, [allRecords]);

  const effectivePeriodId = selectedPeriodId || periods[0]?.id || "";
  const periodRecords = (allRecords ?? []).filter((r) => r.period_id === effectivePeriodId);

  const totals = useMemo(() => {
    const periodTotal = periodRecords.reduce((sum, r) => sum + Number(r.payout), 0);
    const ytdTotal = (allRecords ?? [])
      .filter((r) => parseISO(r.period_start).getFullYear() === new Date().getFullYear())
      .reduce((sum, r) => sum + Number(r.payout), 0);
    const lifetimeTotal = (allRecords ?? []).reduce((sum, r) => sum + Number(r.payout), 0);
    return { periodTotal, ytdTotal, lifetimeTotal };
  }, [periodRecords, allRecords]);

  if (!referrer) {
    return (
      <PortalLayout pageTitle="Earnings">
        <Card className="p-6">
          <p className="text-muted-foreground">No referrer profile loaded.</p>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout pageTitle="Earnings">
      {/* Plan summary */}
      <Card className="p-4 mb-5 bg-muted/40">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Rate</div>
              <div className="font-semibold">{fmtPct(referrer.commission_rate)}</div>
            </div>
          </div>
          <div className="border-l pl-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Cap per merchant / month</div>
            <div className="font-semibold">
              {referrer.monthly_cap_per_merchant > 0 ? fmt(referrer.monthly_cap_per_merchant) : "No cap"}
            </div>
          </div>
          <div className="border-l pl-4 flex-1">
            <p className="text-xs text-muted-foreground">
              You earn <strong>{fmtPct(referrer.commission_rate)}</strong> of net monthly revenue for each
              merchant you've referred, up to <strong>{fmt(referrer.monthly_cap_per_merchant)}</strong> per
              merchant per month. Earnings are calculated from monthly processor settlements.
            </p>
          </div>
        </div>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">This period</div>
          <div className="text-2xl font-semibold mt-1">{fmt(totals.periodTotal)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Year to date</div>
          <div className="text-2xl font-semibold mt-1">{fmt(totals.ytdTotal)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Lifetime</div>
          <div className="text-2xl font-semibold mt-1">{fmt(totals.lifetimeTotal)}</div>
        </Card>
      </div>

      {/* Period selector + per-merchant breakdown */}
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Per-merchant breakdown
        </h2>
        <div className="ml-auto">
          {periods.length > 0 && (
            <Select value={effectivePeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger className="w-48 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {format(parseISO(p.period_start), "MMM yyyy")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : periodRecords.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No commission records for this period yet. Once your referred merchants start processing, earnings
            will appear here at the end of each month.
          </div>
        ) : (
          <ul className="divide-y">
            {periodRecords
              .sort((a, b) => Number(b.payout) - Number(a.payout))
              .map((r) => (
                <li key={r.record_id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.company_name || "Merchant"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Volume {fmt(Number(r.transaction_volume))} · {r.transaction_count.toLocaleString()} txns
                        {" · "}Company net {fmt(Number(r.company_commission))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.at_cap && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          At cap
                        </Badge>
                      )}
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmt(Number(r.payout))}</div>
                        {r.at_cap && (
                          <div className="text-[10px] text-muted-foreground">
                            uncapped {fmt(Number(r.uncapped_payout))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground mt-4 flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Figures reflect calculated payouts. Actual disbursement schedule and any clawbacks (within the first{" "}
          {referrer.clawback_window_days} days of a merchant going live) are confirmed by MerchantHaus accounting.
        </span>
      </p>
    </PortalLayout>
  );
}
