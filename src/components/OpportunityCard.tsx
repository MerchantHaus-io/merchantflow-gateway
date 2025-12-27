import { useState, useRef, useEffect } from "react";
import { GripVertical, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Opportunity, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

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
        'bg-card hover:shadow-lg border border-border/50 rounded-md landscape:rounded overflow-hidden',
        'border-l-2 landscape:border-l-2',
        teamColors.border
      )}
    >
      <CardContent className="p-1.5 landscape:p-1 space-y-0.5 landscape:space-y-0">
        {/* Account Name */}
        <div className="flex items-start justify-between gap-0.5">
          <h3 className="font-semibold text-[10px] landscape:text-[9px] text-foreground truncate leading-tight flex-1">
            {account?.name || 'Unknown'}
          </h3>
          <GripVertical className="h-2.5 w-2.5 landscape:h-2 landscape:w-2 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0 text-muted-foreground" />
        </div>

        {/* Contact Last Name */}
        <p className="text-[9px] landscape:text-[8px] text-muted-foreground truncate">
          {contactLastName || 'No contact'}
        </p>

        {/* Footer: Date + SLA + Assignment Avatar */}
        <div className="flex items-center justify-between pt-0.5 landscape:pt-0 border-t border-border/30">
          {/* Date Created + SLA Dot */}
          <div className="flex items-center gap-1 text-[9px] landscape:text-[8px] text-muted-foreground">
            <Calendar className="h-2 w-2 landscape:h-1.5 landscape:w-1.5" />
            <span>{format(new Date(opportunity.created_at), 'MM/dd')}</span>
            {/* SLA Status Dot */}
            <span 
              className={cn(
                "h-1.5 w-1.5 landscape:h-1 landscape:w-1 rounded-full flex-shrink-0",
                opportunity.sla_status === 'red' && "bg-red-500",
                opportunity.sla_status === 'amber' && "bg-amber-500",
                opportunity.sla_status === 'green' && "bg-green-500",
                !opportunity.sla_status && "bg-green-500" // Default to green
              )}
              title={`SLA: ${opportunity.sla_status || 'green'}`}
            />
          </div>

          {/* Assignment Avatar with Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <button onClick={(e) => e.stopPropagation()}>
                <Avatar className="h-5 w-5 landscape:h-4 landscape:w-4 border border-background shadow-sm hover:ring-1 hover:ring-primary/20 transition-all">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={opportunity.assigned_to || 'Unassigned'} />
                  )}
                  <AvatarFallback className={cn("text-[8px] landscape:text-[7px] font-medium", teamColors.bg, teamColors.text)}>
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
      </CardContent>
    </Card>
  );
};

export default OpportunityCard;
