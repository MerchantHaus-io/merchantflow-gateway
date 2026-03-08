import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { GripVertical, CreditCard, Zap, Trash2, User, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Opportunity, TEAM_MEMBERS, getServiceType } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInHours, differenceInDays } from "date-fns";

interface OpportunityCardProps {
  opportunity: Opportunity;
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void;
  onDragEnd?: () => void;
  onClick: () => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  onMarkAsDead?: (id: string) => void;
  onTouchDragStart?: (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => void;
  onTouchDragMove?: (e: React.TouchEvent) => void;
  onTouchDragEnd?: (e: React.TouchEvent) => void;
  currentUser?: string;
}

const TEAM_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  Wesley:  { border: "border-l-team-wesley",  bg: "bg-red-100 dark:bg-red-900/30",    text: "text-red-700 dark:text-red-300" },
  Jamie:   { border: "border-l-team-jamie",   bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  Darryn:  { border: "border-l-team-darryn",  bg: "bg-green-100 dark:bg-green-900/30",  text: "text-green-700 dark:text-green-300" },
  Taryn:   { border: "border-l-team-taryn",   bg: "bg-blue-100 dark:bg-blue-900/30",    text: "text-blue-700 dark:text-blue-300" },
  Yaseen:  { border: "border-l-team-yaseen",  bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
  Sales:   { border: "border-l-team-sales",   bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
};

const TEAM_EMAIL_MAP: Record<string, string> = {
  Wesley: "dylan@merchanthaus.io",
  Jamie:  "admin@merchanthaus.io",
  Darryn: "darryn@merchanthaus.io",
  Taryn:  "taryn@merchanthaus.io",
  Yaseen: "support@merchanthaus.io",
  Sales:  "sales@merchanthaus.io",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const OpportunityCard = ({
  opportunity,
  onDragStart,
  onDragEnd,
  onClick,
  onAssignmentChange,
  onSlaStatusChange,
  onMarkAsDead,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  currentUser,
}: OpportunityCardProps) => {
  const account = opportunity.account;
  const contact = opportunity.contact;
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "";

  const teamColors = opportunity.assigned_to
    ? TEAM_COLORS[opportunity.assigned_to] || { border: "border-l-primary/50", bg: "bg-muted", text: "text-muted-foreground" }
    : { border: "border-l-muted-foreground/30", bg: "bg-muted", text: "text-muted-foreground" };

  const isLive = opportunity.stage === "live_activated";
  const serviceType = getServiceType(opportunity);
  const wizardProgress = (opportunity.wizard_state?.progress as number) ?? 0;
  const isComplete = wizardProgress >= 100;

  const dealValue = useMemo(() => {
    const formState = opportunity.wizard_state?.form_state as Record<string, string> | undefined;
    if (!formState?.monthly_volume) return 0;
    const vol = parseFloat(formState.monthly_volume.replace(/[^0-9.]/g, ""));
    if (isNaN(vol) || vol <= 0) return 0;
    const processingRevenue = vol * 0.0292 * 0.33;
    const avgTicket = formState.average_transaction
      ? parseFloat(formState.average_transaction.replace(/[^0-9.]/g, ""))
      : 0;
    const txnRevenue = avgTicket > 0 ? (vol / avgTicket / 10) : 0;
    return processingRevenue + txnRevenue;
  }, [opportunity.wizard_state]);

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const slaInfo = useMemo(() => {
    if (isLive) return { status: "green" as const, label: "Live", priority: null, hidden: true, daysInStage: 0 };
    const stageEnteredAt = opportunity.stage_entered_at
      ? new Date(opportunity.stage_entered_at)
      : new Date(opportunity.created_at);
    const hoursInStage = differenceInHours(new Date(), stageEnteredAt);
    const daysInStage = differenceInDays(new Date(), stageEnteredAt);

    if (opportunity.sla_status) {
      const priorityMap = { red: "HIGH", amber: "MED", green: "LOW" } as const;
      return {
        status: opportunity.sla_status as "green" | "amber" | "red",
        label: opportunity.sla_status === "red" ? "Overdue" : opportunity.sla_status === "amber" ? "At Risk" : "On Track",
        priority: priorityMap[opportunity.sla_status as keyof typeof priorityMap] || null,
        hidden: false,
        daysInStage,
      };
    }

    if (hoursInStage >= 48) return { status: "red" as const, label: "Overdue", priority: "HIGH" as const, hidden: false, daysInStage };
    if (hoursInStage >= 24) return { status: "amber" as const, label: "At Risk", priority: "MED" as const, hidden: false, daysInStage };
    return { status: "green" as const, label: "On Track", priority: "LOW" as const, hidden: true, daysInStage };
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
      toast.success(newValue ? `Assigned to ${newValue}` : "Unassigned");
    } catch {
      toast.error("Failed to update assignment");
    }
  };

  const handleMarkDeadConfirm = useCallback(async () => {
    try {
      const { error } = await supabase
        .from("opportunities")
        .update({ status: "dead" })
        .eq("id", opportunity.id);
      if (error) throw error;
      onMarkAsDead?.(opportunity.id);
      toast.success("Opportunity marked as dead");
    } catch {
      toast.error("Failed to mark as dead");
    }
    setShowDeleteDialog(false);
  }, [opportunity.id, onMarkAsDead]);

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const cardRef = useRef<HTMLDivElement>(null);
  const showAssigneePill = opportunity.assigned_to && opportunity.assigned_to !== currentUser;

  return (
    <>
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
          "cursor-grab active:cursor-grabbing group touch-manipulation relative",
          "rounded-xl",
          isLive
            ? "pipeline-card-live bg-gradient-to-br from-amber-50 via-yellow-50/80 to-amber-100/60 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-amber-900/20"
            : isComplete
              ? "pipeline-card border-l-[3px] border-l-emerald-500 bg-emerald-600 dark:bg-emerald-700"
              : cn("pipeline-card border-l-[3px]", teamColors.border, "bg-card")
        )}
      >
        {/* Delete button — fades in on hover */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-red-500 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Mark as dead</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Drag handle */}
        <GripVertical className="absolute left-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-all cursor-grab active:cursor-grabbing group-hover:left-0.5" />

        <div className="pl-4 pr-2 pt-2.5 pb-2 space-y-1.5">
          {/* Account name + service badge */}
          <div className="flex items-start justify-between gap-1">
            <h3 className={cn(
              "font-semibold text-xs leading-tight flex-1 min-w-0 transition-colors",
              isComplete ? "text-white" : "text-foreground group-hover:text-indigo-500 dark:group-hover:text-indigo-400"
            )}>
              {account?.name || "Unknown"}
            </h3>
            <span className={cn(
              "flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5",
              serviceType === "gateway_only"
                ? "text-teal-600 dark:text-teal-400 border-teal-500/40 bg-teal-500/10"
                : "text-indigo-600 dark:text-indigo-400 border-indigo-500/40 bg-indigo-500/10"
            )}>
              {serviceType === "gateway_only"
                ? <><Zap className="h-2.5 w-2.5" />GW</>
                : <><CreditCard className="h-2.5 w-2.5" />CC</>
              }
            </span>
          </div>

          {/* Contact name */}
          {contactName && (
            <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
              <User className="h-2.5 w-2.5 shrink-0" />
              {contactName}
            </p>
          )}

          {/* Referral source */}
          {opportunity.referral_source && (
            <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md truncate inline-block max-w-full border border-border/30">
              {opportunity.referral_source}
            </span>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40 gap-1">
            {/* Deal value */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span key={dealValue} className={cn(
                "font-mono font-semibold text-[10px] truncate animate-count",
                isComplete ? "text-white/90" : "text-[hsl(var(--gold))]"
              )}>
                {dealValue > 0 ? formatCurrency(dealValue) : "—"}
              </span>
              {/* Days in stage — color-coded */}
              {slaInfo.daysInStage > 0 && !isLive && (
                <span className={cn(
                  "flex items-center gap-0.5 text-[9px] font-medium",
                  slaInfo.daysInStage < 7 ? "text-emerald-500" : slaInfo.daysInStage < 14 ? "text-amber-500" : "text-red-500"
                )}>
                  <Clock className="h-2 w-2" />
                  {slaInfo.daysInStage}d
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Assignee pill (only when not current user) */}
              {showAssigneePill && (
                <span className="text-[9px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full truncate max-w-[52px]">
                  {opportunity.assigned_to}
                </span>
              )}

              {/* SLA / priority badge */}
              {slaInfo.priority && !slaInfo.hidden && (
                <span className={cn(
                  "text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-md",
                  slaInfo.status === "red"   && "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                  slaInfo.status === "amber" && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                )}>
                  {slaInfo.priority}
                </span>
              )}

              {/* Live badge */}
              {isLive && (
                <span className="px-1 py-0.5 rounded-md text-[8px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                  LIVE
                </span>
              )}

              {/* Assignment avatar */}
              <Popover>
                <PopoverTrigger asChild>
                  <button onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <Avatar className="h-5 w-5 border border-border/50 hover:border-indigo-400 transition-colors">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt={opportunity.assigned_to || "Unassigned"} />}
                      <AvatarFallback className={cn("text-[8px] font-black", teamColors.bg, teamColors.text)}>
                        {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-36 p-2 bg-popover z-50 rounded-lg border border-border shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                  align="end"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-muted-foreground">Assign to</p>
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
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Dead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{account?.name || "this opportunity"}</strong> from the active pipeline.
              It can be reactivated by reassigning it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkDeadConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Mark as Dead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default OpportunityCard;
