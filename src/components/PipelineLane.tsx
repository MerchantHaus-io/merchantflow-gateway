import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, CreditCard, Zap } from "lucide-react";
import { migrateStage, Opportunity, OpportunityStage, ServiceType } from "@/types/opportunity";
import { laneStagesFor } from "@/lib/pipelineLanes";
import PipelineColumn from "./PipelineColumn";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface PipelineLaneProps {
  serviceType: ServiceType;
  title: string;
  /** The funnel this service type is actually allowed to walk. */
  canonicalStages: OpportunityStage[];
  /** Already filtered to this lane. */
  opportunities: Opportunity[];
  monthlyValue: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
  serviceType,
  title,
  canonicalStages,
  opportunities,
  monthlyValue,
  collapsed,
  onToggleCollapsed,
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
}: PipelineLaneProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [currentColumnIndex, setCurrentColumnIndex] = useState(0);

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
    if (!el || !isMobile || collapsed || laneStages.length === 0) return;
    const onScroll = () => {
      const colW = el.scrollWidth / laneStages.length;
      if (colW > 0) setCurrentColumnIndex(Math.round(el.scrollLeft / colW));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isMobile, collapsed, laneStages.length]);

  const Icon = serviceType === "gateway_only" ? Zap : CreditCard;
  const accent =
    serviceType === "gateway_only"
      ? "text-teal-600 dark:text-teal-400 border-teal-500/40 bg-teal-500/10"
      : "text-indigo-600 dark:text-indigo-400 border-indigo-500/40 bg-indigo-500/10";

  return (
    <section
      aria-label={`${title} pipeline`}
      className={cn(
        "flex flex-col min-h-0 rounded-lg border border-border/40 bg-card/30",
        // A floor, not just flex-1: two expanded lanes inside a scrolling
        // column would otherwise share the height by shrinking, and at the
        // board's real size that leaves each one about a card and a half tall.
        // With a floor they keep a usable height and the parent scrolls.
        collapsed ? "flex-none" : "flex-1 min-h-[220px]",
      )}
    >
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border/40">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 min-h-[32px] rounded-md px-1 -mx-1 text-left hover:bg-accent/20 transition-colors"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", collapsed && "-rotate-90")}
          />
          <span
            className={cn(
              "inline-flex items-center gap-1 font-pipeline-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border",
              accent,
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {serviceType === "gateway_only" ? "GW" : "CC"}
          </span>
          <span className="font-pipeline-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
            {title}
          </span>
        </button>

        <span className="font-pipeline-mono text-[10px] text-muted-foreground">
          {opportunities.length} {opportunities.length === 1 ? "deal" : "deals"}
        </span>

        {monthlyValue > 0 && (
          <span className="font-pipeline-mono text-[10px] text-[hsl(var(--gold))] ml-auto">
            {formatCurrency(monthlyValue)}/mo
          </span>
        )}
      </div>

      {!collapsed && (
        <div
          ref={scrollRef}
          onWheel={handleHorizontalWheel}
          className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 pipeline-scrollbar"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
          data-scroll-container
        >
          <div className={cn("flex items-stretch min-w-max h-full", isCompact ? "gap-1.5 p-1.5" : "gap-2 p-2")}>
            {laneStages.map((stage) => (
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
              />
            ))}
          </div>
        </div>
      )}

      {!collapsed && isMobile && laneStages.length > 1 && (
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
    </section>
  );
};

export default PipelineLane;
