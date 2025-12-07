import { useState } from "react";
import { Building2, Phone, Mail, GripVertical, User, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Opportunity, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  'Leo': 'border-l-team-leo',
  'Jamie': 'border-l-team-jamie',
  'Darryn': 'border-l-team-darryn',
  'Taryn': 'border-l-team-taryn',
  'Yaseen': 'border-l-team-yaseen',
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

  return (
    <Card 
      draggable
      onDragStart={(e) => onDragStart(e, opportunity)}
      onClick={onClick}
      className={cn(
        "cursor-grab active:cursor-grabbing hover:shadow-sm transition-all duration-200 group bg-card border-l-3",
        borderClass
      )}
    >
      <CardContent className={cn("p-2", isCollapsed ? "py-1.5" : "p-2")}>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={handleCollapseClick}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          <h3 className="font-semibold text-xs text-foreground truncate flex-1">
            {account?.name || 'Unknown'}
          </h3>
          {opportunity.assigned_to && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
              {opportunity.assigned_to}
            </span>
          )}
          <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
        
        {!isCollapsed && (
          <div className="mt-2 ml-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{contactName}</span>
            </div>
            
            {contact?.email && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            
            {contact?.phone && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{contact.phone}</span>
              </div>
            )}

            <div className="pt-1.5 border-t border-border/50">
              <Select 
                value={opportunity.assigned_to || 'unassigned'} 
                onValueChange={handleAssignmentChange}
              >
                <SelectTrigger 
                  className="h-6 text-[10px] bg-background"
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
            
            {opportunity.processing_services && opportunity.processing_services.length > 0 && (
              <div className="flex flex-wrap gap-0.5 pt-1">
                {opportunity.processing_services.map((service) => (
                  <span 
                    key={service}
                    className="text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded"
                  >
                    {service}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OpportunityCard;
