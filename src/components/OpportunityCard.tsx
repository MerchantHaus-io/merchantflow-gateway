import { useState, useMemo } from "react";
import { Building2, Phone, Mail, GripVertical, User, ChevronDown, ChevronRight, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Opportunity, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInHours } from "date-fns";

interface OpportunityCardProps {
  opportunity: Opportunity;
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onClick: () => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const TEAM_BORDER_COLORS: Record<string, string> = {
  'Wesley': 'border-l-team-wesley',
  'Jamie': 'border-l-team-jamie',
  'Darryn': 'border-l-team-darryn',
  'Taryn': 'border-l-team-taryn',
  'Yaseen': 'border-l-team-yaseen',
  'Sales': 'border-l-team-sales',
};

// Header background colors for SLA states
// SLA colors (warning/critical) take precedence over theme
const HEADER_STYLES = {
  // Normal: theme-aware - dark in dark mode, light gray in light mode
  normal: 'bg-secondary dark:bg-secondary',
  // SLA Warning (12h): Amber - always takes precedence
  warning: 'bg-amber-500',
  // SLA Critical (24h): Red - always takes precedence
  critical: 'bg-red-600',
};

// Text colors for headers based on background
const HEADER_TEXT_STYLES = {
  normal: 'text-secondary-foreground',
  warning: 'text-white', // White text on amber for readability
  critical: 'text-white', // White text on red for readability
};

const OpportunityCard = ({
  opportunity,
  onDragStart,
  onClick,
  onAssignmentChange,
  isCollapsed = false,
  onToggleCollapse
}: OpportunityCardProps) => {
  const account = opportunity.account;
  const contact = opportunity.contact;
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
    : 'Unknown';

  const borderClass = opportunity.assigned_to
    ? TEAM_BORDER_COLORS[opportunity.assigned_to] || 'border-l-primary/50'
    : 'border-l-muted-foreground/30';

  // SLA status: tiered alerts at 12h (warning) and 24h (critical)
  const slaStatus = useMemo((): 'none' | 'warning' | 'critical' => {
    if (!opportunity.stage_entered_at) return 'none';
    const stageEnteredDate = new Date(opportunity.stage_entered_at);
    const now = new Date();
    const hoursInStage = differenceInHours(now, stageEnteredDate);
    console.log(`SLA Check: ${account?.name} - ${hoursInStage}h in stage (entered: ${opportunity.stage_entered_at})`);
    if (hoursInStage >= 24) return 'critical';
    if (hoursInStage >= 12) return 'warning';
    return 'none';
  }, [opportunity.stage_entered_at, account?.name]);

  const handleAssignmentChange = async (value: string) => {
    const newValue = value === 'unassigned' ? null : value;

    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ assigned_to: newValue })
        .eq('id', opportunity.id);

      if (error) throw error;

      onAssignmentChange?.(opportunity.id, newValue);
      toast.success(newValue ? `Assigned to ${newValue}` : 'Unassigned');
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to update assignment');
    }
  };

  const handleCollapseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse?.();
  };

  // Determine header style based on SLA status (SLA colors always take precedence)
  const headerBgClass = slaStatus === 'critical'
    ? HEADER_STYLES.critical
    : slaStatus === 'warning'
      ? HEADER_STYLES.warning
      : HEADER_STYLES.normal;

  // Determine text style based on SLA status
  const headerTextClass = slaStatus === 'critical'
    ? HEADER_TEXT_STYLES.critical
    : slaStatus === 'warning'
      ? HEADER_TEXT_STYLES.warning
      : HEADER_TEXT_STYLES.normal;

  // Button/icon colors for header (needs to be visible on both theme backgrounds and SLA backgrounds)
  const headerIconClass = slaStatus !== 'none'
    ? 'text-white/70 hover:text-white'
    : 'text-secondary-foreground/70 hover:text-secondary-foreground';

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, opportunity)}
      onClick={onClick}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all duration-200 group border-l-2 overflow-hidden rounded",
        "bg-card shadow-sm hover:shadow-md",
        borderClass
      )}
    >
      {/* Card Header - SLA colors take precedence over theme */}
      <div className={cn(
        "px-1.5 py-1 flex items-center gap-1",
        headerBgClass
      )}>
        <button
          onClick={handleCollapseClick}
          className={cn("transition-colors flex-shrink-0", headerIconClass)}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        <h3 className={cn("font-semibold text-[10px] truncate flex-1", headerTextClass)}>
          {account?.name || 'Unknown'}
        </h3>
        {/* SLA indicator icons */}
        {slaStatus === 'warning' && (
          <span className="flex items-center text-white/90 flex-shrink-0" title="In stage > 12 hours">
            <Clock className="h-3 w-3" />
          </span>
        )}
        {slaStatus === 'critical' && (
          <span className="flex items-center text-white/90 flex-shrink-0" title="In stage > 24 hours - SLA breached">
            <Clock className="h-3 w-3" />
          </span>
        )}
        <GripVertical className={cn(
          "h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
          slaStatus !== 'none' ? "text-white/50" : "text-secondary-foreground/50"
        )} />
      </div>

      {/* Card Content - compact for pipeline view */}
      {!isCollapsed && (
        <CardContent className="p-1.5 bg-card">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-card-foreground">
              <User className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate">{contactName}</span>
            </div>

            {contact?.email && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Mail className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}

            {contact?.phone && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(contact.phone!);
                    toast.success('Phone number copied to clipboard');
                  }}
                  className="truncate hover:text-teal transition-colors cursor-pointer underline-offset-2 hover:underline"
                >
                  {contact.phone}
                </button>
              </div>
            )}

            <div className="pt-1 border-t border-border/30">
              <Select
                value={opportunity.assigned_to || 'unassigned'}
                onValueChange={handleAssignmentChange}
              >
                <SelectTrigger
                  className="h-5 text-[9px] bg-background/50 border-border/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectValue placeholder="Assign..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map((member) => (
                    <SelectItem key={member} value={member} className="text-xs">
                      {member}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default OpportunityCard;
