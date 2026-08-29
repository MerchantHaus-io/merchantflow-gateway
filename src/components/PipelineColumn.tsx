import { useState, useRef, useMemo } from "react";
import { Plus } from "lucide-react";
import { Opportunity, OpportunityStage, STAGE_CONFIG } from "@/types/opportunity";
import OpportunityCard from "./OpportunityCard";
import { cn } from "@/lib/utils";
import { sumMonthlyRevenue } from "@/lib/pipelineValue";
import type { DealSignal } from "@/hooks/useDealSignals";
import { Button } from "@/components/ui/button";

interface PipelineColumnProps {
  stage: OpportunityStage;
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
  hideHeader?: boolean;
  isCompact?: boolean;
  currentUser?: string;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  isAdmin?: boolean;
  signals?: Map<string, DealSignal>;
  onMoveRelative?: (opportunity: Opportunity, direction: -1 | 1) => void;
}

/**
 * What an empty column should say.
 *
 * Each one names the stage's job and how a deal arrives in it, so a rep who has
 * never seen the stage populated still knows what belongs there.
 */
const EMPTY_HINTS: Partial<Record<OpportunityStage, string>> = {
  discovery: "New deals land here. Add one with +.",
  qualified: "Nothing qualified. Drag a scoped deal here.",
  application_prep: "Nothing in prep. Move a qualified deal here to start its application.",
  underwriting_review: "Nothing with underwriting.",
  processor_approval: "Nothing awaiting the processor.",
  gateway_submitted: "Nothing submitted to the gateway.",
  integration_setup: "Nothing in setup.",
  testing: "Nothing in testing.",
  go_live_ready: "Nothing ready to go live.",
  closed_won: "No wins in this view yet.",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const PipelineColumn = ({
  stage,
  opportunities,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onCardClick,
  onAssignmentChange,
  onSlaStatusChange,
  onAddNew,
  onMarkAsDead,
  hideHeader = false,
  isCompact = false,
  currentUser,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  isAdmin,
  signals,
  onMoveRelative,
}: PipelineColumnProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragEnterCounter = useRef(0);
  const config = STAGE_CONFIG[stage];
  const count = opportunities.length;

  const columnValue = useMemo(() => sumMonthlyRevenue(opportunities), [opportunities]);

  return (
    <div
      className={cn(
        "flex-shrink-0 flex flex-col min-h-0 self-stretch overflow-hidden snap-start transition-colors duration-200",
        isCompact
          ? "w-[90px] sm:w-[110px] md:w-[135px] lg:w-[160px] xl:w-[190px]"
          : "w-[110px] sm:w-[135px] md:w-[170px] lg:w-[210px] xl:w-[245px]",
        isDragOver && "drag-over"
      )}
      data-stage={stage}
      onDragOver={onDragOver}
      onDrop={(e) => {
        onDrop(e, stage);
        setIsDragOver(false);
        dragEnterCounter.current = 0;
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragEnterCounter.current += 1;
        setIsDragOver(true);
      }}
      onDragLeave={() => {
        dragEnterCounter.current -= 1;
        if (dragEnterCounter.current <= 0) {
          setIsDragOver(false);
          dragEnterCounter.current = 0;
        }
      }}
    >
      {/* Column Header — hairline precision: typographic mark + gold underline */}
      {!hideHeader && (
        <div className="flex-shrink-0 px-2 pt-2 pb-3">
          <div
            className={cn(
              "w-full flex items-end justify-between gap-2 pb-2 border-b",
              count > 0 ? "border-[hsl(var(--gold)/0.55)]" : "border-border/40"
            )}
          >
            <span
              className={cn(
                "font-pipeline-mono font-bold uppercase text-foreground truncate",
                isCompact ? "text-[9px] tracking-[0.14em]" : "text-[10px] sm:text-[11px] tracking-[0.16em]"
              )}
            >
              {config.label}
            </span>
            <span className="inline-flex items-baseline gap-2 shrink-0">
              <span
                key={count}
                className={cn(
                  "font-pipeline-mono uppercase animate-count",
                  count > 0 ? "text-[hsl(var(--gold))]" : "text-muted-foreground/60",
                  isCompact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
                )}
              >
                {count} {count === 1 ? "DEAL" : "DEALS"}
              </span>
              {!isCompact && columnValue > 0 && (
                <span className="font-pipeline-mono font-medium text-[10px] text-foreground/85 truncate max-w-[90px]">
                  {formatCurrency(columnValue)}
                </span>
              )}
              {stage === "discovery" && onAddNew && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 -mb-0.5 text-[hsl(var(--gold))] hover:text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold)/0.1)] rounded-sm transition-all"
                  onClick={onAddNew}
                  aria-label="Add deal"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Scrollable Cards Area */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain min-h-0 no-scrollbar animate-stagger",
          isCompact ? "p-1 space-y-1" : "p-1.5 space-y-1.5"
        )}
        style={{ WebkitOverflowScrolling: "touch", touchAction: "auto" }}
        // Marks this list as the lane's wheel guard: a vertical wheel here is
        // the column's to consume, not the board's to turn into a sideways slide.
        data-column-cards
      >
        {opportunities.length === 0 ? (
          <div
            className={cn(
              "flex items-center justify-center text-center text-muted-foreground border border-dashed border-border/40 rounded-md px-2",
              isCompact ? "h-10 text-[9px] leading-tight" : "h-16 text-[10.5px] leading-snug",
            )}
          >
            {/* "No active deals" in 9px uppercase mono told a rep nothing they
                could act on. An empty column is the cheapest place to say what
                the stage is for and how a deal gets into it. */}
            {isCompact ? "Empty" : EMPTY_HINTS[stage] ?? "Nothing here yet."}
          </div>
        ) : (
          opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={() => onCardClick(opportunity)}
              onAssignmentChange={onAssignmentChange}
              onSlaStatusChange={onSlaStatusChange}
              onMarkAsDead={onMarkAsDead}
              onTouchDragStart={onTouchDragStart}
              onTouchDragMove={onTouchDragMove}
              onTouchDragEnd={onTouchDragEnd}
              currentUser={currentUser}
              isAdmin={isAdmin}
              signal={signals?.get(opportunity.id)}
              onMoveRelative={onMoveRelative}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PipelineColumn;
