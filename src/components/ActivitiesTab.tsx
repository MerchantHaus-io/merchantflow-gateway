import { useState, useEffect, useMemo } from "react";
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
  ListChecks,
  Mail
} from "lucide-react";
import { format, formatDistanceToNow, subDays, subWeeks, subMonths, isAfter } from "date-fns";
import { STAGE_CONFIG, OpportunityStage, EMAIL_TO_USER } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";

type TimeFilter = 'all' | 'today' | '7d' | '30d' | '1w' | '1m' | '3m' | 'custom';

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
  email_sent: { icon: Mail, color: "text-sky-500", bgColor: "bg-sky-500/10", label: "Email Sent" },
  email_received: { icon: Mail, color: "text-indigo-500", bgColor: "bg-indigo-500/10", label: "Email Received" },
  email_stage_notification: { icon: Mail, color: "text-sky-500", bgColor: "bg-sky-500/10", label: "Stage Email" },
  email_assignment_notification: { icon: Mail, color: "text-sky-500", bgColor: "bg-sky-500/10", label: "Assignment Email" },
  email_docs_request: { icon: Mail, color: "text-amber-500", bgColor: "bg-amber-500/10", label: "Docs Request Email" },
  email_decline_sent: { icon: Mail, color: "text-red-500", bgColor: "bg-red-500/10", label: "Decline Email" },
  email_account_closed: { icon: Mail, color: "text-red-600", bgColor: "bg-red-600/10", label: "Closure Email" },
};

const ActivitiesTab = ({ opportunityId, compact = false }: ActivitiesTabProps) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

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

  const getCutoffDate = (): Date | null => {
    const now = new Date();
    switch (timeFilter) {
      case 'today': return subDays(now, 1);
      case '7d': return subDays(now, 7);
      case '30d': return subDays(now, 30);
      case '1w': return subWeeks(now, 1);
      case '1m': return subMonths(now, 1);
      case '3m': return subMonths(now, 3);
      case 'custom': return customRange?.from || null;
      default: return null;
    }
  };

  const filteredActivities = useMemo(() => {
    if (timeFilter === 'all') return activities;
    if (timeFilter === 'custom' && customRange?.from) {
      return activities.filter((a) => {
        const d = new Date(a.created_at);
        const afterFrom = isAfter(d, customRange.from!) || d.getTime() === customRange.from!.getTime();
        const beforeTo = !customRange.to || d <= new Date(new Date(customRange.to).setHours(23, 59, 59, 999));
        return afterFrom && beforeTo;
      });
    }
    const cutoff = getCutoffDate();
    if (!cutoff) return activities;
    return activities.filter((a) => isAfter(new Date(a.created_at), cutoff));
  }, [activities, timeFilter, customRange]);

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
      {!compact && (
        <div className="flex items-center gap-2 pb-2">
          <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="1w">Last Week</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="1m">Last Month</SelectItem>
              <SelectItem value="3m">Last 3 Months</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {timeFilter === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customRange?.from
                    ? customRange.to
                      ? `${format(customRange.from, 'MMM d')} – ${format(customRange.to, 'MMM d')}`
                      : format(customRange.from, 'MMM d, yyyy')
                    : 'Pick dates'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={setCustomRange}
                  numberOfMonths={2}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredActivities.length} of {activities.length}
          </span>
        </div>
      )}
      {(compact ? filteredActivities.slice(0, 5) : filteredActivities).map((activity) => {
        const stageMovement = activity.type === 'stage_change' ? parseStageMovement(activity.description) : null;
        const config = getActivityConfig(activity.type);
        const Icon = config.icon;
        const displayName = getDisplayName(activity.user_email);

        const isEmail = activity.type.startsWith('email_');
        const isExpanded = expandedId === activity.id;

        return (
          <div 
            key={activity.id} 
            className={cn(
              "bg-muted/50 rounded-lg transition-colors",
              compact ? "" : "",
              isEmail && "cursor-pointer hover:bg-muted/80"
            )}
            onClick={isEmail ? () => setExpandedId(isExpanded ? null : activity.id) : undefined}
          >
            <div className={cn(
              "flex items-start gap-2",
              compact ? "p-2" : "p-3"
            )}>
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
                    <span className={isExpanded ? "" : "line-clamp-1"}>{activity.description || config.label}</span>
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
                  {isEmail && !isExpanded && (
                    <span className="text-[10px] ml-1 text-primary">▸ click to read</span>
                  )}
                </div>
              </div>
            </div>

            {isExpanded && isEmail && (
              <div className="px-3 pb-3 border-t border-border/50 mx-3 pt-2">
                <p className="text-xs whitespace-pre-wrap text-foreground">{activity.description}</p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {format(new Date(activity.created_at), 'PPpp')}
                  {activity.user_email && ` · ${activity.user_email}`}
                </p>
              </div>
            )}
          </div>
        );
      })}
      
      {compact && filteredActivities.length > 5 && (
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          +{filteredActivities.length - 5} more activities
        </p>
      )}
      {!compact && filteredActivities.length === 0 && activities.length > 0 && (
        <div className="text-center text-muted-foreground py-6">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No activities in this time range</p>
        </div>
      )}
    </div>
  );
};

export default ActivitiesTab;
