import { useState, useRef, useMemo } from "react";
import { Plus } from "lucide-react";
import { Opportunity, OpportunityStage, STAGE_CONFIG } from "@/types/opportunity";
import OpportunityCard from "./OpportunityCard";
import { cn } from "@/lib/utils";
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
}

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
}: PipelineColumnProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragEnterCounter = useRef(0);
  const config = STAGE_CONFIG[stage];
  const count = opportunities.length;

  // Sum deal value: 33% of 2.92% processing fee + $1 per 10 transactions
  const columnValue = useMemo(() => {
    let total = 0;
    opportunities.forEach((opp) => {
      const formState = opp.wizard_state?.form_state as Record<string, string> | undefined;
      if (!formState?.monthly_volume) return;
      const vol = parseFloat(formState.monthly_volume.replace(/[^0-9.]/g, ""));
      if (isNaN(vol) || vol <= 0) return;
      const processingRevenue = vol * 0.0292 * 0.33;
      const avgTicket = formState.average_transaction
        ? parseFloat(formState.average_transaction.replace(/[^0-9.]/g, ""))
        : 0;
      const txnRevenue = avgTicket > 0 ? (vol / avgTicket / 10) : 0;
      total += processingRevenue + txnRevenue;
    });
    return total;
  }, [opportunities]);

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
      {/* Column Header — full-width solid pill */}
      {!hideHeader && (
        <div className="flex-shrink-0 px-1.5 py-1.5">
          <div
            className={cn(
              "w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg font-bold uppercase tracking-wide",
              isCompact ? "text-[8px]" : "text-[10px] sm:text-xs"
            )}
            style={{
              color: "#FFFFFF",
              backgroundColor: config.color || "hsl(var(--primary))",
              borderBottom: `2px solid ${config.color || "hsl(var(--primary))"}`,
            }}
          >
            <span className="inline-flex items-center gap-1.5 truncate">
              {config.label}
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span key={count} className="font-black animate-count inline-block">{count}</span>
              {stage === "discovery" && onAddNew && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 bg-indigo-600 hover:bg-indigo-700 hover:shadow-[0_0_12px_hsl(var(--primary)/0.4)] text-white rounded-full shadow-sm ml-1 transition-all"
                  onClick={onAddNew}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </span>
          </div>
          {/* Column monetary value */}
          {!isCompact && columnValue > 0 && (
            <div className="mt-1 px-1 text-[10px] font-semibold text-muted-foreground truncate">
              {formatCurrency(columnValue)}
            </div>
          )}
        </div>
      )}

      {/* Scrollable Cards Area.
          touchAction: pan-y tells the browser: only this element handles
          vertical panning; horizontal swipes skip this element and bubble
          to the outer pipeline container. Previously used 'pan-x pan-y'
          which caused jitter because the browser would attempt to start
          horizontal pan on this element despite it having no horizontal
          overflow, fighting the outer container.

          overscroll-contain was dropped so a swipe past the top/bottom
          of the list doesn't feel stuck — it chains up naturally. */}
      <div
        className={cn(
          "flex-1 overflow-y-auto min-h-0 no-scrollbar animate-stagger",
          isCompact ? "p-1 space-y-1" : "p-1.5 space-y-1.5"
        )}
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
      >
        {opportunities.length === 0 ? (
          <div
            className={cn(
              "flex items-center justify-center text-muted-foreground/50 border border-dashed border-border/40 rounded-lg font-medium",
              isCompact ? "h-10 text-[8px]" : "h-14 text-[9px]"
            )}
          >
            Drop here
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
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PipelineColumn;
