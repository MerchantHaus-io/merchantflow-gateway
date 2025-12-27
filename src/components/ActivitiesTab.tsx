import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Activity, 
  ArrowRight, 
  UserPlus, 
  Clock, 
  CheckCircle2, 
  Plus, 
  FileText,
  MessageSquare,
  Zap,
  Skull,
  ListChecks
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { STAGE_CONFIG, OpportunityStage, EMAIL_TO_USER } from "@/types/opportunity";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  opportunity_id: string;
  type: string;
  description: string | null;
  user_email: string | null;
  created_at: string;
}

interface ActivitiesTabProps {
  opportunityId: string;
  compact?: boolean;
}

// Activity type configuration
const ACTIVITY_CONFIG: Record<string, { 
  icon: React.ElementType; 
  color: string; 
  bgColor: string;
  label: string;
}> = {
  stage_change: { 
    icon: ArrowRight, 
    color: "text-blue-500", 
    bgColor: "bg-blue-500/10",
    label: "Stage Change"
  },
  assignment_change: { 
    icon: UserPlus, 
    color: "text-purple-500", 
    bgColor: "bg-purple-500/10",
    label: "Assignment"
  },
  status_change: { 
    icon: Activity, 
    color: "text-amber-500", 
    bgColor: "bg-amber-500/10",
    label: "Status Change"
  },
  task_created: { 
    icon: Plus, 
    color: "text-green-500", 
    bgColor: "bg-green-500/10",
    label: "Task Created"
  },
  task_completed: { 
    icon: CheckCircle2, 
    color: "text-emerald-500", 
    bgColor: "bg-emerald-500/10",
    label: "Task Completed"
  },
  document_uploaded: { 
    icon: FileText, 
    color: "text-cyan-500", 
    bgColor: "bg-cyan-500/10",
    label: "Document"
  },
  note_added: { 
    icon: MessageSquare, 
    color: "text-indigo-500", 
    bgColor: "bg-indigo-500/10",
    label: "Note"
  },
  opportunity_created: { 
    icon: Zap, 
    color: "text-primary", 
    bgColor: "bg-primary/10",
    label: "Created"
  },
  marked_dead: { 
    icon: Skull, 
    color: "text-destructive", 
    bgColor: "bg-destructive/10",
    label: "Archived"
  },
  wizard_progress: { 
    icon: ListChecks, 
    color: "text-teal-500", 
    bgColor: "bg-teal-500/10",
    label: "Wizard Progress"
  },
};

const ActivitiesTab = ({ opportunityId, compact = false }: ActivitiesTabProps) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`activities-${opportunityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activities',
          filter: `opportunity_id=eq.${opportunityId}`
        },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [opportunityId]);

  const fetchActivities = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('id, opportunity_id, type, description, user_email, created_at')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setActivities(data);
    }
    setLoading(false);
  };

  const getStageLabel = (stage: string) => {
    return STAGE_CONFIG[stage as OpportunityStage]?.label || stage;
  };

  const parseStageMovement = (description: string | null) => {
    if (!description) return null;
    const match = description.match(/Moved from (.+) to (.+)/);
    if (match) {
      return { from: match[1], to: match[2] };
    }
    return null;
  };

  const getDisplayName = (email: string | null) => {
    if (!email) return null;
    return EMAIL_TO_USER[email.toLowerCase()] || email.split('@')[0];
  };

  const getActivityConfig = (type: string) => {
    return ACTIVITY_CONFIG[type] || { 
      icon: Activity, 
      color: "text-muted-foreground", 
      bgColor: "bg-muted",
      label: type 
    };
  };

  if (loading) {
    return (
      <div className={cn("text-center text-muted-foreground", compact ? "py-4" : "py-8")}>
        <div className="animate-pulse">Loading activities...</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground", compact ? "py-4" : "py-8")}>
        <Activity className={cn("mx-auto mb-2 opacity-50", compact ? "h-8 w-8" : "h-12 w-12")} />
        <p className={compact ? "text-xs" : ""}>No activities yet</p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {(compact ? activities.slice(0, 5) : activities).map((activity) => {
        const stageMovement = activity.type === 'stage_change' ? parseStageMovement(activity.description) : null;
        const config = getActivityConfig(activity.type);
        const Icon = config.icon;
        const displayName = getDisplayName(activity.user_email);

        return (
          <div 
            key={activity.id} 
            className={cn(
              "flex items-start gap-2 bg-muted/50 rounded-lg",
              compact ? "p-2" : "p-3"
            )}
          >
            <div className={cn(
              "shrink-0 rounded p-1.5",
              config.bgColor
            )}>
              <Icon className={cn(
                config.color,
                compact ? "h-3 w-3" : "h-4 w-4"
              )} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className={cn("flex items-center gap-2 flex-wrap", compact ? "text-xs" : "text-sm")}>
                {stageMovement ? (
                  <>
                    <span className="font-medium">{getStageLabel(stageMovement.from)}</span>
                    <ArrowRight className={cn("text-muted-foreground shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
                    <span className="font-medium text-primary">{getStageLabel(stageMovement.to)}</span>
                  </>
                ) : (
                  <span className="line-clamp-1">{activity.description || config.label}</span>
                )}
              </div>
              
              <div className={cn(
                "flex items-center gap-1.5 text-muted-foreground mt-0.5",
                compact ? "text-[10px]" : "text-xs"
              )}>
                {displayName && (
                  <>
                    <span className="font-medium">{displayName}</span>
                    <span>•</span>
                  </>
                )}
                <Clock className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
                <span>
                  {compact 
                    ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })
                    : format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')
                  }
                </span>
              </div>
            </div>
          </div>
        );
      })}
      
      {compact && activities.length > 5 && (
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          +{activities.length - 5} more activities
        </p>
      )}
    </div>
  );
};

export default ActivitiesTab;
