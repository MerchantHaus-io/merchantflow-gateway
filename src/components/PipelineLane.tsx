import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { differenceInDays } from "date-fns";
import { migrateStage, Opportunity, OpportunityStage, STAGE_CONFIG } from "@/types/opportunity";
import { laneStagesFor } from "@/lib/pipelineLanes";
import type { DealSignal } from "@/hooks/useDealSignals";
import { phasesFor, type PhaseId } from "@/lib/pipelinePhases";
import { sumMonthlyRevenue } from "@/lib/pipelineValue";
import PipelineColumn from "./PipelineColumn";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface PipelineLaneProps {
  /** The funnel this service type is actually allowed to walk. */
  canonicalStages: OpportunityStage[];
  /** Already filtered to this lane. */
  opportunities: Opportunity[];
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stage: OpportunityStage) => void;
  onDragEnd?: () => void;
  onCardClick: (opportunity: Opportunity) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  onMarkAsDead?: (id: string) => void;
  onAddNew?: () => void;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  isCompact?: boolean;
  currentUser?: string;
  isAdmin?: boolean;
  signals?: Map<string, DealSignal>;
  /** Commit a stage change, with the same rules a drop goes through. */
  onCommitStage?: (opportunity: Opportunity, stage: OpportunityStage) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

/**
 * One service type's funnel.
 *
 * The board used to render a single ten-column row for both service types, and
 * reconcile the difference at drop time: a gateway-only deal dropped on
 * Underwriting or Approved hit a branch commented "silently reject", while the
 * detail modal toasted a clear error for the identical rule. Splitting the row
 * into two lanes makes the rule structural — the illegal columns are not in the
 * gateway lane to drop onto — and cuts that lane from ten columns to seven.
 */
const PipelineLane = ({
  canonicalStages,
  opportunities,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onCardClick,
  onAssignmentChange,
  onSlaStatusChange,
  onMarkAsDead,
  onAddNew,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  isCompact = false,
  currentUser,
  isAdmin,
  signals,
  onCommitStage,
}: PipelineLaneProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [currentColumnIndex, setCurrentColumnIndex] = useState(0);
  const [expandedPhase, setExpandedPhase] = useState<PhaseId | null>(null);

  const laneStages = useMemo(
    () => laneStagesFor(canonicalStages, opportunities),
    [canonicalStages, opportunities],
  );

  const byStage = useMemo(() => {
    const map = new Map<OpportunityStage, Opportunity[]>();
    for (const stage of laneStages) map.set(stage, []);
    for (const opp of opportunities) {
      const stage = migrateStage(opp.stage);
      map.get(stage)?.push(opp);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return map;
  }, [laneStages, opportunities]);

  const phases = useMemo(() => phasesFor(laneStages), [laneStages]);

  const phaseSummary = useMemo(
    () =>
      phases.map(({ phase, stages }) => {
        const deals = stages.flatMap((stage) => byStage.get(stage) ?? []);
        const oldestDays = deals.reduce((max, opp) => {
          const from = opp.stage_entered_at ? new Date(opp.stage_entered_at) : new Date(opp.created_at);
          return Math.max(max, differenceInDays(new Date(), from));
        }, 0);
        return { phase, stages, count: deals.length, value: sumMonthlyRevenue(deals), oldestDays };
      }),
    [phases, byStage],
  );

  /**
   * Which phase is open.
   *
   * Computed once from the data rather than tracked reactively, so the layout
   * does not reshuffle under the rep every time a card moves. The busiest phase
   * opens; the rest stand as rails carrying their count, value and oldest deal,
   * which is what makes the lane fit a laptop at all. Clicking a rail opens it
   * and closes the other.
   */
  const activePhase =
    expandedPhase ??
    phaseSummary.reduce(
      (best, p) => (p.count > (best?.count ?? -1) ? p : best),
      phaseSummary[0],
    )?.phase.id ??
    null;

  const [announcement, setAnnouncement] = useState("");

  /**
   * The keyboard equivalent of a drag.
   *
   * The lane owns the stage order, so it can answer "one stage along" for a
   * deal without the card knowing which stages its funnel allows. Moves that
   * would run off either end are refused out loud rather than silently.
   */
  const moveRelative = useCallback(
    (opportunity: Opportunity, direction: -1 | 1) => {
      if (!onCommitStage) return;
      const current = laneStages.indexOf(migrateStage(opportunity.stage));
      if (current === -1) return;

      const target = laneStages[current + direction];
      const name = opportunity.account?.name ?? "Deal";
      if (!target) {
        setAnnouncement(
          `${name} is already at the ${direction === 1 ? "last" : "first"} stage of this pipeline.`,
        );
        return;
      }

      onCommitStage(opportunity, target);
      setAnnouncement(`${name} moved to ${STAGE_CONFIG[target]?.label ?? target}.`);
    },
    [laneStages, onCommitStage],
  );

  const scrollToColumn = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(index, laneStages.length - 1));
      const col = container.children[0]?.children[clamped] as HTMLElement | undefined;
      col?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      setCurrentColumnIndex(clamped);
    },
    [laneStages.length],
  );

  const handleHorizontalWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

    // Don't steal a wheel that a column's own card list can still use. The
    // handler sits on the outer scroller, so wheel events bubbling out of a
    // column made the board slide sideways while the column was scrolling
    // normally. React attaches wheel passively at the root, so preventDefault
    // here would be ignored anyway — the fix has to be not acting.
    const list = (e.target as HTMLElement)?.closest?.("[data-column-cards]") as HTMLElement | null;
    if (list) {
      const room = e.deltaY > 0
        ? list.scrollHeight - list.clientHeight - list.scrollTop
        : list.scrollTop;
      if (room > 1) return;
    }

    container.scrollLeft += e.deltaY;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isMobile || laneStages.length === 0) return;
    const onScroll = () => {
      const colW = el.scrollWidth / laneStages.length;
      if (colW > 0) setCurrentColumnIndex(Math.round(el.scrollLeft / colW));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isMobile, laneStages.length]);


  return (
    /* Not a card.
       This used to be a bordered <section> holding a header, and the board
       stacked two of them — so the real cards sat inside a column inside a
       phase inside a lane, two bordered containers deep. The craft floor is
       blunt about that shape: cards are the lazy container, and nested cards
       are always wrong. The lane's identity, count and value now live in the
       board's own service-type switch, one level up, where picking a funnel
       is a single decision rather than a second axis of navigation. */
    <div className="flex flex-col min-h-0 flex-1">
      <div
          ref={scrollRef}
          onWheel={handleHorizontalWheel}
          className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 pipeline-scrollbar"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
          data-scroll-container
        >
          <div className={cn("flex items-stretch min-w-max h-full", isCompact ? "gap-1.5 p-1.5" : "gap-2 p-2")}>
            {phaseSummary.map(({ phase, stages, count, value, oldestDays }) => {
              const open = phase.id === activePhase;

              if (!open) {
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => setExpandedPhase(phase.id)}
                    aria-expanded={false}
                    className="w-[104px] shrink-0 flex flex-col items-center rounded-lg border border-border/50 bg-muted/30 px-2 py-3 hover:border-[hsl(var(--gold)/0.5)] transition-colors"
                  >
                    <span
                      className="font-pipeline-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {phase.label}
                    </span>
                    <span className="font-pipeline-mono text-[20px] font-bold leading-none text-foreground">{count}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground text-center mt-1">
                      {count === 1 ? "deal" : "deals"} &middot; {phase.owner}
                    </span>
                    {value > 0 && (
                      <span className="font-pipeline-mono text-[10px] text-[hsl(var(--gold))] mt-2">
                        {formatCurrency(value)}/mo
                      </span>
                    )}
                    {oldestDays > 0 && (
                      <span className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/40 w-full text-center">
                        oldest {oldestDays}d
                      </span>
                    )}
                    <span className="font-pipeline-mono text-[9px] uppercase tracking-wider text-muted-foreground mt-auto pt-2">
                      Expand &rarr;
                    </span>
                  </button>
                );
              }

              return (
                <div key={phase.id} className="flex flex-col min-h-0">
                  <div className="flex items-baseline gap-2 px-1 pb-1.5">
                    <span className="font-pipeline-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
                      {phase.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{phase.owner}</span>
                    {value > 0 && (
                      <span className="font-pipeline-mono text-[10px] text-[hsl(var(--gold))] ml-auto pl-3">
                        {formatCurrency(value)}/mo
                      </span>
                    )}
                  </div>
                  <div className={cn("flex items-stretch flex-1 min-h-0", isCompact ? "gap-1.5" : "gap-2")}>
                    {stages.map((stage) => (
                      <PipelineColumn
                        key={stage}
                        stage={stage}
                        opportunities={byStage.get(stage) ?? []}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragEnd={onDragEnd}
                        onCardClick={onCardClick}
                        onAssignmentChange={onAssignmentChange}
                        onSlaStatusChange={onSlaStatusChange}
                        onAddNew={stage === "discovery" ? onAddNew : undefined}
                        onMarkAsDead={onMarkAsDead}
                        onTouchDragStart={onTouchDragStart}
                        onTouchDragMove={onTouchDragMove}
                        onTouchDragEnd={onTouchDragEnd}
                        isCompact={isCompact}
                        currentUser={currentUser}
                        isAdmin={isAdmin}
                        signals={signals}
                        onMoveRelative={moveRelative}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      {/* Keyboard moves are invisible otherwise: the card keeps focus and the
          column it left is off-screen as often as not. */}
      <span aria-live="polite" className="sr-only">{announcement}</span>

      {isMobile && laneStages.length > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-1 border-t border-border/40">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Previous stage"
            onClick={() => scrollToColumn(currentColumnIndex - 1)}
            disabled={currentColumnIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {laneStages.map((stage, i) => (
              <button
                key={stage}
                type="button"
                onClick={() => scrollToColumn(i)}
                aria-label={`Go to ${stage.replace(/_/g, " ")}`}
                aria-current={i === currentColumnIndex}
                // 24px of transparent padding around a 6px dot: the target was
                // 6x6 before, well under any usable touch size.
                className="p-2 -m-1"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-200",
                    i === currentColumnIndex ? "bg-primary w-3" : "bg-muted-foreground/40 w-1.5",
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Next stage"
            onClick={() => scrollToColumn(currentColumnIndex + 1)}
            disabled={currentColumnIndex === laneStages.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default PipelineLane;
