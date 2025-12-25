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
        "flex-shrink-0 w-[220px] flex flex-col h-full min-h-0 rounded-lg bg-muted/30 overflow-hidden"
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
        <div className="px-2 py-1.5 flex items-center justify-end gap-1 bg-muted/20">
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
      )}

      {/* Scrollable Cards Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {opportunities.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/60 border-2 border-dashed border-border/30 rounded-lg">
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
