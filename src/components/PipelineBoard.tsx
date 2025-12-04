import { useState } from "react";
import { Merchant, PipelineStage, PIPELINE_STAGES } from "@/types/merchant";
import PipelineColumn from "./PipelineColumn";
import MerchantDetailModal from "./MerchantDetailModal";

interface PipelineBoardProps {
  merchants: Merchant[];
  onUpdateMerchant: (id: string, updates: Partial<Merchant>) => void;
}

const PipelineBoard = ({ merchants, onUpdateMerchant }: PipelineBoardProps) => {
  const [draggedMerchant, setDraggedMerchant] = useState<Merchant | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);

  const handleDragStart = (e: React.DragEvent, merchant: Merchant) => {
    setDraggedMerchant(merchant);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    if (draggedMerchant && draggedMerchant.stage !== stage) {
      onUpdateMerchant(draggedMerchant.id, { stage });
    }
    setDraggedMerchant(null);
  };

  const getMerchantsByStage = (stage: PipelineStage) => {
    return merchants.filter((m) => m.stage === stage);
  };

  return (
    <>
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              merchants={getMerchantsByStage(stage)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={setSelectedMerchant}
            />
          ))}
        </div>
      </div>

      <MerchantDetailModal
        merchant={selectedMerchant}
        onClose={() => setSelectedMerchant(null)}
        onUpdate={(updates) => {
          if (selectedMerchant) {
            onUpdateMerchant(selectedMerchant.id, updates);
          }
        }}
      />
    </>
  );
};

export default PipelineBoard;
