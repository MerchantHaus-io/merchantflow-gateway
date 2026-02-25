import { useState, useRef, useEffect, useMemo } from "react";
import { GripVertical, Calendar, CreditCard, Zap, AlertTriangle, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Wesley: { border: "border-l-team-wesley", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
  Jamie: { border: "border-l-team-jamie", bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  Darryn: { border: "border-l-team-darryn", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  Taryn: { border: "border-l-team-taryn", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  Yaseen: { border: "border-l-team-yaseen", bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
  Sales: { border: "border-l-team-sales", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
};

const TEAM_EMAIL_MAP: Record<string, string> = {
  Wesley: "dylan@merchanthaus.io",
  Jamie: "admin@merchanthaus.io",
  Darryn: "darryn@merchanthaus.io",
  Taryn: "taryn@merchanthaus.io",
  Yaseen: "support@merchanthaus.io",
  Sales: "sales@merchanthaus.io",
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
  const contactLastName = contact?.last_name || "";

  const teamColors = opportunity.assigned_to
    ? TEAM_COLORS[opportunity.assigned_to] || { border: "border-l-primary/50", bg: "bg-muted", text: "text-muted-foreground" }
    : { border: "border-l-muted-foreground/30", bg: "bg-muted", text: "text-muted-foreground" };

  const isLive = opportunity.stage === "live_activated";
  const serviceType = getServiceType(opportunity);

  const wizardProgress = opportunity.wizard_state?.progress ?? 0;
  const progressBg = useMemo(() => {
    if (isLive) return "";
    if (wizardProgress >= 75) return "bg-green-500/8 dark:bg-green-500/12";
    if (wizardProgress >= 40) return "bg-amber-500/8 dark:bg-amber-500/12";
    return "bg-red-500/8 dark:bg-red-500/12";
  }, [wizardProgress, isLive]);

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const slaInfo = useMemo(() => {
    if (isLive) return { status: "green" as const, hours: 0, days: 0, label: "Live", hidden: true };
    const stageEnteredAt = opportunity.stage_entered_at
      ? new Date(opportunity.stage_entered_at)
      : new Date(opportunity.created_at);
    const hoursInStage = differenceInHours(new Date(), stageEnteredAt);
    const daysInStage = differenceInDays(new Date(), stageEnteredAt);

    if (opportunity.sla_status) {
      return {
        status: opportunity.sla_status as "green" | "amber" | "red",
        hours: hoursInStage,
        days: daysInStage,
        label: opportunity.sla_status === "red" ? "Overdue" : opportunity.sla_status === "amber" ? "At Risk" : "On Track",
        hidden: false,
      };
    }

    if (hoursInStage >= 48) return { status: "red" as const, hours: hoursInStage, days: daysInStage, label: "Overdue", hidden: false };
    if (hoursInStage >= 24) return { status: "amber" as const, hours: hoursInStage, days: daysInStage, label: "At Risk", hidden: false };
    return { status: "green" as const, hours: hoursInStage, days: daysInStage, label: "On Track", hidden: false };
  }, [opportunity.stage_entered_at, opportunity.created_at, opportunity.sla_status, isLive]);

  useEffect(() => {
    const fetchAvatar = async () => {
      if (!opportunity.assigned_to) { setAvatarUrl(null); return; }
      const email = TEAM_EMAIL_MAP[opportunity.assigned_to];
      if (!email) { setAvatarUrl(null); return; }
      const { data } = await supabase.from("profiles").select("avatar_url").eq("email", email).single();
      setAvatarUrl(data?.avatar_url || null);
    };
    fetchAvatar();
  }, [opportunity.assigned_to]);

  const handleAssignmentChange = async (value: string) => {
    const newValue = value === "unassigned" ? null : value;
    try {
      const updateData: Record<string, unknown> = { assigned_to: newValue };
      if (opportunity.status === "dead" && newValue) {
        updateData.status = "active";
        const validActiveStages = [
          "application_started", "discovery", "qualified", "application_prep",
          "underwriting_review", "processor_approval", "integration_setup",
          "gateway_submitted", "live_activated",
        ];
        if (!validActiveStages.includes(opportunity.stage)) updateData.stage = "application_started";
      }
      const { error } = await supabase.from("opportunities").update(updateData).eq("id", opportunity.id);
      if (error) throw error;
      onAssignmentChange?.(opportunity.id, newValue);
      if (opportunity.status === "dead" && newValue) {
        toast.success(`Assigned to ${newValue} and reactivated`);
      } else {
        toast.success(newValue ? `Assigned to ${newValue}` : "Unassigned");
      }
    } catch (error) {
      console.error("Error updating assignment:", error);
      toast.error("Failed to update assignment");
    }
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
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
          if (dx > 5 || dy > 5) isDraggingRef.current = true;
        }
      }}
      onDragEnd={() => {
        dragStartPosRef.current = null;
        setTimeout(() => { isDraggingRef.current = false; }, 100);
      }}
      onTouchStart={(e) => {
        if (onTouchDragStart && cardRef.current) onTouchDragStart(e, opportunity, cardRef.current);
      }}
      onTouchMove={onTouchDragMove}
      onTouchEnd={onTouchDragEnd}
      onClick={() => { if (!isDraggingRef.current) onClick(); }}
      className={cn(
        // Neo-brutalist card: hard edges, bold borders, offset shadow
        "cursor-grab active:cursor-grabbing group touch-manipulation transition-all duration-150",
        "border-2 border-foreground/60 hover:border-foreground",
        "hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_hsl(var(--primary))]",
        "active:translate-y-0 active:shadow-none",
        isLive
          ? "bg-gradient-to-br from-amber-50 via-yellow-50/80 to-amber-100/60 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-amber-900/20 border-amber-500/80"
          : cn("bg-card border-l-[4px]", teamColors.border, progressBg)
      )}
    >
      <div
        className={cn(
          "p-2 md:p-2.5 space-y-1",
          isCollapsed && "py-1"
        )}
      >
        {/* Account Name + Service Type */}
        <div className="flex items-center justify-between gap-1">
          <h3 className="font-black text-[10px] md:text-xs lg:text-sm text-foreground truncate leading-tight flex-1">
            {account?.name || "Unknown"}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isCollapsed && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[9px] md:text-[10px] font-bold px-1 py-0.5 border",
                  serviceType === "gateway_only"
                    ? "text-teal-600 dark:text-teal-400 border-teal-500/40 bg-teal-500/10"
                    : "text-primary border-primary/40 bg-primary/10"
                )}
              >
                {serviceType === "gateway_only" ? (
                  <><Zap className="h-2.5 w-2.5" /><span className="hidden sm:inline">GW</span></>
                ) : (
                  <><CreditCard className="h-2.5 w-2.5" /><span className="hidden sm:inline">CC</span></>
                )}
              </span>
            )}
            <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity text-muted-foreground" />
          </div>
        </div>

        {/* Contact */}
        {!isCollapsed && (
          <p className="text-[9px] md:text-[11px] text-muted-foreground truncate font-medium">
            {contactLastName || "No contact"}
          </p>
        )}

        {/* Footer */}
        {!isCollapsed && (
          <div className="flex items-center justify-between pt-1 border-t border-foreground/10">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[9px] md:text-[10px] text-muted-foreground">
                    <Calendar className="h-2.5 w-2.5" />
                    <span className="font-medium">{format(new Date(opportunity.created_at), "MM/dd")}</span>
                    {!slaInfo.hidden && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold border",
                          slaInfo.status === "red" && "bg-red-500/15 text-red-500 border-red-500/30",
                          slaInfo.status === "amber" && "bg-amber-500/15 text-amber-500 border-amber-500/30",
                          slaInfo.status === "green" && "bg-green-500/15 text-green-500 border-green-500/30"
                        )}
                      >
                        {slaInfo.status === "red" && <AlertTriangle className="h-2 w-2" />}
                        {slaInfo.status === "amber" && <Clock className="h-2 w-2" />}
                        {slaInfo.days > 0 ? `${slaInfo.days}d` : `${slaInfo.hours}h`}
                      </span>
                    )}
                    {isLive && (
                      <span className="px-1 py-0.5 text-[8px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                        ✦ LIVE
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-bold">{slaInfo.label}</p>
                  <p className="text-muted-foreground">
                    {slaInfo.days > 0
                      ? `${slaInfo.days} day${slaInfo.days !== 1 ? "s" : ""} in stage`
                      : `${slaInfo.hours} hour${slaInfo.hours !== 1 ? "s" : ""} in stage`}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Assignment Avatar */}
            <Popover>
              <PopoverTrigger asChild>
                <button onClick={(e) => e.stopPropagation()}>
                  <Avatar className="h-5 w-5 md:h-6 md:w-6 border-2 border-foreground/40 hover:border-primary transition-colors">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={opportunity.assigned_to || "Unassigned"} />}
                    <AvatarFallback className={cn("text-[8px] font-black", teamColors.bg, teamColors.text)}>
                      {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : "?"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-2 bg-popover z-50 border-2 border-foreground/40" onClick={(e) => e.stopPropagation()} align="end">
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-wider mb-2">Assign</p>
                  <Select value={opportunity.assigned_to || "unassigned"} onValueChange={handleAssignmentChange}>
                    <SelectTrigger className="h-7 text-xs border-2 border-foreground/30">
                      <SelectValue placeholder="Assign..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                      {TEAM_MEMBERS.map((member) => (
                        <SelectItem key={member} value={member} className="text-xs">{member}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
};

export default OpportunityCard;
