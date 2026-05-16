import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Opportunity, OutcomeStatus, OUTCOME_CONFIG } from "@/types/opportunity";
import { OUTCOME_REASONS, OUTCOME_STATUS_LABELS, EMAIL_TRIGGERING_OUTCOMES } from "@/config/outcomeReasons";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Trophy, XCircle, Ban, AlertTriangle, ShieldX, Clock, Mail, MailWarning, CalendarClock } from "lucide-react";

const OUTCOME_ICONS: Record<string, React.ReactNode> = {
  closed_won: <Trophy className="h-4 w-4" />,
  closed_lost: <XCircle className="h-4 w-4" />,
  disqualified: <Ban className="h-4 w-4" />,
  no_decision: <AlertTriangle className="h-4 w-4" />,
  underwriting_declined: <ShieldX className="h-4 w-4" />,
};

interface OutcomeDisplaySectionProps {
  opportunity: Opportunity;
}

export const OutcomeDisplaySection = ({ opportunity }: OutcomeDisplaySectionProps) => {
  const [emailActivity, setEmailActivity] = useState<{ type: string; created_at: string } | null>(null);
  const [taskActivity, setTaskActivity] = useState<{ description: string | null; due_at: string | null; assigned_to: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const outcomeStatus = opportunity.outcome_status as OutcomeStatus;
  const cfg = OUTCOME_CONFIG[outcomeStatus];
  const isEmailTriggering = EMAIL_TRIGGERING_OUTCOMES.includes(outcomeStatus);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);

      // Fetch email status for email-triggering outcomes
      if (isEmailTriggering) {
        const { data: emailData } = await supabase
          .from('activities')
          .select('type, created_at')
          .eq('opportunity_id', opportunity.id)
          .in('type', ['email_sent', 'email_failed'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (emailData && emailData.length > 0) {
          setEmailActivity(emailData[0]);
        }
      }

      // Fetch re-engagement task
      const { data: taskData } = await supabase
        .from('activities')
        .select('description, due_at, assigned_to')
        .eq('opportunity_id', opportunity.id)
        .eq('type', 'task_scheduled')
        .limit(1);
      if (taskData && taskData.length > 0) {
        setTaskActivity(taskData[0] as unknown);
      }

      setLoading(false);
    };

    fetchActivities();
  }, [opportunity.id, isEmailTriggering]);

  const reasonLabel = OUTCOME_REASONS[outcomeStatus]
    ?.find(r => r.value === opportunity.outcome_reason)?.label
    ?? opportunity.outcome_reason;

  const closedAtFormatted = opportunity.outcome_closed_at
    ? format(new Date(opportunity.outcome_closed_at), "d MMM yyyy 'at' HH:mm")
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <span>{cfg?.icon}</span> Outcome
      </h3>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("gap-1.5 text-sm font-semibold border", cfg?.bgClass, cfg?.textClass)}>
          {OUTCOME_ICONS[outcomeStatus]}
          {OUTCOME_STATUS_LABELS[outcomeStatus] ?? outcomeStatus}
        </Badge>
      </div>

      {/* Reason */}
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Reason</p>
        <p className="text-sm">{reasonLabel}</p>
      </div>

      {/* Notes */}
      {opportunity.outcome_notes && (
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
          <p className="text-sm text-muted-foreground">{opportunity.outcome_notes}</p>
        </div>
      )}

      {/* Closed at / by */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {closedAtFormatted && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {closedAtFormatted}
          </span>
        )}
        {opportunity.outcome_closed_by && (
          <span>by {opportunity.outcome_closed_by}</span>
        )}
      </div>

      {/* Email status */}
      {isEmailTriggering && (
        <div className="pt-1 border-t border-border">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading email status...</p>
          ) : emailActivity?.type === 'email_sent' ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <Mail className="h-3.5 w-3.5" />
              ✓ Compliance notification sent {format(new Date(emailActivity.created_at), "d MMM yyyy")}
            </p>
          ) : emailActivity?.type === 'email_failed' ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-bold">
              <MailWarning className="h-3.5 w-3.5" />
              ⚠ Compliance email failed — manual follow-up required
            </p>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Compliance email pending...
            </p>
          )}
        </div>
      )}

      {/* Re-engagement task */}
      {!loading && taskActivity && (
        <div className="pt-1 border-t border-border space-y-0.5">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            Re-engagement task: {taskActivity.description}
          </p>
          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            {taskActivity.due_at && (
              <span>Due: {format(new Date(taskActivity.due_at), "d MMM yyyy")}</span>
            )}
            {taskActivity.assigned_to && (
              <span>Assigned to: {taskActivity.assigned_to}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
