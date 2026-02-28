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
  onAddNew?: () => void;
  hideHeader?: boolean;
  isCompact?: boolean;
  currentUser?: string;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
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
  hideHeader = false,
  isCompact = false,
  currentUser,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
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
          ? "w-[100px] sm:w-[120px] md:w-[150px] lg:w-[180px] xl:w-[210px]"
          : "w-[120px] sm:w-[150px] md:w-[190px] lg:w-[230px] xl:w-[270px]",
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
      {/* Column Header — pill-style badge */}
      {!hideHeader && (
        <div className="flex-shrink-0 px-1 py-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide",
                isCompact ? "text-[8px]" : "text-[10px] sm:text-xs"
              )}
              style={{
                color: config.color || "hsl(var(--primary))",
                backgroundColor: `${config.color || "hsl(var(--primary))"}12`,
                border: `1px solid ${config.color || "hsl(var(--primary))"}25`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: config.color || "hsl(var(--primary))" }}
              />
              {config.label}
              <span className="font-black">{count}</span>
            </span>
            {stage === "application_started" && onAddNew && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-sm"
                onClick={onAddNew}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {/* Column monetary value */}
          {!isCompact && columnValue > 0 && (
            <div className="mt-1 px-1 text-[10px] font-semibold text-muted-foreground truncate">
              {formatCurrency(columnValue)}
            </div>
          )}
        </div>
      )}

      {/* Scrollable Cards Area */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain min-h-0 no-scrollbar",
          isCompact ? "p-1 space-y-1" : "p-1.5 space-y-1.5"
        )}
        style={{ WebkitOverflowScrolling: "touch", touchAction: "auto" }}
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
              onTouchDragStart={onTouchDragStart}
              onTouchDragMove={onTouchDragMove}
              onTouchDragEnd={onTouchDragEnd}
              currentUser={currentUser}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PipelineColumn;
