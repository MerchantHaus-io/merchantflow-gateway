import { Building2, Phone, Mail, GripVertical, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Opportunity, TEAM_MEMBERS, TeamMember } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OpportunityCardProps {
  opportunity: Opportunity;
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onClick: () => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
}

const TEAM_BORDER_COLORS: Record<string, string> = {
  'Wesley': 'border-l-team-wesley',
  'Leo': 'border-l-team-leo',
  'Jamie': 'border-l-team-jamie',
  'Darryn': 'border-l-team-darryn',
  'Taryn': 'border-l-team-taryn',
  'Yaseen': 'border-l-team-yaseen',
};

const OpportunityCard = ({ opportunity, onDragStart, onClick, onAssignmentChange }: OpportunityCardProps) => {
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
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-1.5 rounded">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground line-clamp-1">
              {account?.name || 'Unknown Business'}
            </h3>
          </div>
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{contactName}</p>
        </div>
        
        <div className="space-y-2 text-xs">
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
      </CardContent>
    </Card>
  );
};

export default OpportunityCard;
