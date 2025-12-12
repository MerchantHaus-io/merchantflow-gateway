import { useState } from "react";
import { Opportunity, OpportunityStage, STAGE_CONFIG } from "@/types/opportunity";
import OpportunityCard from "./OpportunityCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineColumnProps {
  stage: OpportunityStage;
  opportunities: Opportunity[];
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stage: OpportunityStage) => void;
  onCardClick: (opportunity: Opportunity) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onAddNew?: () => void;
}

// Saturated, solid background colors for column headers (no transparency)
const STAGE_HEADER_COLORS: Record<OpportunityStage, string> = {
  application_started: 'bg-blue-600',
  discovery: 'bg-indigo-600',
  qualified: 'bg-cyan-600',
  opportunities: 'bg-teal-600',
  underwriting_review: 'bg-purple-600',
  processor_approval: 'bg-pink-600',
  integration_setup: 'bg-orange-600',
  gateway_submitted: 'bg-amber-500',
  live_activated: 'bg-green-600',
  closed_won: 'bg-emerald-700',
  closed_lost: 'bg-red-700',
};

const PipelineColumn = ({
  stage,
  opportunities,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
  onAssignmentChange,
  onAddNew,
}: PipelineColumnProps) => {
  const config = STAGE_CONFIG[stage];
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

  const toggleCardCollapse = (id: string) => {
    setCollapsedCards(prev => {
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
      setCollapsedCards(new Set(opportunities.map(o => o.id)));
    }
    setAllCollapsed(!allCollapsed);
  };

  return (
    <div
      className="flex-1 min-w-[160px] max-w-[220px] flex flex-col bg-card/50 rounded-xl border border-border/40 shadow-sm overflow-hidden"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage)}
    >
      {/* Column Header with solid saturated background */}
      <div className={cn(
        "px-3 py-2.5",
        STAGE_HEADER_COLORS[stage]
      )}>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-xs text-white truncate flex-1">{config.label}</h2>
          <span className="text-[10px] text-white/90 bg-white/20 px-1.5 py-0.5 rounded-full font-medium">
            {opportunities.length}
          </span>
          {stage === 'application_started' && onAddNew && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-white hover:text-white hover:bg-white/20"
              onClick={onAddNew}
              title="Add new application"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          {opportunities.length > 0 && (
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

      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              onDragStart={onDragStart}
              onClick={() => onCardClick(opportunity)}
              onAssignmentChange={onAssignmentChange}
              isCollapsed={collapsedCards.has(opportunity.id)}
              onToggleCollapse={() => toggleCardCollapse(opportunity.id)}
            />
          ))}

          {opportunities.length === 0 && (
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-border/30 rounded-lg bg-muted/20">
              <p className="text-[10px] text-muted-foreground">Drop here</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PipelineColumn;