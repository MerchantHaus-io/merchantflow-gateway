import { useState } from "react";
import { Opportunity, OpportunityStage, PIPELINE_STAGES } from "@/types/opportunity";
import PipelineColumn from "./PipelineColumn";
import OpportunityDetailModal from "./OpportunityDetailModal";

interface PipelineBoardProps {
  opportunities: Opportunity[];
  onUpdateOpportunity: (id: string, updates: Partial<Opportunity>) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onAddNew?: () => void;
}

const PipelineBoard = ({ opportunities, onUpdateOpportunity, onAssignmentChange, onAddNew }: PipelineBoardProps) => {
  const [draggedOpportunity, setDraggedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  const handleDragStart = (e: React.DragEvent, opportunity: Opportunity) => {
    setDraggedOpportunity(opportunity);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stage: OpportunityStage) => {
    e.preventDefault();
    if (draggedOpportunity && draggedOpportunity.stage !== stage) {
      onUpdateOpportunity(draggedOpportunity.id, { stage });
    }
    setDraggedOpportunity(null);
  };

  const getOpportunitiesByStage = (stage: OpportunityStage) => {
    return opportunities
      .filter((o) => o.stage === stage)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  return (
    <>
      <div className="flex-1 overflow-x-auto p-3">
        <div className="flex gap-2 h-full">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              opportunities={getOpportunitiesByStage(stage)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={setSelectedOpportunity}
              onAssignmentChange={onAssignmentChange}
              onAddNew={stage === 'application_started' ? onAddNew : undefined}
            />
          ))}
        </div>
      </div>

      <OpportunityDetailModal
        opportunity={selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
        onUpdate={(updates) => {
          if (selectedOpportunity) {
            onUpdateOpportunity(selectedOpportunity.id, updates);
          }
        }}
      />
    </>
  );
};

export default PipelineBoard;
