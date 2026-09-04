import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { activeSupabase as supabase } from "@/integrations/supabase/activeClient";
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

type ProjAccount = {
  account_id: string;
  company_name: string;
  status: "live" | "pipeline";
  /** True when we have no gateway billing history for this merchant yet. */
  awaitingGateway: boolean;
  projected_payout: number;
  at_cap: boolean;
};

const DEAD_OUTCOMES = new Set(["disqualified", "closed_lost", "no_decision", "underwriting_declined"]);

export default function PortalCommissions() {
  const { referrer } = useAuth();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");

  const { data: allRecords, isLoading } = useQuery({
    queryKey: ["portal-commissions", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async (): Promise<PayoutRecord[]> => {
      const { data, error } = await supabase
         
        .from("referrer_commission_records" as any)
        .select("*")
        .order("period_start", { ascending: false });
      if (error) {
        return [];
      }
      return (data ?? []) as unknown as PayoutRecord[];
    },
  });

  const rate = referrer?.commission_rate ?? 0.5;
  const monthlyCap = referrer?.monthly_cap_per_merchant ?? 1000;

  // Referred accounts, live vs still in pipeline.
  const { data: referredAccounts } = useQuery({
    queryKey: ["portal-projection", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async (): Promise<{ account_id: string; company_name: string; status: "live" | "pipeline" }[]> => {
      const { data: opps } = await supabase
        .from("opportunities")
        .select("account_id, status, outcome_status, stage, created_at, account:accounts(id, name, nmi_merchant_id)")
        .eq("referrer_id", referrer!.id)
        .order("created_at", { ascending: false });

      const seen = new Set<string>();
      const out: { account_id: string; company_name: string; status: "live" | "pipeline" }[] = [];
      for (const o of (opps as any[]) ?? []) {
        const acct = o?.account;
        if (!acct?.id || seen.has(acct.id)) continue;
        seen.add(acct.id);

        const isDead =
          o.status === "dead" ||
          (o.outcome_status && DEAD_OUTCOMES.has(o.outcome_status));
        if (isDead) continue;

        const isLive = !!acct.nmi_merchant_id || o.stage === "closed_won" || o.outcome_status === "closed_won";
        out.push({
          account_id: acct.id,
          company_name: acct.name ?? "Merchant",
          status: isLive ? "live" : "pipeline",
        });
      }
      return out;
    },
  });

  /**
   * Projections are based on each merchant's most recent GATEWAY billing month —
   * never on processing volume. Processing residuals earn a partner nothing.
   */
  const projectionAccounts = useMemo<ProjAccount[]>(() => {
    const latestPayout = new Map<string, number>();
    for (const r of allRecords ?? []) {
      if (latestPayout.has(r.account_id)) continue; // records are newest-first
      latestPayout.set(r.account_id, Number(r.payout) || 0);
    }
    return (referredAccounts ?? []).map((a) => {
      const known = latestPayout.get(a.account_id);
      const payout = known ?? 0;
      return {
        ...a,
        awaitingGateway: known === undefined,
        projected_payout: payout,
        at_cap: monthlyCap > 0 && payout >= monthlyCap,
      };
    });
  }, [allRecords, referredAccounts, monthlyCap]);


  const projection = useMemo(() => {
    const acc = projectionAccounts ?? [];
    const live = acc.filter((a) => a.status === "live");
    const pipeline = acc.filter((a) => a.status === "pipeline");
    return {
      liveCount: live.length,
      pipelineCount: pipeline.length,
      liveMonthly: live.reduce((s, a) => s + a.projected_payout, 0),
      pipelineMonthly: pipeline.reduce((s, a) => s + a.projected_payout, 0),
      accounts: acc,
    };
  }, [projectionAccounts]);

  // Bonus rules from referrer profile (rate/monthlyCap declared above).
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

      {/* Totals — realized */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">This period</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(totals.periodTotal)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">settled</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Lifetime earnings</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(lifetimeEarnings)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">recurring, no overall cap</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Active accounts</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {projection.liveCount}<span className="text-base text-muted-foreground"> live</span>
            <span className="text-base text-muted-foreground"> · {projection.pipelineCount} pipeline</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {fmt(monthlyCap)} max per account / month
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

      {/* Projection tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <Card className="p-4 border-[hsl(var(--gold))]/30">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Projected monthly run-rate
          </div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(projection.liveMonthly)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            from {projection.liveCount} live account{projection.liveCount === 1 ? "" : "s"}, based on their latest gateway billing month, capped at {fmt(monthlyCap)}/mo each
          </div>

        </Card>
        <Card className="p-4 bg-muted/30">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Pipeline potential / month
          </div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(projection.pipelineMonthly)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            if all {projection.pipelineCount} in-pipeline account{projection.pipelineCount === 1 ? "" : "s"} activate
          </div>
        </Card>
      </div>

      {/* Projection breakdown */}
      {projection.accounts.length > 0 && (
        <Card className="mb-5 overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Projected monthly breakdown
            </h2>
          </div>
          <ul className="divide-y">
            {projection.accounts
              .sort((a, b) => b.projected_payout - a.projected_payout)
              .map((a) => (
                <li key={a.account_id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.company_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {a.awaitingGateway
                          ? "Awaiting first gateway invoice"
                          : "Based on the latest gateway billing month"}
                      </div>

                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          a.status === "live"
                            ? "text-emerald-700 border-emerald-300 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {a.status === "live" ? "Live" : "In pipeline"}
                      </Badge>
                      {a.at_cap && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400">
                          Cap hit
                        </Badge>
                      )}
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmt(a.projected_payout)}</div>
                        <div className="text-[10px] text-muted-foreground">/ month projected</div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
          <div className="px-4 py-2 text-[11px] text-muted-foreground border-t">
            Projections estimate monthly earnings using stated processing volume and the {fmtPct(rate)} rev share, capped at {fmt(monthlyCap)} per account per month. Actual payouts populate once merchants begin processing.
          </div>
        </Card>
      )}


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
                      {r.displayPayout >= monthlyCap && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Monthly cap hit
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
          Figures reflect calculated payouts after the per-account monthly cap. Earnings are capped at{" "}
          <strong>{fmt(monthlyCap)} per account, per month</strong> and recur for the lifetime of each
          account. Disbursement schedule and any clawbacks (within the first {referrer.clawback_window_days} days
          of a merchant going live) are confirmed by MerchantHaus accounting.
        </span>
      </p>
    </PortalLayout>
  );
}
