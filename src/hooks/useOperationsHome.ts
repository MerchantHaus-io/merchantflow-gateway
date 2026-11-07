import { useEffect, useMemo, useState } from "react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useDealSignals, emptyDealSignal } from "@/hooks/useDealSignals";
import { dealAttention, NEEDS_ATTENTION_NOW, type DealAttention } from "@/lib/dealAttention";
import { monthlyRevenueEstimate } from "@/lib/pipelineValue";
import { dealBucket, isAssignedTo, type DealBucket } from "@/lib/dealBucket";
import {
  bookMonthsFromSyncLogs,
  funnelStats,
  headlineMonths,
  liveMerchantCount,
  merchantChanges,
  pipelineCoverage,
  teamActivity,
  type ActivityRow,
  type BookMonth,
  type CommissionPeriodRow,
  type CommissionRecordRow,
  type MerchantRow,
  type SyncLogRow,
} from "@/lib/opsMetrics";

export type { DealBucket };
import {
  ACTIVE_PIPELINE_STAGES,
  OUTCOME_CONFIG,
  STAGE_CONFIG,
  migrateStage,
  resolveDisplayName,
  type Opportunity,
  type OpportunityStage,
  type OutcomeStatus,
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

export interface DealRow {
  opportunity: Opportunity;
  bucket: DealBucket;
  merchant: string;
  stage: OpportunityStage;
  stageLabel: string;
  /** Outcome label for won/lost deals ("Closed Lost", "Disqualified", …). */
  outcomeLabel: string | null;
  owner: string | null;
  ownerName: string;
  mine: boolean;
  value: number;
  updatedAt: string;
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

export interface BookOfBusiness {
  loading: boolean;
  error: string | null;
  /** One per month, oldest first, from the freshest sync of each. */
  months: BookMonth[];
  current: BookMonth | null;
  previous: BookMonth | null;
  inProgress: BookMonth | null;
  /** Per-merchant change, from the latest complete *saved* period. */
  merchantPeriod: CommissionPeriodRow | null;
  merchants: MerchantRow[];
}

export interface OperationsCounts {
  activeDeals: number;
  weightedPipeline: number;
  stalled: number;
  openTickets: number;
  unassignedTickets: number;
  breachingTickets: number;
  unreviewedSubmissions: number;
  openDeletionRequests: number;
}

// Response budget per ticket priority. Keys match support_tickets.priority
// (low/normal/high/urgent); the old P1–P4 keys matched nothing, so every
// ticket silently got the 24h fallback.
const SLA_HOURS: Record<string, number> = { urgent: 1, high: 4, normal: 24, low: 72 };

const PAGE_SIZE = 1000;

export function useOperationsHome(
  currentUser: { email?: string | null; name?: string | null },
  showAll = false,
) {
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [teamRows, setTeamRows] = useState<ActivityRow[]>([]);
  const [bookState, setBookState] = useState<{
    loading: boolean;
    error: string | null;
    logs: SyncLogRow[];
    periods: CommissionPeriodRow[];
    records: CommissionRecordRow[];
  }>({ loading: true, error: null, logs: [], periods: [], records: [] });
  const [counts, setCounts] = useState<OperationsCounts>({
    activeDeals: 0,
    weightedPipeline: 0,
    stalled: 0,
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
      // Every deal — open, won and lost — so the dashboard can show the whole
      // book. This query used to select a `monthly_volume` column that does
      // not exist on opportunities; PostgREST rejected it, the error was
      // ignored, and the screen rendered zero deals. Volume lives in the
      // onboarding wizard's form_state, which monthlyRevenueEstimate reads.
      const rows: Opportunity[] = [];
      try {
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error: qErr } = await supabase
            .from("opportunities")
            .select(
              "id, account_id, contact_id, stage, status, service_type, assigned_to, " +
                "stage_entered_at, outcome_status, outcome_closed_at, portal_merchant_id, " +
                "created_at, updated_at, account:accounts(name), " +
                "wizard_state:onboarding_wizard_states(form_state)",
            )
            .order("updated_at", { ascending: false })
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          if (qErr) throw qErr;
          for (const raw of (data ?? []) as unknown as (Opportunity & { wizard_state: unknown })[]) {
            rows.push({
              ...raw,
              wizard_state: (Array.isArray(raw.wizard_state)
                ? raw.wizard_state[0]
                : raw.wizard_state) as Opportunity["wizard_state"],
            });
          }
          if (!data || data.length < PAGE_SIZE) break;
        }
        if (cancelled) return;
        setAllOpportunities(rows);
        setError(null);
      } catch (err) {
        console.error("Operations: failed to load deals", err);
        if (!cancelled) setError((err as { message?: string })?.message ?? "Could not load deals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // The queue, ladder and pipeline figures are about deals still being worked.
  const opportunities = useMemo(
    () => allOpportunities.filter((o) => dealBucket(o) === "open"),
    [allOpportunities],
  );

  const userEmail = currentUser.email ?? null;
  const userName = currentUser.name ?? null;
  const isMine = useMemo(
    () => (assigned: string | null | undefined) =>
      isAssignedTo(assigned, { email: userEmail, name: userName }),
    [userEmail, userName],
  );

  // ── Every deal, for the "All deals" table ──────────────────
  const deals = useMemo<DealRow[]>(
    () =>
      allOpportunities.map((opportunity) => {
        const bucket = dealBucket(opportunity);
        const stage = migrateStage(opportunity.stage);
        const outcome = opportunity.outcome_status as OutcomeStatus | null | undefined;
        return {
          opportunity,
          bucket,
          merchant:
            (opportunity as { account?: { name?: string | null } | null }).account?.name ||
            "Unnamed account",
          stage,
          stageLabel: STAGE_CONFIG[stage]?.label ?? opportunity.stage,
          outcomeLabel:
            bucket === "open"
              ? null
              : outcome
                ? (OUTCOME_CONFIG[outcome]?.label ?? outcome)
                : bucket === "won"
                  ? "Won"
                  : "Dead",
          owner: opportunity.assigned_to ?? null,
          ownerName: opportunity.assigned_to ? resolveDisplayName(opportunity.assigned_to) : "Unassigned",
          mine: isMine(opportunity.assigned_to),
          value: monthlyRevenueEstimate(opportunity),
          updatedAt: opportunity.updated_at,
        };
      }),
    [allOpportunities, isMine],
  );

  const opportunityIds = useMemo(() => opportunities.map((o) => o.id), [opportunities]);
  const signals = useDealSignals(opportunityIds);

  // The deals this view is about: everyone's, or the user's plus unowned ones.
  const scoped = useMemo(
    () => opportunities.filter((o) => showAll || !o.assigned_to || isMine(o.assigned_to)),
    [opportunities, showAll, isMine],
  );

  // ── Queue, ranked exactly as the board ranks it ────────────
  const queue = useMemo<QueueItem[]>(() => {
    return scoped
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
  }, [scoped, signals]);

  /** Already going wrong, or about to. The line is owned by dealAttention.ts. */
  const now = useMemo(() => queue.filter((i) => i.attention.rank >= NEEDS_ATTENTION_NOW), [queue]);
  const today = useMemo(() => queue.filter((i) => i.attention.rank < NEEDS_ATTENTION_NOW), [queue]);
  const steady = Math.max(0, scoped.length - queue.length);

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

      const [tickets, submissions, deletions] = await Promise.all([
        supabase
          .from("support_tickets")
          .select("id, status, priority, assigned_to, created_at")
          .is("archived_at", null)
          .not("status", "in", '("closed","resolved","spam")'),
        supabase.from("applications").select("*", head).eq("status", "pending"),
        supabase.from("deletion_requests").select("*", head).eq("status", "pending"),
      ]);

      if (cancelled) return;

      const openTickets = tickets.data ?? [];
      const breaching = openTickets.filter((t) => {
        const budget = SLA_HOURS[String(t.priority).toLowerCase()] ?? 24;
        return differenceInHours(new Date(), new Date(t.created_at)) > budget;
      });

      setCounts({
        activeDeals: opportunities.length,
        weightedPipeline: opportunities.reduce((sum, o) => sum + monthlyRevenueEstimate(o), 0),
        stalled: now.filter((i) => i.attention.text.startsWith("Stalled")).length,
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

  // ── Activity feed + two weeks of team activity ─────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [{ data }, { data: recent }] = await Promise.all([
        supabase
          .from("activities")
          .select("id, type, description, user_email, created_at, opportunity_id")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("activities")
          .select("type, user_email, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      if (cancelled) return;
      setTeamRows((recent ?? []) as ActivityRow[]);
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

  // ── Book of business ───────────────────────────────────────
  // Monthly totals come from commission_sync_logs: every nmi-commissions run
  // logs its summary, but commission_periods/records are written only when the
  // caller asks to persist, so they lag. Per-merchant rows exist only in the
  // persisted tables, so the screen labels them with the date they were saved.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [logs, periods, records] = await Promise.all([
          supabase
            .from("commission_sync_logs")
            .select("period_year, period_month, created_at, merchant_count, raw_response")
            .eq("status", "success")
            .order("created_at", { ascending: false })
            .limit(300),
          supabase.from("commission_periods").select("id, period_start, period_end, fetched_at"),
          supabase
            .from("commission_records")
            .select("period_id, account_id, company_name, transaction_count, transaction_volume")
            .limit(PAGE_SIZE),
        ]);
        const failed = logs.error ?? periods.error ?? records.error;
        if (failed) throw failed;
        if (cancelled) return;
        setBookState({
          loading: false,
          error: null,
          logs: (logs.data ?? []) as unknown as SyncLogRow[],
          periods: (periods.data ?? []) as CommissionPeriodRow[],
          records: (records.data ?? []) as CommissionRecordRow[],
        });
      } catch (err) {
        console.error("Operations: failed to load book of business", err);
        if (!cancelled) {
          setBookState((prev) => ({
            ...prev,
            loading: false,
            error: (err as { message?: string })?.message ?? "Could not load the book of business.",
          }));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const book = useMemo<BookOfBusiness>(() => {
    const months = bookMonthsFromSyncLogs(bookState.logs);
    const { period, rows } = merchantChanges(bookState.periods, bookState.records);
    return {
      loading: bookState.loading,
      error: bookState.error,
      months,
      ...headlineMonths(months),
      merchantPeriod: period,
      merchants: rows,
    };
  }, [bookState]);

  const liveMerchants = useMemo(() => liveMerchantCount(allOpportunities), [allOpportunities]);
  const funnel = useMemo(() => funnelStats(allOpportunities, new Date()), [allOpportunities]);
  const coverage = useMemo(() => pipelineCoverage(opportunities), [opportunities]);
  const team = useMemo(() => teamActivity(teamRows, new Date()), [teamRows]);

  return {
    loading, error, now, today, steady, ladder, counts, activity, deals,
    book, liveMerchants, funnel, coverage, team,
  };
}
