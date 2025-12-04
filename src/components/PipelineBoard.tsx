import { useState } from "react";
import { Opportunity, OpportunityStage, PIPELINE_STAGES } from "@/types/opportunity";
import PipelineColumn from "./PipelineColumn";
import OpportunityDetailModal from "./OpportunityDetailModal";

interface PipelineBoardProps {
  opportunities: Opportunity[];
  onUpdateOpportunity: (id: string, updates: Partial<Opportunity>) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
}

const PipelineBoard = ({ opportunities, onUpdateOpportunity, onAssignmentChange }: PipelineBoardProps) => {
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
    return opportunities.filter((o) => o.stage === stage);
  };

  return (
    <>
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
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
