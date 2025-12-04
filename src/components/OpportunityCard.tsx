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
        "cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 group bg-card border-l-4",
        borderClass
      )}
    >
      <CardContent className={cn("p-3", isCollapsed ? "py-2" : "p-4")}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button 
              onClick={handleCollapseClick}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <div className="bg-primary/10 text-primary p-1.5 rounded">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <h3 className="font-bold text-base text-foreground truncate tracking-tight">
              {account?.name || 'Unknown Business'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {opportunity.assigned_to && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {opportunity.assigned_to}
              </span>
            )}
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>
        </div>
        
        {!isCollapsed && (
          <>
            <div className="flex items-center gap-2 mb-3 mt-3 ml-6">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{contactName}</p>
            </div>
            
            <div className="space-y-2 text-xs ml-6">
              {contact?.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {contact?.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{contact.phone}</span>
                </div>
              )}
            </div>

            {/* Assigned To Dropdown */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <Select 
                value={opportunity.assigned_to || 'unassigned'} 
                onValueChange={handleAssignmentChange}
              >
                <SelectTrigger 
                  className="h-8 text-xs bg-background"
                  onClick={(e) => e.stopPropagation()}
                >
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map((member) => (
                    <SelectItem key={member} value={member}>
                      {member}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {opportunity.processing_services && opportunity.processing_services.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1">
                {opportunity.processing_services.map((service) => (
                  <span 
                    key={service}
                    className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"
                  >
                    {service}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OpportunityCard;
