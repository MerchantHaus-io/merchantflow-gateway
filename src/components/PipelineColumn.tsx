import { useState } from "react";
import { Plus, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
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
  onCardClick: (opportunity: Opportunity) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  onAddNew?: () => void;
  hideHeader?: boolean;
  isCompact?: boolean;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
}

const PipelineColumn = ({
  stage,
  opportunities,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
  onAssignmentChange,
  onSlaStatusChange,
  onAddNew,
  hideHeader = false,
  isCompact = false,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
}: PipelineColumnProps) => {
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set(opportunities.map((o) => o.id)));
  const [allCollapsed, setAllCollapsed] = useState(true);
  const config = STAGE_CONFIG[stage];
  const count = opportunities.length;

  const toggleCardCollapse = (id: string) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCards = () => {
    if (allCollapsed) setCollapsedCards(new Set());
    else setCollapsedCards(new Set(opportunities.map((o) => o.id)));
    setAllCollapsed(!allCollapsed);
  };

  return (
    <div
      className={cn(
        "flex-shrink-0 flex flex-col min-h-0 self-stretch overflow-hidden snap-start",
        "border-r-2 border-foreground/10 last:border-r-0",
        isCompact
          ? "w-[100px] sm:w-[120px] md:w-[150px] lg:w-[180px] xl:w-[210px]"
          : "w-[120px] sm:w-[150px] md:w-[190px] lg:w-[230px] xl:w-[270px]"
      )}
      data-stage={stage}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage)}
    >
      {/* Neo-brutalist Column Header */}
      {!hideHeader && (
        <div
          className="flex-shrink-0 border-b-[3px] px-2 py-2"
          style={{
            borderBottomColor: config.color || "hsl(var(--primary))",
            background: `linear-gradient(180deg, ${config.color}15 0%, transparent 100%)`,
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="text-lg leading-none"
                role="img"
                aria-label={config.label}
              >
                {config.icon}
              </span>
              <span
                className={cn(
                  "font-black uppercase tracking-wider text-foreground truncate",
                  isCompact ? "text-[9px]" : "text-[10px] sm:text-xs"
                )}
              >
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <span
                className="font-black text-xs px-1.5 py-0.5 border-2"
                style={{
                  borderColor: config.color,
                  color: config.color,
                  backgroundColor: `${config.color}15`,
                }}
              >
                {count}
              </span>
              {stage === "application_started" && onAddNew && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-primary hover:bg-primary/90 text-primary-foreground border-2 border-foreground/50"
                  onClick={onAddNew}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              {count > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={toggleAllCards}
                  title={allCollapsed ? "Expand all" : "Collapse all"}
                >
                  {allCollapsed ? (
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronsDownUp className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Cards Area */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain min-h-0",
          isCompact ? "p-1 space-y-1" : "p-1.5 space-y-1.5"
        )}
        style={{ WebkitOverflowScrolling: "touch", touchAction: "auto" }}
      >
        {opportunities.length === 0 ? (
          <div
            className={cn(
              "flex items-center justify-center text-muted-foreground/50 border-2 border-dashed border-border/40 font-bold uppercase tracking-wider",
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
              onClick={() => onCardClick(opportunity)}
              onAssignmentChange={onAssignmentChange}
              onSlaStatusChange={onSlaStatusChange}
              isCollapsed={collapsedCards.has(opportunity.id)}
              onToggleCollapse={() => toggleCardCollapse(opportunity.id)}
              onTouchDragStart={onTouchDragStart}
              onTouchDragMove={onTouchDragMove}
              onTouchDragEnd={onTouchDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PipelineColumn;
