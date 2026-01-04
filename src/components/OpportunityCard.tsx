import { useState, useRef, useEffect, useMemo } from "react";
import { GripVertical, Calendar, CreditCard, Zap, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Opportunity, TEAM_MEMBERS, getServiceType } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, differenceInHours, differenceInDays } from "date-fns";

interface OpportunityCardProps {
  opportunity: Opportunity;
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onClick: () => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
}

const TEAM_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  'Wesley': { border: 'border-l-team-wesley', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
  'Jamie': { border: 'border-l-team-jamie', bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
  'Darryn': { border: 'border-l-team-darryn', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  'Taryn': { border: 'border-l-team-taryn', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  'Yaseen': { border: 'border-l-team-yaseen', bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  'Sales': { border: 'border-l-team-sales', bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
};

// Map team member names to their profile emails for avatar lookup
const TEAM_EMAIL_MAP: Record<string, string> = {
  'Wesley': 'dylan@merchanthaus.io',
  'Jamie': 'admin@merchanthaus.io',
  'Darryn': 'darryn@merchanthaus.io',
  'Taryn': 'taryn@merchanthaus.io',
  'Yaseen': 'support@merchanthaus.io',
  'Sales': 'sales@merchanthaus.io',
};

const OpportunityCard = ({
  opportunity,
  onDragStart,
  onClick,
  onAssignmentChange,
  isCollapsed = false,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
}: OpportunityCardProps) => {
  const account = opportunity.account;
  const contact = opportunity.contact;
  const contactLastName = contact?.last_name || '';

  const teamColors = opportunity.assigned_to
    ? TEAM_COLORS[opportunity.assigned_to] || { border: 'border-l-primary/50', bg: 'bg-muted', text: 'text-muted-foreground' }
    : { border: 'border-l-muted-foreground/30', bg: 'bg-muted', text: 'text-muted-foreground' };

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Calculate SLA status based on time in stage
  const slaInfo = useMemo(() => {
    const stageEnteredAt = opportunity.stage_entered_at 
      ? new Date(opportunity.stage_entered_at) 
      : new Date(opportunity.created_at);
    const hoursInStage = differenceInHours(new Date(), stageEnteredAt);
    const daysInStage = differenceInDays(new Date(), stageEnteredAt);
    
    // Use explicit sla_status if set, otherwise calculate
    if (opportunity.sla_status) {
      return {
        status: opportunity.sla_status as 'green' | 'amber' | 'red',
        hours: hoursInStage,
        days: daysInStage,
        label: opportunity.sla_status === 'red' ? 'Overdue' 
             : opportunity.sla_status === 'amber' ? 'At Risk' 
             : 'On Track'
      };
    }
    
    // Auto-calculate SLA based on hours in stage
    // Green: < 24h, Amber: 24-48h, Red: > 48h
    if (hoursInStage >= 48) {
      return { status: 'red' as const, hours: hoursInStage, days: daysInStage, label: 'Overdue' };
    } else if (hoursInStage >= 24) {
      return { status: 'amber' as const, hours: hoursInStage, days: daysInStage, label: 'At Risk' };
    }
    return { status: 'green' as const, hours: hoursInStage, days: daysInStage, label: 'On Track' };
  }, [opportunity.stage_entered_at, opportunity.created_at, opportunity.sla_status]);


  // Fetch profile avatar for assigned team member
  useEffect(() => {
    const fetchAvatar = async () => {
      if (!opportunity.assigned_to) {
        setAvatarUrl(null);
        return;
      }
      
      const email = TEAM_EMAIL_MAP[opportunity.assigned_to];
      if (!email) {
        setAvatarUrl(null);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('email', email)
        .single();
      
      setAvatarUrl(data?.avatar_url || null);
    };

    fetchAvatar();
  }, [opportunity.assigned_to]);

  const handleAssignmentChange = async (value: string) => {
    const newValue = value === 'unassigned' ? null : value;
    try {
      // Build update object - if opportunity is archived (dead), reactivate it
      const updateData: Record<string, unknown> = { assigned_to: newValue };
      
      if (opportunity.status === 'dead' && newValue) {
        // Reactivate archived opportunity and move to appropriate stage
        updateData.status = 'active';
        // Keep current stage if it's a valid active stage, otherwise reset to application_started
        const validActiveStages = ['application_started', 'discovery', 'qualified', 'application_prep', 
          'underwriting_review', 'processor_approval', 'integration_setup', 'gateway_submitted', 'live_activated'];
        if (!validActiveStages.includes(opportunity.stage)) {
          updateData.stage = 'application_started';
        }
      }
      
      const { error } = await supabase
        .from('opportunities')
        .update(updateData)
        .eq('id', opportunity.id);
      if (error) throw error;
      
      onAssignmentChange?.(opportunity.id, newValue);
      
      if (opportunity.status === 'dead' && newValue) {
        toast.success(`Assigned to ${newValue} and reactivated from archive`);
      } else {
        toast.success(newValue ? `Assigned to ${newValue}` : 'Unassigned');
      }
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to update assignment');
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <Card
      ref={cardRef}
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
      onTouchStart={(e) => {
        if (onTouchDragStart && cardRef.current) {
          onTouchDragStart(e, opportunity, cardRef.current);
        }
      }}
      onTouchMove={onTouchDragMove}
      onTouchEnd={onTouchDragEnd}
      onClick={() => {
        if (!isDraggingRef.current) onClick();
      }}
      className={cn(
        'cursor-grab active:cursor-grabbing transition-all duration-200 group touch-manipulation',
        'bg-card hover:shadow-lg border border-border/50 rounded-md overflow-hidden',
        'border-l-2',
        teamColors.border
      )}
    >
      <CardContent className={cn(
        "p-1.5 space-y-0.5",
        "landscape:p-1.5 landscape:space-y-0.5",
        isCollapsed && "py-0.5"
      )}>
        {/* Account Name + Pipeline Type */}
        <div className="flex items-start justify-between gap-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <h3 className="font-semibold text-[10px] landscape:text-[10px] text-foreground truncate leading-tight">
              {account?.name || 'Unknown'}
            </h3>
            {!isCollapsed && (
              <span className={cn(
                "flex items-center gap-0.5 text-[10px] landscape:text-[10px] font-semibold flex-shrink-0",
                getServiceType(opportunity) === 'gateway_only' 
                  ? "text-teal-600 dark:text-teal-400" 
                  : "text-primary"
              )}>
                {getServiceType(opportunity) === 'gateway_only' ? (
                  <>
                    <Zap className="h-2.5 w-2.5 landscape:h-2.5 landscape:w-2.5" />
                    <span className="hidden sm:inline landscape:hidden">Gateway</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="h-2.5 w-2.5 landscape:h-2.5 landscape:w-2.5" />
                    <span className="hidden sm:inline landscape:hidden">Processing</span>
                  </>
                )}
              </span>
            )}
          </div>
          <GripVertical className="h-2.5 w-2.5 landscape:h-2.5 landscape:w-2.5 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0 text-muted-foreground" />
        </div>

        {/* Contact Last Name - hidden when collapsed */}
        {!isCollapsed && (
          <p className="text-[9px] landscape:text-[9px] text-muted-foreground truncate">
            {contactLastName || 'No contact'}
          </p>
        )}

        {/* Footer: Date + SLA + Assignment Avatar - hidden when collapsed */}
        {!isCollapsed && (
          <div className="flex items-center justify-between pt-0.5 border-t border-border/30">
            {/* Date Created + SLA Indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[9px] landscape:text-[9px] text-muted-foreground">
                    <Calendar className="h-2 w-2 landscape:h-2 landscape:w-2" />
                    <span>{format(new Date(opportunity.created_at), 'MM/dd')}</span>
                    {/* Enhanced SLA Status Indicator */}
                    <span 
                      className={cn(
                        "flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] landscape:text-[8px] font-medium",
                        slaInfo.status === 'red' && "bg-red-500/20 text-red-500",
                        slaInfo.status === 'amber' && "bg-amber-500/20 text-amber-500",
                        slaInfo.status === 'green' && "bg-green-500/20 text-green-500"
                      )}
                    >
                      {slaInfo.status === 'red' && <AlertTriangle className="h-2 w-2" />}
                      {slaInfo.status === 'amber' && <Clock className="h-2 w-2" />}
                      {slaInfo.days > 0 ? `${slaInfo.days}d` : `${slaInfo.hours}h`}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{slaInfo.label}</p>
                  <p className="text-muted-foreground">
                    {slaInfo.days > 0 
                      ? `${slaInfo.days} day${slaInfo.days !== 1 ? 's' : ''} in stage`
                      : `${slaInfo.hours} hour${slaInfo.hours !== 1 ? 's' : ''} in stage`
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Assignment Avatar with Dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <button onClick={(e) => e.stopPropagation()}>
                  <Avatar className="h-5 w-5 landscape:h-5 landscape:w-5 border border-background shadow-sm hover:ring-1 hover:ring-primary/20 transition-all">
                    {avatarUrl && (
                      <AvatarImage src={avatarUrl} alt={opportunity.assigned_to || 'Unassigned'} />
                    )}
                    <AvatarFallback className={cn("text-[8px] landscape:text-[8px] font-medium", teamColors.bg, teamColors.text)}>
                      {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : '?'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-36 p-2 bg-popover z-50"
                onClick={(e) => e.stopPropagation()}
                align="end"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium mb-2">Assign To</p>
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
        )}
      </CardContent>
    </Card>
  );
};

export default OpportunityCard;
