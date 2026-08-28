import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { GripVertical, CreditCard, Zap, Trash2 } from "lucide-react";
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
import { Opportunity, STAGE_CONFIG, TEAM_MEMBERS, getServiceType, migrateStage } from "@/types/opportunity";
import { dealAttention } from "@/lib/dealAttention";
import { emptyDealSignal, type DealSignal } from "@/hooks/useDealSignals";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInHours, differenceInDays, format } from "date-fns";

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
  isAdmin?: boolean;
  /** Meeting and underwriting score, fetched once for the whole board. */
  signal?: DealSignal;
}

import { TEAM_ROSTER, NAME_TO_EMAIL } from "@/config/team";

// Visual styles per member — sourced from the roster so renames propagate.
// Border tokens come from team.ts; bg/text are the per-person palette.
const MEMBER_PALETTE: Record<string, { bg: string; text: string }> = {
  jamie:  { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  darryn: { bg: "bg-green-100  dark:bg-green-900/30",  text: "text-green-700  dark:text-green-300" },
  taryn:  { bg: "bg-blue-100   dark:bg-blue-900/30",   text: "text-blue-700   dark:text-blue-300" },
  yaseen: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
  neil:   { bg: "bg-cyan-100   dark:bg-cyan-900/30",   text: "text-cyan-700   dark:text-cyan-300" },
};

const TEAM_COLORS: Record<string, { border: string; bg: string; text: string }> = (() => {
  const map: Record<string, { border: string; bg: string; text: string }> = {};
  for (const m of TEAM_ROSTER) {
    const palette = MEMBER_PALETTE[m.id] ?? { bg: "bg-muted", text: "text-foreground" };
    const entry = { border: `border-l-${m.colorToken.replace("border-", "")}`, ...palette };
    map[m.displayName] = entry;
    m.legacyNames?.forEach((n) => (map[n] = entry));
  }
  return map;
})();

const TEAM_EMAIL_MAP: Record<string, string> = NAME_TO_EMAIL;

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
  isAdmin,
  signal = emptyDealSignal,
}: OpportunityCardProps) => {
  const account = opportunity.account;
  const contact = opportunity.contact;
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "";

  const teamColors = opportunity.assigned_to
    ? TEAM_COLORS[opportunity.assigned_to] || { border: "border-l-primary/50", bg: "bg-muted", text: "text-muted-foreground" }
    : { border: "border-l-muted-foreground/30", bg: "bg-muted", text: "text-muted-foreground" };

  const isClosedWon = opportunity.outcome_status === 'closed_won';
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
  // Meeting and score arrive from the board's single batched query rather than
  // two round trips per card — see src/hooks/useDealSignals.ts.
  const nextEvent = signal.nextEvent;
  const uwScore = signal.underwritingScore;

  const slaInfo = useMemo(() => {
    if (isClosedWon) return { status: "green" as const, label: "Won", priority: null, hidden: true, daysInStage: 0 };
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
  }, [opportunity.stage_entered_at, opportunity.created_at, opportunity.sla_status, isClosedWon]);

  useEffect(() => {
    const fetchAvatar = async () => {
      if (!opportunity.assigned_to) { setAvatarUrl(null); return; }
      const email = TEAM_EMAIL_MAP[opportunity.assigned_to];
      if (!email) { setAvatarUrl(null); return; }
      const { data } = await supabase.from("profiles").select("avatar_url").eq("email", email).maybeSingle();
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

  /** One sentence per card, decided in one place — see src/lib/dealAttention.ts. */
  const attention = useMemo(
    () =>
      dealAttention({
        daysInStage: slaInfo.daysInStage,
        stageLabel: STAGE_CONFIG[migrateStage(opportunity.stage)]?.label ?? "this stage",
        assignedTo: opportunity.assigned_to,
        hoursToMeeting: nextEvent ? differenceInHours(new Date(nextEvent.start_time), new Date()) : null,
        meetingLabel: nextEvent ? format(new Date(nextEvent.start_time), "MMM d, h:mm a") : null,
        underwritingScore: uwScore,
        activationReady: Boolean(opportunity.portal_merchant_id) && opportunity.stage === "go_live_ready" && !isClosedWon,
      }),
    [slaInfo.daysInStage, opportunity.stage, opportunity.assigned_to, opportunity.portal_merchant_id, nextEvent, uwScore, isClosedWon],
  );

  const toneStyles: Record<string, { text: string; pip: string }> = {
    critical: { text: "text-red-600 dark:text-red-400", pip: "bg-red-500" },
    soon: { text: "text-amber-700 dark:text-amber-400", pip: "bg-amber-500" },
    ready: { text: "text-emerald-700 dark:text-emerald-400", pip: "bg-emerald-500" },
    steady: { text: "text-muted-foreground", pip: "bg-muted-foreground/50" },
  };
  const tone = toneStyles[attention.tone];

  const claimForSelf = () => {
    if (currentUser) void handleAssignmentChange(currentUser);
  };

  const cardRef = useRef<HTMLDivElement>(null);
  const isOwnCard = opportunity.assigned_to === currentUser;
  /**
   * Ownership costs chroma, not information.
   *
   * This used to be `isGreyed = !isOwnCard`, painting an opaque zinc plate and
   * removing the deal value, SLA, service type, meeting and — fatally — the
   * assign control, on every card the signed-in rep did not personally own.
   * Unassigned deals were caught by it too, so a brand-new deal landed on the
   * board as a grey slab that could not be claimed from the board.
   *
   * A manager has no "my cards", so for an admin there is nothing to fade.
   */
  const isOtherRep = Boolean(opportunity.assigned_to) && !isOwnCard && !isAdmin;
  const isUnclaimed = !opportunity.assigned_to;
  const canRetire = isOwnCard || isAdmin;

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
          "rounded-md transition-all duration-200",
          "hover:-translate-y-[1px]",
          // One surface, not four. The old emerald "wizard form is 100% filled
          // in" plate was the loudest state on the whole board, outranking Go
          // Live Ready and an overdue SLA — a priority order nobody chose.
          isClosedWon
            ? "pipeline-card-live border border-amber-500/30 hover:border-amber-500/60 bg-gradient-to-br from-amber-50 via-yellow-50/80 to-amber-100/60 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-amber-900/20"
            : cn("pipeline-card border border-border/50 hover:border-[hsl(var(--gold)/0.55)] border-l-[2px] bg-card", teamColors.border),
          // Ownership reads as desaturation: the team bar, the avatar, the
          // service badge and the attention pip all lose their chroma while
          // every text token keeps its contrast. Nothing is hidden.
          isOtherRep && "saturate-[0.45]"
        )}
      >
        {/* Retire this deal. Still the blunt status:'dead' path rather than the
            OUTCOME_REASONS taxonomy the detail modal captures — that swap is
            its own change. */}
        {canRetire && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Mark as dead"
                  className="absolute top-1 right-1 p-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Mark as dead</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <GripVertical className="absolute left-0.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors cursor-grab active:cursor-grabbing" />

        <div className="pl-3.5 pr-2 py-2.5 space-y-2">
          {/* 1 — who it is, and 2 — whose it is. The assign control is on every
              card now; it used to live inside the branch that ran only for your
              own deals, so an unassigned card had no way to be claimed. */}
          <div className="flex items-start gap-2">
            <h3 className={cn(
              "font-pipeline-sans font-semibold text-[13px] leading-tight tracking-tight flex-1 min-w-0 transition-colors",
              isClosedWon ? "text-amber-900 dark:text-amber-100" : "text-foreground group-hover:text-[hsl(var(--gold))]"
            )}>
              {account?.name || "Unknown"}
            </h3>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  aria-label={opportunity.assigned_to ? `Assigned to ${opportunity.assigned_to}` : "Unassigned — assign this deal"}
                  className="shrink-0 -m-1.5 p-1.5 rounded-full"
                >
                  <Avatar className="h-6 w-6 ring-1 ring-border/60 hover:ring-[hsl(var(--gold))] transition-colors">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={opportunity.assigned_to || "Unassigned"} />}
                    <AvatarFallback className={cn("text-[9px] font-bold", teamColors.bg, teamColors.text)}>
                      {opportunity.assigned_to ? getInitials(opportunity.assigned_to) : "?"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-44 p-2 bg-popover z-50 rounded-lg border border-border shadow-lg"
                onClick={(e) => e.stopPropagation()}
                align="end"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-muted-foreground">Assign to</p>
                <Select value={opportunity.assigned_to || "unassigned"} onValueChange={handleAssignmentChange}>
                  <SelectTrigger className="h-9 text-xs rounded border border-border">
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

          {/* 3 — what it needs, in words. The colour agrees with the sentence
              rather than being the only place the state is written down. */}
          <p className={cn("flex items-start gap-1.5 text-[11.5px] leading-snug", tone.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 mt-[5px]", tone.pip)} aria-hidden="true" />
            <span className="min-w-0">{attention.text}</span>
          </p>

          {isUnclaimed && currentUser && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); claimForSelf(); }}
              className="w-full min-h-[32px] rounded-md bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))] text-[11px] font-bold tracking-tight hover:brightness-110 transition-[filter]"
            >
              Claim this deal
            </button>
          )}

          {/* 4 — what it's worth. Labelled, because a bare gold figure told a
              new rep nothing about whether it was volume, deal size or ours. */}
          <div className="flex items-center gap-2 pt-1.5 border-t border-border/40">
            <span className="font-pipeline-mono font-semibold text-[11px] tracking-tight text-[hsl(var(--gold))]">
              {dealValue > 0 ? formatCurrency(dealValue) : "—"}
              {dealValue > 0 && <span className="font-normal text-[9px] text-muted-foreground"> /mo est.</span>}
            </span>

            <span className={cn(
              "ml-auto flex items-center gap-0.5 font-pipeline-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm border shrink-0 uppercase tracking-wider",
              serviceType === "gateway_only"
                ? "text-teal-600 dark:text-teal-400 border-teal-500/40 bg-teal-500/10"
                : "text-indigo-600 dark:text-indigo-400 border-indigo-500/40 bg-indigo-500/10"
            )}>
              {serviceType === "gateway_only" ? <><Zap className="h-2.5 w-2.5" />GW</> : <><CreditCard className="h-2.5 w-2.5" />CC</>}
            </span>
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
