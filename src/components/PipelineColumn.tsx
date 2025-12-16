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
  onAddNew?: () => void;
  hideHeader?: boolean;
}

const PipelineColumn = ({
  stage,
  opportunities,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
  onAssignmentChange,
  onAddNew,
  hideHeader = false,
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
        "flex-shrink-0 w-[150px] flex flex-col h-full rounded-md border border-border/30 bg-background/50 overflow-hidden",
        hideHeader && "rounded-t-none border-t-0"
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage)}
    >
      {/* Column Header - Only shown when not hidden */}
      {!hideHeader && (
        <div className={cn(
          "px-2 py-1.5 border-b border-white/10 flex-shrink-0",
          config.headerClass
        )}>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-[10px] font-semibold text-white truncate">
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <span className="text-[9px] text-white/90 bg-white/20 px-1 py-0.5 rounded">
                {count}
              </span>
              {stage === 'application_started' && onAddNew && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-white hover:text-white hover:bg-white/20"
                  onClick={onAddNew}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
              {count > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-white/80 hover:text-white hover:bg-white/20"
                  onClick={toggleAllCards}
                  title={allCollapsed ? "Expand all" : "Collapse all"}
                >
                  {allCollapsed ? (
                    <ChevronsUpDown className="h-3 w-3" />
                  ) : (
                    <ChevronsDownUp className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Column Action Bar - shown when header is hidden */}
      {hideHeader && (
        <div className="px-1.5 py-1 border-b border-border/30 flex items-center justify-end gap-0.5 bg-secondary/30">
          {stage === 'application_started' && onAddNew && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={onAddNew}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          {count > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={toggleAllCards}
              title={allCollapsed ? "Expand all" : "Collapse all"}
            >
              {allCollapsed ? (
                <ChevronsUpDown className="h-3 w-3" />
              ) : (
                <ChevronsDownUp className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Scrollable Cards Area */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 min-h-0 bg-secondary/30">
        {opportunities.length === 0 ? (
          <div className="flex items-center justify-center h-14 text-[10px] text-muted-foreground/60 border border-dashed border-border/30 rounded">
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
