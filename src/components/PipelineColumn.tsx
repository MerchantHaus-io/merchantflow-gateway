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
}: PipelineColumnProps) => {
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const config = STAGE_CONFIG[stage];
  const count = opportunities.length;

  const toggleCardCollapse = (id: string) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllCards = () => {
    if (allCollapsed) {
      setCollapsedCards(new Set());
    } else {
      setCollapsedCards(new Set(opportunities.map((o) => o.id)));
    }
    setAllCollapsed(!allCollapsed);
  };

  return (
    <div
      className={cn(
        "flex-shrink-0 flex flex-col min-h-0 self-stretch bg-muted/30 overflow-hidden snap-start",
        isCompact 
          ? "rounded-md w-[90px] sm:w-[110px] md:w-[130px] lg:w-[150px] mobile-landscape:w-[140px]" 
          : "rounded-lg w-[100px] sm:w-[130px] md:w-[150px] lg:w-[180px] mobile-landscape:w-[160px]"
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage)}
    >
      {/* Column Header */}
      {!hideHeader && (
        <div className="px-3 py-2.5 flex-shrink-0 border-b-2" style={{ borderColor: config.color || 'hsl(var(--primary))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: `${config.color}20` || 'hsl(var(--primary) / 0.1)' }}
              >
                <span className="text-[10px] font-bold" style={{ color: config.color || 'hsl(var(--primary))' }}>
                  {config.icon || '●'}
                </span>
              </div>
              <span className="text-sm font-semibold text-foreground">
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {stage === 'application_started' && onAddNew && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={onAddNew}
                >
                  <Plus className="h-4 w-4" />
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
                    <ChevronsUpDown className="h-4 w-4" />
                  ) : (
                    <ChevronsDownUp className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Bar when header is hidden */}
      {hideHeader && (
        <div className={cn(
          "px-1 flex items-center justify-end gap-0.5 bg-muted/20",
          isCompact ? "py-0" : "py-0.5"
        )}>
          {stage === 'application_started' && onAddNew && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "text-muted-foreground hover:text-foreground",
                isCompact ? "h-4 w-4" : "h-5 w-5"
              )}
              onClick={onAddNew}
            >
              <Plus className={isCompact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            </Button>
          )}
          {count > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "text-muted-foreground hover:text-foreground",
                isCompact ? "h-4 w-4" : "h-5 w-5"
              )}
              onClick={toggleAllCards}
              title={allCollapsed ? "Expand all" : "Collapse all"}
            >
              {allCollapsed ? (
                <ChevronsUpDown className={isCompact ? "h-2.5 w-2.5" : "h-3 w-3"} />
              ) : (
                <ChevronsDownUp className={isCompact ? "h-2.5 w-2.5" : "h-3 w-3"} />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Scrollable Cards Area */}
      <div className={cn(
        "flex-1 overflow-y-auto overscroll-contain min-h-0",
        isCompact ? "p-0.5 space-y-0.5" : "p-1 space-y-1"
      )} style={{ WebkitOverflowScrolling: 'touch' }}>
        {opportunities.length === 0 ? (
          <div className={cn(
            "flex items-center justify-center text-muted-foreground/60 border border-dashed border-border/30 rounded",
            isCompact ? "h-8 text-[8px]" : "h-12 text-[10px]"
          )}>
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
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PipelineColumn;
