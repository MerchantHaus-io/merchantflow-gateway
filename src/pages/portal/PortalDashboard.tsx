import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { activeSupabase as supabase } from "@/integrations/supabase/activeClient";
import { useAuth } from "@/contexts/AuthContext";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STAGE_CONFIG, OpportunityStage, OutcomeStatus } from "@/types/opportunity";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { Send, CheckCircle2, XCircle, Clock, TrendingUp, Building2, Mail, Sparkles } from "lucide-react";

const PREMIUM_CONTACT_EMAIL = "jamie@merchanthaus.io";

interface OpportunityRow {
  id: string;
  stage: OpportunityStage;
  status: string | null;
  outcome_status: OutcomeStatus | null;
  outcome_reason: string | null;
  outcome_closed_at: string | null;
  created_at: string;
  updated_at: string;
  stage_entered_at: string | null;
  account: { id: string; name: string } | null;
}

interface MerchantRow {
  id: string;
  dba_name: string | null;
  legal_entity_name: string | null;
  is_live: boolean | null;
  created_at: string;
  account_id: string | null;
}

const STALE_DAYS = 21;

const OUTCOME_LABEL: Record<OutcomeStatus, string> = {
  closed_won: "Closed — Won",
  closed_lost: "Closed — Lost",
  disqualified: "Disqualified",
  no_decision: "No Decision",
  underwriting_declined: "Underwriting Declined",
};

const OUTCOME_VARIANT: Record<OutcomeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  closed_won: "default",
  closed_lost: "destructive",
  disqualified: "destructive",
  no_decision: "secondary",
  underwriting_declined: "destructive",
};

export default function PortalDashboard() {
  const { referrer } = useAuth();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const referrerId = referrer?.id;

  const { data: opportunities, isLoading: oppsLoading } = useQuery({
    queryKey: ["portal-opportunities", referrerId],
    enabled: !!referrerId,
    queryFn: async (): Promise<OpportunityRow[]> => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, stage, status, outcome_status, outcome_reason, outcome_closed_at, created_at, updated_at, stage_entered_at, account:accounts(id, name)")
        .eq("referrer_id", referrerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpportunityRow[];
    },
  });

  const { data: liveMerchants, isLoading: merchantsLoading } = useQuery({
    queryKey: ["portal-merchants", referrerId],
    enabled: !!referrerId,
    queryFn: async (): Promise<MerchantRow[]> => {
       
      const { data, error } = await (supabase.from("merchants") as any)
        .select("id, dba_name, legal_entity_name, is_live, created_at, account_id")
        .eq("referrer_id", referrerId!)
        .order("created_at", { ascending: false });
      if (error) {
        // merchants table may have different shape across deployments; degrade gracefully
        return [];
      }
      return (data ?? []) as unknown as MerchantRow[];
    },
  });

  const stats = useMemo(() => {
    const opps = opportunities ?? [];
    return {
      total: opps.length,
      inProgress: opps.filter((o) => !o.outcome_status && o.status !== "dead").length,
      won: opps.filter((o) => o.outcome_status === "closed_won").length,
      lost: opps.filter((o) => o.outcome_status && o.outcome_status !== "closed_won").length,
    };
  }, [opportunities]);

  const openOpps = (opportunities ?? []).filter((o) => !o.outcome_status);
  const closedOpps = (opportunities ?? []).filter((o) => !!o.outcome_status);

  // Accounts that are live and billing. A merchant is live either because a
  // merchant record says so, or because the deal on that account was won —
  // the latter is what the internal Live & Billing view reads, so the two
  // stay in step.
  const liveAccounts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; since: string }>();
    for (const o of opportunities ?? []) {
      if (o.outcome_status !== "closed_won" || !o.account) continue;
      const since = o.outcome_closed_at ?? o.stage_entered_at ?? o.updated_at;
      const existing = map.get(o.account.id);
      if (!existing || since < existing.since) {
        map.set(o.account.id, { id: o.account.id, name: o.account.name, since });
      }
    }
    for (const m of liveMerchants ?? []) {
      if (!m.is_live) continue;
      const key = m.account_id ?? m.id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: m.dba_name || m.legal_entity_name || "Merchant",
          since: m.created_at,
        });
      }
    }
    return [...map.values()].sort((a, b) => (a.since < b.since ? 1 : -1));
  }, [opportunities, liveMerchants]);

  const liveCount = liveAccounts.length;


  if (!referrerId) {
    return (
      <PortalLayout pageTitle="Dashboard">
        <Card className="p-6">
          <p className="text-muted-foreground">
            No referrer profile is attached to your account. If you reached this page in error, contact{" "}
            <a href="mailto:partners@merchanthaus.io" className="underline">partners@merchanthaus.io</a>.
          </p>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      pageTitle="Your Referrals"
      headerActions={
        <div className="flex items-center gap-2">
          {referrer?.tier === 'premium' && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setPremiumOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--gold))]/50 bg-[hsl(var(--gold))]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/20 transition-colors"
                    aria-label="Premium partner status"
                  >
                    <Sparkles className="h-3 w-3" />
                    Premium
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                  You're a <strong>Premium Partner</strong>. Standard model figures shown — your terms are
                  always open to discussion. Click to view details.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button asChild>
            <Link to="/affiliate/new-referral">
              <Send className="h-4 w-4 mr-2" />
              Submit Referral
            </Link>
          </Button>
        </div>
      }
    >
      {referrer?.tier === 'premium' && (
        <Card className="p-4 mb-6 border-[hsl(var(--gold))]/40 bg-gradient-to-r from-[hsl(var(--gold))]/10 via-transparent to-transparent">
          <div className="flex items-start gap-3 flex-wrap">
            <Badge className="bg-[hsl(var(--gold))] text-black hover:bg-[hsl(var(--gold))] uppercase tracking-wider text-[10px]">
              <Sparkles className="h-3 w-3 mr-1" />
              Premium Partner
            </Badge>
            <div className="text-sm flex-1 min-w-[240px]">
              <p className="font-semibold mb-0.5">A note on your commission</p>
              <p className="text-muted-foreground">
                Figures shown reflect our <strong>standard partner model</strong>. As a premium partner, your
                terms are <strong>always open to discussion</strong>.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-[hsl(var(--gold))]/60 text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/10"
              onClick={() => setPremiumOpen(true)}
            >
              View premium details
            </Button>
          </div>
        </Card>
      )}

      <PremiumDetailsDialog
        open={premiumOpen}
        onOpenChange={setPremiumOpen}
        referrerName={referrer?.full_name ?? null}
        commissionRate={referrer?.commission_rate ?? 0.5}
        monthlyCap={referrer?.monthly_cap_per_merchant ?? 500}
        bonusAmount={referrer?.bonus_amount ?? 500}
        bonusMilestone={referrer?.bonus_milestone_count ?? 5}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total submitted" value={stats.total} icon={Building2} />
        <StatCard label="In progress" value={stats.inProgress} icon={Clock} />
        <StatCard label="Won" value={stats.won} icon={CheckCircle2} accent="text-emerald-600" />
        <StatCard label="Live & billing" value={liveCount} icon={TrendingUp} accent="text-blue-600" />
      </div>

      {/* Live billing merchants — highlighted */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Live & Billing Accounts
        </h2>
        <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
          {merchantsLoading || oppsLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : liveAccounts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No live accounts yet. Once a referred merchant goes live, they'll appear here and start generating commission.
            </div>
          ) : (
            <ul className="divide-y">
              {liveAccounts.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Live since {format(new Date(a.since), "MMM d, yyyy")}
                    </div>
                  </div>
                  <Badge className="bg-emerald-600 hover:bg-emerald-700">Live</Badge>
                </li>
              ))}
            </ul>
          )}

        </Card>
      </section>

      {/* Open opportunities */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          In Progress ({openOpps.length})
        </h2>
        <Card className="overflow-hidden">
          {oppsLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : openOpps.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No referrals in progress. <Link to="/affiliate/new-referral" className="underline">Submit one</Link>.
            </div>
          ) : (
            <ul className="divide-y">
              {openOpps.map((o) => (
                <OpportunityListItem key={o.id} opp={o} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Closed opportunities */}
      {closedOpps.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Closed ({closedOpps.length})
          </h2>
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {closedOpps.map((o) => (
                <OpportunityListItem key={o.id} opp={o} />
              ))}
            </ul>
          </Card>
        </section>
      )}
    </PortalLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
      </div>
      <div className={`text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}

function OpportunityListItem({ opp }: { opp: OpportunityRow }) {
  const stageInfo = STAGE_CONFIG[opp.stage];
  const lastTouchDate = opp.stage_entered_at ?? opp.updated_at;
  const daysSinceTouch = differenceInDays(new Date(), new Date(lastTouchDate));
  const isStale = !opp.outcome_status && daysSinceTouch >= STALE_DAYS;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium truncate">{opp.account?.name || "Untitled"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Submitted {format(new Date(opp.created_at), "MMM d, yyyy")}
            {" · "}
            Last updated {formatDistanceToNow(new Date(lastTouchDate), { addSuffix: true })}
          </div>
          {opp.outcome_status && opp.outcome_status !== "closed_won" && opp.outcome_reason && (
            <div className="text-xs mt-1 text-muted-foreground">
              <span className="font-medium">Reason:</span> {opp.outcome_reason}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isStale && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400">
              <Clock className="h-3 w-3 mr-1" />
              Stale {daysSinceTouch}d
            </Badge>
          )}
          {opp.outcome_status ? (
            <Badge variant={OUTCOME_VARIANT[opp.outcome_status]}>
              {opp.outcome_status === "closed_won" ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              {OUTCOME_LABEL[opp.outcome_status]}
            </Badge>
          ) : (
            <Badge style={{ backgroundColor: stageInfo.color, color: "white" }}>
              {stageInfo.label}
            </Badge>
          )}
        </div>
      </div>
    </li>
  );
}

function PremiumDetailsDialog({
  open,
  onOpenChange,
  referrerName,
  commissionRate,
  monthlyCap,
  bonusAmount,
  bonusMilestone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  referrerName: string | null;
  commissionRate: number;
  monthlyCap: number;
  bonusAmount: number;
  bonusMilestone: number;
}) {
  const subject = encodeURIComponent(
    `Premium partner commission discussion${referrerName ? ` — ${referrerName}` : ""}`,
  );
  const body = encodeURIComponent(
    `Hi Jamie,\n\nI'd like to discuss my premium partner commission terms.\n\nThanks,\n${referrerName ?? ""}`,
  );
  const mailto = `mailto:${PREMIUM_CONTACT_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[hsl(var(--gold))]" />
            Premium Partner — Commission Details
          </DialogTitle>
          <DialogDescription>
            Below is our standard partner model. As a premium partner, every line is open to
            discussion based on your portfolio, vertical, and volume.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Standard Model
            </p>
            <ul className="text-sm space-y-2">
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Revenue share</span>
                <strong>{(commissionRate * 100).toFixed(0)}% of company commission</strong>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Per-account monthly cap</span>
                <strong>${monthlyCap.toLocaleString()} / account / month</strong>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Account limit</span>
                <strong>Unlimited (recurring monthly, no overall ceiling)</strong>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Milestone bonus</span>
                <strong>${bonusAmount} per {bonusMilestone} boarded merchants</strong>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Example: 10 accounts each at the per-account monthly cap = ${(monthlyCap * 10).toLocaleString()}/month recurring.
              20 accounts = ${(monthlyCap * 20).toLocaleString()}/month recurring. Paid every month for the life of the merchant.
            </p>
          </div>

          <div className="rounded-lg border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/5 p-4">
            <p className="text-sm font-semibold mb-1">Want to renegotiate?</p>
            <p className="text-sm text-muted-foreground">
              Premium partners can request adjusted rates, expanded caps, or custom bonus structures
              once your pipeline justifies it. Reach out directly — there's no formal process, just a
              conversation.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild>
            <a href={mailto}>
              <Mail className="h-4 w-4 mr-2" />
              Email {PREMIUM_CONTACT_EMAIL}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
