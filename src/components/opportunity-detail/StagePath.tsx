import { Opportunity, STAGE_CONFIG, PROCESSING_PIPELINE_STAGES, GATEWAY_ONLY_PIPELINE_STAGES, getServiceType, OpportunityStage } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { Check, Circle, GripHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRef, useState, useEffect } from "react";

interface StagePathProps {
  opportunity: Opportunity;
}

const STAGE_EXIT_REQUIREMENTS: Record<string, string> = {
  application_started: "Contact qualified, basic info collected",
  discovery: "Needs identified, solution proposed",
  qualified: "Decision maker engaged, budget confirmed",
  application_prep: "Application complete, documents submitted",
  underwriting_review: "Risk assessment passed",
  processor_approval: "Processor approved",
  integration_setup: "Integration configured",
  gateway_submitted: "Gateway submitted",
  live_activated: "First transaction processed",
  closed_won: "Contract signed, activated",
  closed_lost: "Opportunity closed",
};

export const StagePath = ({ opportunity }: StagePathProps) => {
  const serviceType = getServiceType(opportunity);
  const stages = serviceType === "gateway_only" 
    ? GATEWAY_ONLY_PIPELINE_STAGES 
    : PROCESSING_PIPELINE_STAGES;
  
  const currentStageIndex = stages.indexOf(opportunity.stage as OpportunityStage);
  const stageEnteredAt = opportunity.stage_entered_at 
    ? new Date(opportunity.stage_entered_at) 
    : new Date(opportunity.created_at);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showGrabHint, setShowGrabHint] = useState(true);

  // Hide grab hint after first interaction
  useEffect(() => {
    const timer = setTimeout(() => setShowGrabHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
    setShowGrabHint(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Touch support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
    setShowGrabHint(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !scrollRef.current) return;
    const x = e.touches[0].pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Stage Progress
        </h3>
        {showGrabHint && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
            <GripHorizontal className="h-3 w-3" />
            <span>Drag to scroll</span>
          </div>
        )}
      </div>
      
      <div 
        ref={scrollRef}
        className={cn(
          "flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {stages.map((stage, index) => {
          const stageConfig = STAGE_CONFIG[stage];
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;
          
          return (
            <div key={stage} className="flex items-center shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-default whitespace-nowrap",
                      isCompleted && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      isCurrent && "bg-primary/10 text-primary ring-1 ring-primary/30",
                      isPending && "bg-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3 w-3" />
                    ) : isCurrent ? (
                      <Circle className="h-3 w-3 fill-current" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">{stageConfig.label}</span>
                    <span className="sm:hidden">{stageConfig.label.split(" ")[0]}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <div className="space-y-1">
                    <p className="font-medium">{stageConfig.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {STAGE_EXIT_REQUIREMENTS[stage] || "Complete stage requirements"}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-primary">
                        Entered {formatDistanceToNow(stageEnteredAt, { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              
              {index < stages.length - 1 && (
                <div 
                  className={cn(
                    "w-4 h-0.5 mx-0.5",
                    isCompleted ? "bg-emerald-500/50" : "bg-muted"
                  )} 
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
