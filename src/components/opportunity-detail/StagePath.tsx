import { Opportunity, STAGE_CONFIG, PROCESSING_PIPELINE_STAGES, GATEWAY_ONLY_PIPELINE_STAGES, getServiceType, OpportunityStage } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StagePathProps {
  opportunity: Opportunity;
}

const STAGE_EXIT_REQUIREMENTS: Record<string, string> = {
  new: "Contact qualified, basic info collected",
  discovery: "Needs identified, solution proposed",
  qualified: "Decision maker engaged, budget confirmed",
  underwriting_review: "Application complete, documents submitted",
  processor_approval: "Risk assessment passed",
  gateway_submitted: "Integration configured",
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

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Stage Progress
      </h3>
      
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stages.map((stage, index) => {
          const stageConfig = STAGE_CONFIG[stage];
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;
          
          return (
            <div key={stage} className="flex items-center">
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
