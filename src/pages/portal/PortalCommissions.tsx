import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { DollarSign, AlertTriangle, TrendingUp, Trophy, Lock } from "lucide-react";

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
        return [];
      }
      return (data ?? []) as unknown as PayoutRecord[];
    },
  });

  // Program rules from referrer profile (with safe fallbacks).
  // NEW MODEL: 50% rev share, $500/account/MONTH recurring (no lifetime cap, no account ceiling).
  const rate = referrer?.commission_rate ?? 0.5;
  const monthlyCap = referrer?.monthly_cap_per_merchant ?? 500;
  const bonusAmount = referrer?.bonus_amount ?? 500;
  const bonusMilestone = referrer?.bonus_milestone_count ?? 5;

  // Per-period capped payout for every record.
  const cappedRecords = useMemo(() => {
    return (allRecords ?? []).map((r) => {
      const raw = Number(r.company_commission) * rate;
      const displayPayout = Math.min(raw, monthlyCap);
      return { ...r, displayPayout, eligible: true as const };
    });
  }, [allRecords, rate, monthlyCap]);

  // Aggregate per-account: lifetime sum of capped monthly payouts (uncapped overall).
  const accountSummaries = useMemo(() => {
    const map = new Map<
      string,
      { account_id: string; company_name: string; firstSeen: string; lifetime: number }
    >();
    for (const r of cappedRecords) {
      const key = r.account_id || r.record_id;
      const existing = map.get(key);
      if (existing) {
        existing.lifetime += r.displayPayout;
        if (r.period_start < existing.firstSeen) existing.firstSeen = r.period_start;
      } else {
        map.set(key, {
          account_id: key,
          company_name: r.company_name || "Merchant",
          firstSeen: r.period_start,
          lifetime: r.displayPayout,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  }, [cappedRecords]);

  const eligibleAccountCount = accountSummaries.length;
  const lifetimeEarnings = accountSummaries.reduce((s, a) => s + a.lifetime, 0);

  // Bonus: $bonusAmount for every $bonusMilestone successfully boarded merchants (no ceiling).
  const successfulCount = accountSummaries.filter((a) => a.lifetime > 0).length;
  const bonusesEarned = Math.floor(successfulCount / bonusMilestone) * bonusAmount;
  const nextBonusAt = (Math.floor(successfulCount / bonusMilestone) + 1) * bonusMilestone;

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

  const periodRecords = useMemo(
    () => cappedRecords.filter((r) => r.period_id === effectivePeriodId),
    [cappedRecords, effectivePeriodId]
  );

  const totals = useMemo(() => {
    const periodTotal = periodRecords.reduce((sum, r) => sum + r.displayPayout, 0);
    return { periodTotal };
  }, [periodRecords]);

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
      {/* Program terms */}
      <Card className="p-5 mb-5 border-[hsl(var(--gold))]/40">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-[hsl(var(--gold))]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Referral program</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase">Rev share</div>
            <div className="font-semibold text-base mt-0.5">{fmtPct(rate)} of commission</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase">Cap / account</div>
            <div className="font-semibold text-base mt-0.5">{fmt(monthlyCap)} / month</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase">Milestone bonus</div>
            <div className="font-semibold text-base mt-0.5">
              {fmt(bonusAmount)} every {bonusMilestone}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          You earn <strong>{fmtPct(rate)}</strong> of the company commission for each merchant you refer, capped
          at <strong>{fmt(monthlyCap)} per account, per month</strong> — recurring for the lifetime of that
          account. A <strong>{fmt(bonusAmount)}</strong> bonus is paid for every{" "}
          <strong>{bonusMilestone}</strong> successfully boarded merchants.
        </p>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">This period</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(totals.periodTotal)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Lifetime earnings</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(cappedLifetimeEarnings)}</div>
          <Progress value={earningsProgress} className="h-1.5 mt-2" />
          <div className="text-[10px] text-muted-foreground mt-1">of {fmt(programCap)} program cap</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Eligible accounts</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {eligibleAccountCount}
            <span className="text-base text-muted-foreground"> / {accountCeiling}</span>
          </div>
          <Progress value={accountsProgress} className="h-1.5 mt-2" />
          <div className="text-[10px] text-muted-foreground mt-1">
            {Math.max(0, accountCeiling - eligibleAccountCount)} slots remaining
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Bonus paid</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(bonusesEarned)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Next {fmt(bonusAmount)} at {nextBonusAt} successful merchants
          </div>
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
              .sort((a, b) => b.displayPayout - a.displayPayout)
              .map((r) => (
                <li key={r.record_id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.company_name || "Merchant"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Volume {fmt(Number(r.transaction_volume))} ·{" "}
                        {r.transaction_count.toLocaleString()} txns · Company net{" "}
                        {fmt(Number(r.company_commission))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!r.eligible && (
                        <Badge variant="outline" className="text-muted-foreground">
                          <Lock className="h-3 w-3 mr-1" />
                          Beyond {accountCeiling}-account cap
                        </Badge>
                      )}
                      {r.eligible && r.displayPayout === 0 && Number(r.company_commission) > 0 && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Lifetime cap hit
                        </Badge>
                      )}
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmt(r.displayPayout)}</div>
                        {r.eligible && Number(r.company_commission) * rate > r.displayPayout && (
                          <div className="text-[10px] text-muted-foreground">
                            uncapped {fmt(Number(r.company_commission) * rate)}
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
          Figures reflect calculated payouts after program caps. Earnings never exceed{" "}
          <strong>{fmt(lifetimeCap)}</strong> per account or <strong>{fmt(programCap)}</strong> in total. Actual
          disbursement schedule and any clawbacks (within the first {referrer.clawback_window_days} days of a
          merchant going live) are confirmed by MerchantHaus accounting.
        </span>
      </p>
    </PortalLayout>
  );
}
