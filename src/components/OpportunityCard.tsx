import { useState, useMemo, useRef } from "react";
import { GripVertical, User, Bell, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Opportunity, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInHours, format } from "date-fns";

interface OpportunityCardProps {
  opportunity: Opportunity;
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onClick: () => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const TEAM_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  'Wesley': { border: 'border-l-team-wesley', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
  'Jamie': { border: 'border-l-team-jamie', bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
  'Darryn': { border: 'border-l-team-darryn', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  'Taryn': { border: 'border-l-team-taryn', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  'Yaseen': { border: 'border-l-team-yaseen', bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  'Sales': { border: 'border-l-team-sales', bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
};

const SLA_COLORS = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-600' },
  red: { dot: 'bg-red-500', text: 'text-red-600' },
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

  const teamColors = opportunity.assigned_to
    ? TEAM_COLORS[opportunity.assigned_to] || { border: 'border-l-primary/50', bg: 'bg-muted', text: 'text-muted-foreground' }
    : { border: 'border-l-muted-foreground/30', bg: 'bg-muted', text: 'text-muted-foreground' };

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const autoSlaStatus = useMemo((): 'green' | 'amber' | 'red' => {
    if (!opportunity.stage_entered_at) return 'green';
    const stageEnteredDate = new Date(opportunity.stage_entered_at);
    const now = new Date();
    const hoursInStage = differenceInHours(now, stageEnteredDate);
    if (hoursInStage >= 24) return 'red';
    if (hoursInStage >= 12) return 'amber';
    return 'green';
  }, [opportunity.stage_entered_at]);

  const effectiveSlaStatus = (opportunity.sla_status as 'green' | 'amber' | 'red' | null) || autoSlaStatus;
  const slaColors = SLA_COLORS[effectiveSlaStatus];

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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card
      draggable
      onDragStart={(e) => {
        dragStartPosRef.current = { x: e.clientX, y: e.clientY };
        isDraggingRef.current = false;
        onDragStart(e, opportunity);
      }}
      onDrag={(e) => {
        if (dragStartPosRef.current && e.clientX !== 0 && e.clientY !== 0) {
          const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
          const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
          if (dx > 5 || dy > 5) {
            isDraggingRef.current = true;
          }
        }
      }}
      onDragEnd={() => {
        dragStartPosRef.current = null;
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 100);
      }}
      onClick={() => {
        if (!isDraggingRef.current) onClick();
      }}
      className={cn(
        'cursor-grab active:cursor-grabbing transition-all duration-200 group',
        'bg-card hover:shadow-lg border border-border/50 rounded-lg overflow-hidden',
        'border-l-4',
        teamColors.border
      )}
    >
      <CardContent className="p-3 space-y-2.5">
        {/* Title Row */}
        <div className="flex items-start gap-2">
          <div className={cn(
            "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center",
            teamColors.bg
          )}>
            <span className={cn("text-[10px] font-bold", teamColors.text)}>
              {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate leading-tight">
              {account?.name || 'Unknown'}
            </h3>
          </div>
          <GripVertical className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0 text-muted-foreground" />
        </div>

        {/* Description/Contact */}
        {!isCollapsed && (
          <>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {contactName !== 'Unknown' ? contactName : 'No contact assigned'}
              {contact?.email && ` • ${contact.email}`}
            </p>

            {/* Footer Row */}
            <div className="flex items-center justify-between pt-1 border-t border-border/30">
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {/* SLA Status */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    >
                      <span className={cn("w-2 h-2 rounded-full", slaColors.dot)} />
                      <span className="capitalize">{effectiveSlaStatus}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-40 p-2"
                    onClick={(e) => e.stopPropagation()}
                    align="start"
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
                          <SelectItem value="auto" className="text-xs">Auto ({autoSlaStatus})</SelectItem>
                          <SelectItem value="green" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Green
                            </span>
                          </SelectItem>
                          <SelectItem value="amber" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              Amber
                            </span>
                          </SelectItem>
                          <SelectItem value="red" className="text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              Red
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Date */}
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(opportunity.created_at), 'MM/dd/yyyy')}</span>
                </div>
              </div>

              {/* Avatar */}
              <Popover>
                <PopoverTrigger asChild>
                  <button onClick={(e) => e.stopPropagation()}>
                    <Avatar className="h-7 w-7 border-2 border-background shadow-sm hover:ring-2 hover:ring-primary/20 transition-all">
                      <AvatarFallback className={cn("text-[10px] font-medium", teamColors.bg, teamColors.text)}>
                        {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : '?'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-40 p-2"
                  onClick={(e) => e.stopPropagation()}
                  align="end"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-medium mb-2">Assigned To</p>
                    <Select
                      value={opportunity.assigned_to || 'unassigned'}
                      onValueChange={handleAssignmentChange}
                    >
                      <SelectTrigger className="h-7 text-xs">
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
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OpportunityCard;
