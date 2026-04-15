import { Opportunity } from "@/types/opportunity";
import { StatusBlockerFloating } from "./StatusBlockerFloating";
import ActivitiesTab from "@/components/ActivitiesTab";
import CommentsTab from "@/components/CommentsTab";
import { Activity, MessageSquare } from "lucide-react";

interface DetailRightPanelProps {
  opportunityId: string;
  opportunity: Opportunity;
  wizardProgress: number;
  onUpdate: (updates: Partial<Opportunity>) => void;
}

export const DetailRightPanel = ({
  opportunityId,
  opportunity,
  wizardProgress,
  onUpdate,
}: DetailRightPanelProps) => {
  return (
    <div className="w-[320px] border-l border-border bg-muted/10 flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Status / Blocker */}
      {opportunity.outcome_status !== "closed_won" && (
        <div className="p-3 border-b border-border">
          <StatusBlockerFloating
            opportunity={opportunity}
            wizardProgress={wizardProgress}
            onUpdate={onUpdate}
          />
        </div>
      )}

      {/* Activity Feed */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
          <ActivitiesTab opportunityId={opportunityId} />
        </div>
      </div>

      {/* Comments */}
      <div className="border-t border-border">
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comments</h3>
        </div>
        <div className="px-3 pb-3">
          <CommentsTab opportunityId={opportunityId} />
        </div>
      </div>
    </div>
  );
};
