import { useMemo } from "react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { Opportunity, STAGE_CONFIG, migrateStage } from "@/types/opportunity";
import { dealAttention, type AttentionTone } from "@/lib/dealAttention";
import { monthlyRevenueEstimate } from "@/lib/pipelineValue";
import { type DealSignal, emptyDealSignal } from "@/hooks/useDealSignals";
import { cn } from "@/lib/utils";

interface PipelineQueueProps {
  opportunities: Opportunity[];
  signals: Map<string, DealSignal>;
  onSelect: (opportunity: Opportunity) => void;
  /** Only the signed-in rep's deals, unless they're an admin. */
  currentUser?: string;
  isAdmin?: boolean;
}

const MAX_ITEMS = 6;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const toneBar: Record<AttentionTone, string> = {
  critical: "bg-red-500",
  soon: "bg-amber-500",
  ready: "bg-emerald-500",
  steady: "bg-muted-foreground/40",
};

/**
 * What to touch next.
 *
 * The board answers "what did I create recently" — every column sorts
 * created_at descending inside a list with no visible scrollbar, so a deal
 * stalled for a month sits at the bottom, below an invisible fold, wearing the
 * red SLA styling nobody scrolls far enough to see. Ordering was inversely
 * correlated with urgency.
 *
 * This ranks on the same signals the cards show — see src/lib/dealAttention.ts,
 * which both surfaces call — so the queue and the board can never disagree
 * about which deals are urgent.
 */
const PipelineQueue = ({ opportunities, signals, onSelect, currentUser, isAdmin }: PipelineQueueProps) => {
  const items = useMemo(() => {
    const mine = opportunities.filter(
      (o) => isAdmin || !o.assigned_to || o.assigned_to === currentUser,
    );

    return mine
      .map((opportunity) => {
        const signal = signals.get(opportunity.id) ?? emptyDealSignal;
        const stageEnteredAt = opportunity.stage_entered_at
          ? new Date(opportunity.stage_entered_at)
          : new Date(opportunity.created_at);
        const stage = migrateStage(opportunity.stage);

        const attention = dealAttention({
          daysInStage: differenceInDays(new Date(), stageEnteredAt),
          stageLabel: STAGE_CONFIG[stage]?.label ?? "this stage",
          assignedTo: opportunity.assigned_to,
          hoursToMeeting: signal.nextEvent
            ? differenceInHours(new Date(signal.nextEvent.start_time), new Date())
            : null,
          meetingLabel: signal.nextEvent ? format(new Date(signal.nextEvent.start_time), "h:mm a") : null,
          underwritingScore: signal.underwritingScore,
          activationReady:
            Boolean(opportunity.portal_merchant_id) && stage === "go_live_ready" && !opportunity.outcome_status,
        });

        return { opportunity, attention, stage, value: monthlyRevenueEstimate(opportunity) };
      })
      .filter((item) => item.attention.rank > 0)
      .sort((a, b) => b.attention.rank - a.attention.rank || b.value - a.value)
      .slice(0, MAX_ITEMS);
  }, [opportunities, signals, currentUser, isAdmin]);

  return (
    <aside
      aria-label="Deals needing attention"
      // Hidden below the nav breakpoint. At 248px fixed it took 64% of a 390px
      // phone and squeezed the lanes into ~142px — the queue is the right idea
      // on a phone and the wrong shape for one, and a dedicated mobile view is
      // where it belongs rather than this column wedged into a board.
      className="hidden lg:flex w-[248px] shrink-0 flex-col min-h-0 border-r border-border/40 bg-muted/20"
    >
      <div className="flex-shrink-0 px-3 pt-2.5 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-pipeline-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-foreground">
            Needs you today
          </h2>
          <span
            className={cn(
              "font-pipeline-mono text-[10.5px] font-bold",
              items.length > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
            )}
          >
            {items.length}
          </span>
        </div>
        <p className="text-[10.5px] leading-snug text-muted-foreground mt-1">
          Ranked by what's stalled, what's due, and what a person is waiting on — across every stage.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground border border-dashed border-border/50 rounded-md p-3">
            Nothing is waiting on you. Every deal you own is assigned, inside its stage clock, and has no
            meeting in the next couple of hours.
          </p>
        ) : (
          items.map(({ opportunity, attention, stage, value }) => (
            <button
              key={opportunity.id}
              type="button"
              onClick={() => onSelect(opportunity)}
              className="w-full flex items-stretch gap-0 text-left rounded-md border border-border/50 bg-card overflow-hidden hover:border-[hsl(var(--gold)/0.55)] transition-colors"
            >
              <span className={cn("w-[3px] shrink-0", toneBar[attention.tone])} aria-hidden="true" />
              <span className="flex-1 min-w-0 p-2">
                <span className="block text-[12.5px] font-semibold leading-tight truncate">
                  {opportunity.account?.name || "Unknown"}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground mt-0.5">
                  {attention.text}
                </span>
                <span className="flex items-center gap-2 mt-1.5">
                  <span className="font-pipeline-mono text-[8.5px] uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-1 py-px">
                    {STAGE_CONFIG[stage]?.label ?? stage}
                  </span>
                  <span className="font-pipeline-mono text-[10px] text-[hsl(var(--gold))] ml-auto">
                    {value > 0 ? `${formatCurrency(value)}/mo` : "—"}
                  </span>
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
};

export default PipelineQueue;
