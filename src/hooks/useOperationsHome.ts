import { useEffect, useMemo, useState } from "react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useDealSignals, emptyDealSignal } from "@/hooks/useDealSignals";
import { dealAttention, NEEDS_ATTENTION_NOW, type DealAttention } from "@/lib/dealAttention";
import { monthlyRevenueEstimate } from "@/lib/pipelineValue";
import {
  ACTIVE_PIPELINE_STAGES,
  STAGE_CONFIG,
  migrateStage,
  type Opportunity,
  type OpportunityStage,
} from "@/types/opportunity";

/**
 * The home screen's data, in one place.
 *
 * The old home screen fetched nothing — it was a launcher, so it had no state
 * to load. The replacement answers "what is going wrong and what do I owe
 * someone" before it offers navigation, which means it needs the same signals
 * the board already reads.
 *
 * It deliberately reuses `useDealSignals` and `dealAttention` rather than
 * scoring deals a second way. Two surfaces that rank urgency differently
 * teach the team to trust neither.
 */

export interface QueueItem {
  opportunity: Opportunity;
  attention: DealAttention;
  stage: OpportunityStage;
  stageLabel: string;
  daysInStage: number;
  value: number;
}

export interface StageBucket {
  stage: OpportunityStage;
  label: string;
  count: number;
  /** Deals in this stage whose attention rank is at or above the "now" line. */
  flagged: number;
}

export interface ActivityEntry {
  id: string;
  type: string;
  description: string | null;
  actor: string | null;
  at: string;
  opportunityId: string;
}

export interface OperationsCounts {
  activeDeals: number;
  weightedPipeline: number;
  stalled: number;
  liveMerchants: number;
  openTickets: number;
  unassignedTickets: number;
  breachingTickets: number;
  unreviewedSubmissions: number;
  openDeletionRequests: number;
}

const SLA_HOURS: Record<string, number> = { P1: 1, P2: 4, P3: 24, P4: 72 };

export function useOperationsHome(currentUserName?: string, isAdmin = false) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [counts, setCounts] = useState<OperationsCounts>({
    activeDeals: 0,
    weightedPipeline: 0,
    stalled: 0,
    liveMerchants: 0,
    openTickets: 0,
    unassignedTickets: 0,
    breachingTickets: 0,
    unreviewedSubmissions: 0,
    openDeletionRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  // ── Deals ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Only the columns the home screen renders — the same discipline the
      // README records for the rest of the app.
      const { data } = await supabase
        .from("opportunities")
        .select(
          "id, account_id, contact_id, stage, status, service_type, assigned_to, " +
            "stage_entered_at, outcome_status, portal_merchant_id, monthly_volume, " +
            "created_at, updated_at",
        )
        .neq("status", "dead")
        .is("outcome_status", null);

      if (cancelled) return;
      setOpportunities((data ?? []) as unknown as Opportunity[]);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const opportunityIds = useMemo(() => opportunities.map((o) => o.id), [opportunities]);
  const signals = useDealSignals(opportunityIds);

  // ── Queue, ranked exactly as the board ranks it ────────────
  const queue = useMemo<QueueItem[]>(() => {
    const mine = opportunities.filter(
      (o) => isAdmin || !o.assigned_to || o.assigned_to === currentUserName,
    );

    return mine
      .map((opportunity) => {
        const signal = signals.get(opportunity.id) ?? emptyDealSignal;
        const enteredAt = opportunity.stage_entered_at
          ? new Date(opportunity.stage_entered_at)
          : new Date(opportunity.created_at);
        const stage = migrateStage(opportunity.stage);
        const stageLabel = STAGE_CONFIG[stage]?.label ?? "this stage";
        const daysInStage = differenceInDays(new Date(), enteredAt);

        const attention = dealAttention({
          daysInStage,
          stageLabel,
          assignedTo: opportunity.assigned_to,
          hoursToMeeting: signal.nextEvent
            ? differenceInHours(new Date(signal.nextEvent.start_time), new Date())
            : null,
          meetingLabel: signal.nextEvent
            ? format(new Date(signal.nextEvent.start_time), "h:mm a")
            : null,
          underwritingScore: signal.underwritingScore,
          activationReady:
            Boolean(opportunity.portal_merchant_id) &&
            stage === "go_live_ready" &&
            !opportunity.outcome_status,
        });

        return {
          opportunity,
          attention,
          stage,
          stageLabel,
          daysInStage,
          value: monthlyRevenueEstimate(opportunity),
        };
      })
      .filter((item) => item.attention.rank > 0)
      .sort((a, b) => b.attention.rank - a.attention.rank || b.value - a.value);
  }, [opportunities, signals, currentUserName, isAdmin]);

  /** Already going wrong, or about to. The line is owned by dealAttention.ts. */
  const now = useMemo(() => queue.filter((i) => i.attention.rank >= NEEDS_ATTENTION_NOW), [queue]);
  const today = useMemo(() => queue.filter((i) => i.attention.rank < NEEDS_ATTENTION_NOW), [queue]);
  const steady = Math.max(0, opportunities.length - queue.length);

  // ── Stage ladder ───────────────────────────────────────────
  const ladder = useMemo<StageBucket[]>(() => {
    const flaggedIds = new Set(now.map((i) => i.opportunity.id));

    return ACTIVE_PIPELINE_STAGES.filter((s) => s !== "closed_won").map((stage) => {
      const inStage = opportunities.filter((o) => migrateStage(o.stage) === stage);
      return {
        stage,
        label: STAGE_CONFIG[stage]?.label ?? stage,
        count: inStage.length,
        flagged: inStage.filter((o) => flaggedIds.has(o.id)).length,
      };
    });
  }, [opportunities, now]);

  // ── Counts across the rest of the business ─────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const head = { count: "exact" as const, head: true };

      const [tickets, submissions, deletions, merchants] = await Promise.all([
        supabase
          .from("support_tickets")
          .select("id, status, priority, assigned_to, created_at")
          .is("archived_at", null)
          .not("status", "in", '("closed","resolved")'),
        supabase.from("applications").select("*", head).is("reviewed_at", null),
        supabase.from("deletion_requests").select("*", head).eq("status", "pending"),
        supabase.from("merchants").select("*", head),
      ]);

      if (cancelled) return;

      const openTickets = tickets.data ?? [];
      const breaching = openTickets.filter((t) => {
        const budget = SLA_HOURS[String(t.priority).toUpperCase()] ?? 24;
        return differenceInHours(new Date(), new Date(t.created_at)) > budget;
      });

      setCounts({
        activeDeals: opportunities.length,
        weightedPipeline: opportunities.reduce((sum, o) => sum + monthlyRevenueEstimate(o), 0),
        stalled: now.filter((i) => i.attention.text.startsWith("Stalled")).length,
        liveMerchants: merchants.count ?? 0,
        openTickets: openTickets.length,
        unassignedTickets: openTickets.filter((t) => !t.assigned_to).length,
        breachingTickets: breaching.length,
        unreviewedSubmissions: submissions.count ?? 0,
        openDeletionRequests: deletions.count ?? 0,
      });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [opportunities, now]);

  // ── Activity feed ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("activities")
        .select("id, type, description, user_email, created_at, opportunity_id")
        .order("created_at", { ascending: false })
        .limit(10);

      if (cancelled) return;
      setActivity(
        (data ?? []).map((a) => ({
          id: a.id,
          type: a.type,
          description: a.description,
          actor: a.user_email,
          at: a.created_at,
          opportunityId: a.opportunity_id,
        })),
      );
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, now, today, steady, ladder, counts, activity };
}

/*
 * Left deliberately unwired, because guessing a column name here would put a
 * wrong number on the front door:
 *
 *   • Residual run-rate      → nmi_partner_residuals
 *   • Processing volume MTD  → kurv_transactions_daily
 *   • Rep commission accrued → commission_records + commission_periods
 *
 * Each of those tables exists. Confirm its amount/period columns against the
 * live schema, then add them to `counts` the same way. Until then the tiles
 * that need them render an em dash rather than an estimate — a blank is
 * honest, a plausible-looking figure is not.
 */
