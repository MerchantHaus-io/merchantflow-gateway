import { useState, useMemo, useRef, useEffect } from "react";
import { CreditCard, Zap } from "lucide-react";
import {
  Opportunity,
  OpportunityStage,
  PROCESSING_PIPELINE_STAGES,
  GATEWAY_ONLY_PIPELINE_STAGES,
  STAGE_CONFIG,
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
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  onAddNew?: () => void;
  onMarkAsDead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onConvertToGateway?: (opportunity: Opportunity) => Promise<void> | void;
  onMoveToProcessing?: (opportunity: Opportunity) => Promise<void> | void;
}

interface PipelineSectionProps {
  title: string;
  icon: React.ReactNode;
  stages: OpportunityStage[];
  opportunities: Opportunity[];
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stage: OpportunityStage, pipelineType: 'processing' | 'gateway') => void;
  onCardClick: (opportunity: Opportunity) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  onAddNew?: () => void;
  colorAccent: string;
  pipelineType: 'processing' | 'gateway';
}

const PipelineSection = ({
  title,
  icon,
  stages,
  opportunities,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
  onAssignmentChange,
  onSlaStatusChange,
  onAddNew,
  colorAccent,
  pipelineType,
}: PipelineSectionProps) => {
  const totalCount = opportunities.length;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const headerScroll = headerScrollRef.current;

    if (!scrollContainer || !headerScroll) return;

    const syncHeaderToContent = () => {
      if (headerScroll) {
        headerScroll.scrollLeft = scrollContainer.scrollLeft;
      }
    };

    const syncContentToHeader = () => {
      if (scrollContainer) {
        scrollContainer.scrollLeft = headerScroll.scrollLeft;
      }
    };

    scrollContainer.addEventListener('scroll', syncHeaderToContent);
    headerScroll.addEventListener('scroll', syncContentToHeader);

    return () => {
      scrollContainer.removeEventListener('scroll', syncHeaderToContent);
      headerScroll.removeEventListener('scroll', syncContentToHeader);
    };
  }, []);

  const getOpportunitiesByStage = (stage: OpportunityStage) => {
    return opportunities
      .filter((o) => o.stage === stage)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  return (
    <div className="flex flex-1 min-h-0 min-w-0 border border-border/40 rounded-lg landscape:rounded-md overflow-hidden bg-card/50 shadow-sm">
      {/* Vertical Title Sidebar */}
      <div className={cn(
        "flex flex-col items-center justify-center flex-shrink-0 border-r border-border/40",
        "w-8 sm:w-10 lg:w-12 landscape:w-6",
        colorAccent
      )}>
        <div className="flex flex-col items-center gap-1 landscape:gap-0.5 py-2 sm:py-4 landscape:py-1">
          <span className="hidden sm:block landscape:hidden">{icon}</span>
          <span
            className="text-white font-semibold text-[10px] sm:text-xs landscape:text-[8px] whitespace-nowrap tracking-wide"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {title}
          </span>
          <span className="text-white/90 text-[10px] sm:text-xs landscape:text-[8px] font-medium bg-white/20 px-1 landscape:px-0.5 py-0.5 landscape:py-0 rounded-full">
            {totalCount}
          </span>
        </div>
      </div>

      {/* Pipeline Content Area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-background/50" data-pipeline={pipelineType}>
        {/* Sticky Column Headers Row */}
        <div
          ref={headerScrollRef}
          className="flex-shrink-0 overflow-x-auto overflow-y-hidden scrollbar-hide bg-muted/30"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-1 landscape:gap-0.5 p-1 landscape:p-0.5 pb-0 min-w-max">
            {stages.map((stage) => {
              const config = STAGE_CONFIG[stage];
              const count = getOpportunitiesByStage(stage).length;
              return (
                <div
                  key={stage}
                  className="flex-shrink-0 w-[100px] landscape:w-[90px] sm:w-[130px] md:w-[150px] lg:w-[180px] pb-1 border-b-2"
                  style={{ borderColor: config.color || 'hsl(var(--primary))' }}
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] landscape:text-[9px] font-semibold text-foreground truncate max-w-[60px] landscape:max-w-[55px]">
                        {config.label}
                      </span>
                    </div>
                    <span className="text-[9px] landscape:text-[8px] text-muted-foreground bg-muted px-1 py-0 rounded-full">
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Columns Content Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden min-h-0"
        >
          <div className="flex items-stretch gap-1 landscape:gap-0.5 p-1 landscape:p-0.5 pt-1 min-w-max min-h-0">
            {stages.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                opportunities={getOpportunitiesByStage(stage)}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={(e, s) => onDrop(e, s, pipelineType)}
                onCardClick={onCardClick}
                onAssignmentChange={onAssignmentChange}
                onSlaStatusChange={onSlaStatusChange}
                onAddNew={stage === 'application_started' ? onAddNew : undefined}
                hideHeader={true}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const DualPipelineBoard = ({
  opportunities,
  onUpdateOpportunity,
  onAssignmentChange,
  onSlaStatusChange,
  onAddNew,
  onMarkAsDead,
  onDelete,
  onConvertToGateway,
  onMoveToProcessing,
}: DualPipelineBoardProps) => {
  const [draggedOpportunity, setDraggedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  const { processingOpportunities, gatewayOpportunities } = useMemo(() => {
    const processing: Opportunity[] = [];
    const gateway: Opportunity[] = [];

    opportunities.forEach((opp) => {
      const migratedStage = migrateStage(opp.stage);
      const migratedOpp = migratedStage !== opp.stage
        ? { ...opp, stage: migratedStage }
        : opp;

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
    const serviceType = getServiceType(opportunity);
    e.dataTransfer.setData('text/plain', serviceType);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stage: OpportunityStage, targetPipeline: 'processing' | 'gateway') => {
    e.preventDefault();
    if (draggedOpportunity) {
      const targetIsGateway = targetPipeline === 'gateway';
      const sourceIsGateway = getServiceType(draggedOpportunity) === 'gateway_only';
      
      const updates: Partial<Opportunity> = { stage };
      
      if (targetIsGateway !== sourceIsGateway) {
        if (targetIsGateway) {
          updates.processing_services = [];
        } else {
          updates.processing_services = draggedOpportunity.processing_services?.length 
            ? draggedOpportunity.processing_services 
            : ['Credit Card'];
        }
      }
      
      if (draggedOpportunity.stage !== stage || targetIsGateway !== sourceIsGateway) {
        onUpdateOpportunity(draggedOpportunity.id, updates);
      }
    }
    setDraggedOpportunity(null);
  };

  const hasGatewayOpportunity = selectedOpportunity
    ? opportunities.some(
        (opp) => opp.account_id === selectedOpportunity.account_id && getServiceType(opp) === 'gateway_only'
      )
    : false;

  return (
    <>
      <div className="flex-1 min-h-0 w-full flex flex-col lg:flex-row p-2 landscape:p-1 gap-2 landscape:gap-1 overflow-hidden">
        {/* NMI Payments Pipeline Section */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <PipelineSection
            title="NMI Payments Pipeline"
            icon={<CreditCard className="h-5 w-5 text-white" />}
            stages={PROCESSING_PIPELINE_STAGES}
            opportunities={processingOpportunities}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onCardClick={setSelectedOpportunity}
            onAssignmentChange={onAssignmentChange}
            onSlaStatusChange={onSlaStatusChange}
            onAddNew={onAddNew}
            colorAccent="bg-primary"
            pipelineType="processing"
          />
        </div>

        {/* NMI Gateway Pipeline Section */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <PipelineSection
            title="NMI Gateway Pipeline"
            icon={<Zap className="h-5 w-5 text-white" />}
            stages={GATEWAY_ONLY_PIPELINE_STAGES}
            opportunities={gatewayOpportunities}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onCardClick={setSelectedOpportunity}
            onAssignmentChange={onAssignmentChange}
            onSlaStatusChange={onSlaStatusChange}
            onAddNew={onAddNew}
            colorAccent="bg-teal"
            pipelineType="gateway"
          />
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
        onMarkAsDead={onMarkAsDead}
        onDelete={onDelete}
        onConvertToGateway={onConvertToGateway}
        onMoveToProcessing={onMoveToProcessing}
        hasGatewayOpportunity={hasGatewayOpportunity}
      />
    </>
  );
};

export default DualPipelineBoard;
