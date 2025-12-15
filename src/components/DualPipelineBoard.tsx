import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, CreditCard, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Opportunity,
  OpportunityStage,
  PROCESSING_PIPELINE_STAGES,
  GATEWAY_ONLY_PIPELINE_STAGES,
  getServiceType,
  migrateStage,
} from "@/types/opportunity";
import PipelineColumn from "./PipelineColumn";
import OpportunityDetailModal from "./OpportunityDetailModal";
import { cn } from "@/lib/utils";

interface DualPipelineBoardProps {
  opportunities: Opportunity[];
  onUpdateOpportunity: (id: string, updates: Partial<Opportunity>) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onAddNew?: () => void;
  onMarkAsDead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

interface PipelineSectionProps {
  title: string;
  icon: React.ReactNode;
  stages: OpportunityStage[];
  opportunities: Opportunity[];
  isExpanded: boolean;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stage: OpportunityStage) => void;
  onCardClick: (opportunity: Opportunity) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onAddNew?: () => void;
  colorAccent: string;
}

const PipelineSection = ({
  title,
  icon,
  stages,
  opportunities,
  isExpanded,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
  onAssignmentChange,
  onAddNew,
  colorAccent,
}: PipelineSectionProps) => {
  const totalCount = opportunities.length;

  const getOpportunitiesByStage = (stage: OpportunityStage) => {
    return opportunities
      .filter((o) => o.stage === stage)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  return (
    <div className="flex flex-col">
      {/* Section Header */}
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors",
          "bg-card/50 hover:bg-card/70 border border-border/40",
          "dark:bg-card/50 dark:hover:bg-card/70"
        )}
      >
        <span className={cn("p-1.5 rounded-md", colorAccent)}>
          {icon}
        </span>
        <span className="font-semibold text-sm text-foreground flex-1 text-left">
          {title}
        </span>
        <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
          {totalCount} {totalCount === 1 ? 'deal' : 'deals'}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Pipeline Columns */}
      {isExpanded && (
        <div className="flex-1 overflow-x-auto pb-2">
          <div className="flex gap-3 min-h-[300px]">
            {stages.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                opportunities={getOpportunitiesByStage(stage)}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onCardClick={onCardClick}
                onAssignmentChange={onAssignmentChange}
                onAddNew={stage === 'application_started' ? onAddNew : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const DualPipelineBoard = ({
  opportunities,
  onUpdateOpportunity,
  onAssignmentChange,
  onAddNew,
  onMarkAsDead,
  onDelete,
}: DualPipelineBoardProps) => {
  const [draggedOpportunity, setDraggedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [processingExpanded, setProcessingExpanded] = useState(true);
  const [gatewayExpanded, setGatewayExpanded] = useState(true);

  // Migrate stages and split opportunities by service type
  const { processingOpportunities, gatewayOpportunities } = useMemo(() => {
    const processing: Opportunity[] = [];
    const gateway: Opportunity[] = [];

    opportunities.forEach((opp) => {
      // Apply stage migration (opportunities -> application_prep)
      const migratedStage = migrateStage(opp.stage);
      const migratedOpp = migratedStage !== opp.stage
        ? { ...opp, stage: migratedStage }
        : opp;

      // Determine service type
      const serviceType = getServiceType(migratedOpp);

      if (serviceType === 'gateway_only') {
        gateway.push(migratedOpp);
      } else {
        processing.push(migratedOpp);
      }
    });

    return { processingOpportunities: processing, gatewayOpportunities: gateway };
  }, [opportunities]);

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

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Processing Pipeline Section */}
        <PipelineSection
          title="Processing Pipeline"
          icon={<CreditCard className="h-4 w-4 text-white" />}
          stages={PROCESSING_PIPELINE_STAGES}
          opportunities={processingOpportunities}
          isExpanded={processingExpanded}
          onToggle={() => setProcessingExpanded(!processingExpanded)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={setSelectedOpportunity}
          onAssignmentChange={onAssignmentChange}
          onAddNew={onAddNew}
          colorAccent="bg-primary"
        />

        {/* Gateway Only Pipeline Section */}
        <PipelineSection
          title="Gateway Only Pipeline"
          icon={<Zap className="h-4 w-4 text-white" />}
          stages={GATEWAY_ONLY_PIPELINE_STAGES}
          opportunities={gatewayOpportunities}
          isExpanded={gatewayExpanded}
          onToggle={() => setGatewayExpanded(!gatewayExpanded)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={setSelectedOpportunity}
          onAssignmentChange={onAssignmentChange}
          onAddNew={onAddNew}
          colorAccent="bg-teal"
        />
      </div>

      <OpportunityDetailModal
        opportunity={selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
        onUpdate={(updates) => {
          if (selectedOpportunity) {
            onUpdateOpportunity(selectedOpportunity.id, updates);
          }
        }}
        onMarkAsDead={onMarkAsDead}
        onDelete={onDelete}
      />
    </>
  );
};

export default DualPipelineBoard;
