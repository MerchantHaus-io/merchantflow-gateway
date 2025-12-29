import { useState, useMemo, useRef, useEffect } from "react";
import { CreditCard, Zap, Minimize2, Maximize2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  isCompact: boolean;
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
  isCompact,
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
    <div className={cn(
      "flex flex-1 min-h-0 min-w-0 border border-border/40 rounded-lg overflow-hidden bg-card/50 shadow-sm",
      isCompact && "landscape:rounded-md"
    )}>
      {/* Vertical Title Sidebar */}
      <div className={cn(
        "flex flex-col items-center justify-center flex-shrink-0 border-r border-border/40",
        isCompact ? "w-6 sm:w-8 lg:w-10 landscape:w-6" : "w-8 sm:w-10 lg:w-12",
        colorAccent
      )}>
        <div className={cn(
          "flex flex-col items-center py-2 sm:py-4",
          isCompact ? "gap-0.5 landscape:gap-0.5 landscape:py-1" : "gap-1"
        )}>
          <span className={cn("hidden sm:block", isCompact && "landscape:hidden")}>{icon}</span>
          <span
            className={cn(
              "text-white font-semibold whitespace-nowrap tracking-wide",
              isCompact ? "text-[8px] sm:text-[10px] landscape:text-[8px]" : "text-[10px] sm:text-xs"
            )}
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {title}
          </span>
          <span className={cn(
            "text-white/90 font-medium bg-white/20 rounded-full",
            isCompact ? "text-[8px] px-0.5 py-0 landscape:text-[8px]" : "text-[10px] sm:text-xs px-1 py-0.5"
          )}>
            {totalCount}
          </span>
        </div>
      </div>

      {/* Pipeline Content Area */}
      <div 
        className={cn(
          "flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative",
          pipelineType === 'processing' 
            ? "bg-gradient-to-br from-rose-500/5 via-background to-amber-500/5 dark:from-rose-500/10 dark:via-background dark:to-amber-500/10"
            : "bg-gradient-to-br from-teal-500/5 via-background to-cyan-500/5 dark:from-teal-500/10 dark:via-background dark:to-cyan-500/10"
        )} 
        data-pipeline={pipelineType}
      >
        {/* Decorative gradient orbs */}
        <div className={cn(
          "absolute inset-0 overflow-hidden pointer-events-none",
        )}>
          {pipelineType === 'processing' ? (
            <>
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-rose-500/10 to-transparent rounded-full blur-3xl dark:from-rose-500/20" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full blur-3xl dark:from-amber-500/20" />
            </>
          ) : (
            <>
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-teal-500/10 to-transparent rounded-full blur-3xl dark:from-teal-500/20" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-gradient-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl dark:from-cyan-500/20" />
            </>
          )}
        </div>
        {/* Sticky Column Headers Row */}
        <div
          ref={headerScrollRef}
          className="flex-shrink-0 overflow-x-auto overflow-y-hidden scrollbar-hide bg-muted/20 backdrop-blur-sm relative z-10"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className={cn(
            "flex min-w-max pb-0",
            isCompact ? "gap-0.5 p-0.5 landscape:gap-0.5 landscape:p-0.5" : "gap-1 p-1"
          )}>
            {stages.map((stage) => {
              const config = STAGE_CONFIG[stage];
              const count = getOpportunitiesByStage(stage).length;
              return (
                <div
                  key={stage}
                  className={cn(
                    "flex-shrink-0 pb-1 border-b-2",
                    isCompact 
                      ? "w-[90px] sm:w-[110px] md:w-[130px] lg:w-[150px] landscape:w-[90px]" 
                      : "w-[100px] sm:w-[130px] md:w-[150px] lg:w-[180px]"
                  )}
                  style={{ borderColor: config.color || 'hsl(var(--primary))' }}
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        "font-semibold text-foreground truncate",
                        isCompact 
                          ? "text-[9px] max-w-[55px] landscape:text-[9px] landscape:max-w-[55px]" 
                          : "text-[10px] max-w-[60px]"
                      )}>
                        {config.label}
                      </span>
                    </div>
                    <span className={cn(
                      "text-muted-foreground bg-muted px-1 py-0 rounded-full",
                      isCompact ? "text-[8px] landscape:text-[8px]" : "text-[9px]"
                    )}>
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
          className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 relative z-10"
        >
          <div className={cn(
            "flex items-stretch min-w-max min-h-0 pt-1",
            isCompact ? "gap-0.5 p-0.5 landscape:gap-0.5 landscape:p-0.5" : "gap-1 p-1"
          )}>
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
                isCompact={isCompact}
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
  const [isCompact, setIsCompact] = useState(false);
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
      {/* Compact Toggle Header */}
      <div className="flex-shrink-0 px-2 py-1 flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCompact(!isCompact)}
              className="h-7 px-2 gap-1 text-xs"
            >
              {isCompact ? (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Regular</span>
                </>
              ) : (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Compact</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isCompact ? "Switch to regular view" : "Switch to compact view"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className={cn(
        "flex-1 min-h-0 w-full flex flex-col gap-2 overflow-auto orientation-stable",
        isCompact ? "p-1 gap-1 landscape:p-1 landscape:gap-1" : "p-2"
      )}>
        {/* NMI Payments Pipeline Section */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <PipelineSection
            title="NMI Payments Pipeline"
            icon={<CreditCard className={cn("text-white", isCompact ? "h-4 w-4" : "h-5 w-5")} />}
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
            isCompact={isCompact}
          />
        </div>

        {/* NMI Gateway Pipeline Section */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <PipelineSection
            title="NMI Gateway Pipeline"
            icon={<Zap className={cn("text-white", isCompact ? "h-4 w-4" : "h-5 w-5")} />}
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
            isCompact={isCompact}
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
