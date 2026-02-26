import { useState, useRef, useEffect, useMemo } from "react";
import { GripVertical, Calendar, CreditCard, Zap, AlertTriangle, Clock, Trash2, User } from "lucide-react";
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
  onDragEnd?: () => void;
  onClick: () => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  currentUser?: string;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const OpportunityCard = ({
  opportunity,
  onDragStart,
  onDragEnd,
  onClick,
  onAssignmentChange,
  isCollapsed = false,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  currentUser,
}: OpportunityCardProps) => {
  const account = opportunity.account;
  const contact = opportunity.contact;
  const contactName = contact?.last_name || contact?.first_name || "";

  const teamColors = opportunity.assigned_to
    ? TEAM_COLORS[opportunity.assigned_to] || { border: "border-l-primary/50", bg: "bg-muted", text: "text-muted-foreground" }
    : { border: "border-l-muted-foreground/30", bg: "bg-muted", text: "text-muted-foreground" };

  const isLive = opportunity.stage === "live_activated";
  const serviceType = getServiceType(opportunity);

  // Deal value from wizard_state monthly_volume
  const dealValue = useMemo(() => {
    const formState = opportunity.wizard_state?.form_state as Record<string, string> | undefined;
    if (formState?.monthly_volume) {
      const val = parseFloat(formState.monthly_volume.replace(/[^0-9.]/g, ""));
      if (!isNaN(val)) return val;
    }
    return 0;
  }, [opportunity.wizard_state]);

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Priority mapping from SLA status: red → HIGH, amber → MEDIUM, green → LOW
  const slaInfo = useMemo(() => {
    if (isLive) return { status: "green" as const, hours: 0, days: 0, label: "Live", priority: null, hidden: true };
    const stageEnteredAt = opportunity.stage_entered_at
      ? new Date(opportunity.stage_entered_at)
      : new Date(opportunity.created_at);
    const hoursInStage = differenceInHours(new Date(), stageEnteredAt);
    const daysInStage = differenceInDays(new Date(), stageEnteredAt);

    if (opportunity.sla_status) {
      const priorityMap = { red: "HIGH", amber: "MEDIUM", green: "LOW" } as const;
      return {
        status: opportunity.sla_status as "green" | "amber" | "red",
        hours: hoursInStage,
        days: daysInStage,
        label: opportunity.sla_status === "red" ? "Overdue" : opportunity.sla_status === "amber" ? "At Risk" : "On Track",
        priority: priorityMap[opportunity.sla_status as keyof typeof priorityMap] || null,
        hidden: false,
      };
    }

    if (hoursInStage >= 48) return { status: "red" as const, hours: hoursInStage, days: daysInStage, label: "Overdue", priority: "HIGH" as const, hidden: false };
    if (hoursInStage >= 24) return { status: "amber" as const, hours: hoursInStage, days: daysInStage, label: "At Risk", priority: "MEDIUM" as const, hidden: false };
    return { status: "green" as const, hours: hoursInStage, days: daysInStage, label: "On Track", priority: "LOW" as const, hidden: false };
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

  // Whether the assignee should be shown as a pill (only if not the current user)
  const showAssigneePill = opportunity.assigned_to && opportunity.assigned_to !== currentUser;

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
        onDragEnd?.();
        setTimeout(() => { isDraggingRef.current = false; }, 100);
      }}
      onTouchStart={(e) => {
        if (onTouchDragStart && cardRef.current) onTouchDragStart(e, opportunity, cardRef.current);
      }}
      onTouchMove={onTouchDragMove}
      onTouchEnd={onTouchDragEnd}
      onClick={() => { if (!isDraggingRef.current) onClick(); }}
      className={cn(
        // Focus-mode inspired card: indigo glow, rounded-xl, hover intensifies glow
        "cursor-grab active:cursor-grabbing group touch-manipulation relative",
        "rounded-xl bg-card",
        isLive
          ? "pipeline-card-live bg-gradient-to-br from-amber-50 via-yellow-50/80 to-amber-100/60 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-amber-900/20"
          : cn("pipeline-card border-l-[4px]", teamColors.border)
      )}
    >
      {/* Delete (trash) icon — fades in on hover, top-right */}
      <button
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-red-500 z-10"
        onClick={(e) => {
          e.stopPropagation();
          // Trigger delete via the detail modal for now — just visual feedback
        }}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <div
        className={cn(
          "p-2 md:p-2.5 space-y-1",
          isCollapsed && "py-1"
        )}
      >
        {/* Deal Name + Service Type */}
        <div className="flex items-center justify-between gap-1">
          <h3 className="font-bold text-[10px] md:text-xs lg:text-sm text-foreground truncate leading-tight flex-1 group-hover:text-indigo-600 transition-colors">
            {account?.name || "Unknown"}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isCollapsed && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[9px] md:text-[10px] font-bold px-1 py-0.5 rounded border",
                  serviceType === "gateway_only"
                    ? "text-teal-600 dark:text-teal-400 border-teal-500/40 bg-teal-500/10"
                    : "text-indigo-600 dark:text-indigo-400 border-indigo-500/40 bg-indigo-500/10"
                )}
              >
                {serviceType === "gateway_only" ? (
                  <><Zap className="h-2.5 w-2.5" /><span className="hidden sm:inline">GW</span></>
                ) : (
                  <><CreditCard className="h-2.5 w-2.5" /><span className="hidden sm:inline">CC</span></>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Contact — with user icon */}
        {!isCollapsed && (
          <p className="text-[9px] md:text-[11px] text-muted-foreground truncate font-medium flex items-center gap-1">
            <User className="h-2.5 w-2.5 shrink-0" />
            {contactName || "No contact"}
          </p>
        )}

        {/* Lead Source */}
        {!isCollapsed && opportunity.referral_source && (
          <span className="text-[8px] md:text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded truncate inline-block max-w-full border border-border/40">
            📣 {opportunity.referral_source}
          </span>
        )}

        {/* Footer Row — value, assignee pill, priority badge */}
        {!isCollapsed && (
          <div className="flex items-center justify-between pt-1 border-t border-border/60 gap-1">
            {/* Value */}
            <span className="font-bold text-[10px] md:text-xs text-foreground truncate">
              {dealValue > 0 ? formatCurrency(dealValue) : "—"}
            </span>

            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Assignee Badge — tiny gray pill, only if not current user */}
              {showAssigneePill && (
                <span className="text-[8px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full truncate max-w-[60px]">
                  {opportunity.assigned_to}
                </span>
              )}

              {/* Priority Badge — uppercase, tracked, color-coded */}
              {slaInfo.priority && !slaInfo.hidden && (
                <span
                  className={cn(
                    "text-[7px] md:text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded",
                    slaInfo.status === "red" && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                    slaInfo.status === "amber" && "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
                    slaInfo.status === "green" && "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  )}
                >
                  {slaInfo.priority}
                </span>
              )}

              {isLive && (
                <span className="px-1 py-0.5 rounded text-[8px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                  LIVE
                </span>
              )}

              {/* Assignment Avatar */}
              <Popover>
                <PopoverTrigger asChild>
                  <button onClick={(e) => e.stopPropagation()}>
                    <Avatar className="h-5 w-5 md:h-6 md:w-6 border border-border hover:border-indigo-400 transition-colors">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={opportunity.assigned_to || "Unassigned"} />}
                      <AvatarFallback className={cn("text-[8px] font-black", teamColors.bg, teamColors.text)}>
                        {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-2 bg-popover z-50 rounded-lg border border-border shadow-lg" onClick={(e) => e.stopPropagation()} align="end">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider mb-2">Assign</p>
                    <Select value={opportunity.assigned_to || "unassigned"} onValueChange={handleAssignmentChange}>
                      <SelectTrigger className="h-7 text-xs rounded border border-border">
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
          </div>
        )}
      </div>
    </div>
  );
};

export default OpportunityCard;
