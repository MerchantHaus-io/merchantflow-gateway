import { useState, useMemo, useRef } from "react";
import { Building2, Phone, Mail, GripVertical, User, ChevronDown, ChevronRight, Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
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

const SLA_BELL_COLORS = {
  green: 'text-emerald-500',
  amber: 'text-amber-500',
  red: 'text-red-500',
};

const OpportunityCard = ({
  opportunity,
  onDragStart,
  onClick,
  onAssignmentChange,
  onSlaStatusChange,
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

  // Use a ref to track dragging state for synchronous access in event handlers
  // This avoids stale closure issues that occur with useState
  const isDraggingRef = useRef(false);

  // Calculate auto SLA status based on time in stage
  const autoSlaStatus = useMemo((): 'green' | 'amber' | 'red' => {
    if (!opportunity.stage_entered_at) return 'green';
    const stageEnteredDate = new Date(opportunity.stage_entered_at);
    const now = new Date();
    const hoursInStage = differenceInHours(now, stageEnteredDate);
    if (hoursInStage >= 24) return 'red';
    if (hoursInStage >= 12) return 'amber';
    return 'green';
  }, [opportunity.stage_entered_at]);

  // Use manual override if set, otherwise use auto-calculated
  const effectiveSlaStatus = (opportunity.sla_status as 'green' | 'amber' | 'red' | null) || autoSlaStatus;

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

  const handleSlaStatusChange = async (value: string) => {
    const newValue = value === 'auto' ? null : value;

    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ sla_status: newValue })
        .eq('id', opportunity.id);

      if (error) throw error;

      onSlaStatusChange?.(opportunity.id, newValue);
      toast.success(newValue ? `SLA set to ${newValue}` : 'SLA set to auto');
    } catch (error) {
      console.error('Error updating SLA status:', error);
      toast.error('Failed to update SLA status');
    }
  };

  const handleCollapseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse?.();
  };

  const bellColorClass = SLA_BELL_COLORS[effectiveSlaStatus];

  return (
    <Card
      draggable
      onDragStart={(e) => {
        isDraggingRef.current = true;
        onDragStart(e, opportunity);
      }}
      onDragEnd={() => {
        // Use setTimeout to ensure the click handler sees the dragging state
        // before we reset it (click fires after dragend)
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 0);
      }}
      onClick={() => {
        // Only trigger click if not in a drag interaction
        if (!isDraggingRef.current) onClick();
      }}
      className={cn(
        'cursor-grab active:cursor-grabbing transition-all duration-200 group border-l-2 overflow-hidden rounded',
        'bg-card shadow-sm hover:shadow-md',
        borderClass
      )}
    >
      {/* Card Header */}
      <div className="px-1.5 py-1 flex items-center gap-1 bg-secondary">
        <button
          onClick={handleCollapseClick}
          className="transition-colors flex-shrink-0 text-secondary-foreground/70 hover:text-secondary-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        <h3 className="font-semibold text-[10px] truncate flex-1 text-secondary-foreground">
          {account?.name || 'Unknown'}
        </h3>
        {/* SLA Bell Icon with Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn('flex-shrink-0 transition-colors hover:opacity-80', bellColorClass)}
              title={`SLA Status: ${effectiveSlaStatus}${opportunity.sla_status ? ' (manual)' : ' (auto)'}`}
            >
              <Bell className="h-3 w-3" fill="currentColor" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-36 p-2"
            onClick={(e) => e.stopPropagation()}
            align="end"
          >
            <div className="space-y-1">
              <p className="text-xs font-medium mb-2">SLA Status</p>
              <Select
                value={opportunity.sla_status || 'auto'}
                onValueChange={handleSlaStatusChange}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">
                    <span className="flex items-center gap-2">
                      Auto ({autoSlaStatus})
                    </span>
                  </SelectItem>
                  <SelectItem value="green" className="text-xs">
                    <span className="flex items-center gap-2">
                      <Bell className="h-3 w-3 text-emerald-500" fill="currentColor" />
                      Green
                    </span>
                  </SelectItem>
                  <SelectItem value="amber" className="text-xs">
                    <span className="flex items-center gap-2">
                      <Bell className="h-3 w-3 text-amber-500" fill="currentColor" />
                      Amber
                    </span>
                  </SelectItem>
                  <SelectItem value="red" className="text-xs">
                    <span className="flex items-center gap-2">
                      <Bell className="h-3 w-3 text-red-500" fill="currentColor" />
                      Red
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
        <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-secondary-foreground/50" />
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