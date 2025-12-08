import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { STAGE_CONFIG, OpportunityStage } from "@/types/opportunity";

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
}

const ActivitiesTab = ({ opportunityId }: ActivitiesTabProps) => {
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
      .select('*')
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

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="animate-pulse">Loading activities...</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No activities yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const stageMovement = activity.type === 'stage_change' ? parseStageMovement(activity.description) : null;

        return (
          <div 
            key={activity.id} 
            className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
          >
            <div className="bg-primary/10 p-2 rounded">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                {stageMovement ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{getStageLabel(stageMovement.from)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-primary">{getStageLabel(stageMovement.to)}</span>
                  </div>
                ) : (
                  <span>{activity.description || activity.type}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                {activity.user_email && (
                  <>
                    <span>{activity.user_email}</span>
                    <span>•</span>
                  </>
                )}
                <span>{format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ActivitiesTab;
