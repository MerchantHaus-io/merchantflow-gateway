import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { CreditCard, Maximize2, Minimize2, Plus, RefreshCw, Zap } from "lucide-react";
import {
  GATEWAY_ONLY_PIPELINE_STAGES,
  Opportunity,
  OpportunityStage,
  PROCESSING_PIPELINE_STAGES,
  ServiceType,
  getServiceType,
} from "@/types/opportunity";
import PipelineLane from "./PipelineLane";
import OpportunityDetailModal from "./OpportunityDetailModal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { edgeScrollVelocity } from "@/lib/edgeScroll";
import { sumMonthlyRevenue } from "@/lib/pipelineValue";
import { useDealSignals } from "@/hooks/useDealSignals";
import { useIsMobile } from "@/hooks/use-mobile";
import { assignDeal } from "@/lib/assignDeal";
import PipelineQueue from "./PipelineQueue";
import MobilePipeline from "./MobilePipeline";

/**
 * Gateway-only deals never enter the two processing-side stages. One list, read
 * by every drop path, so the mouse and the finger cannot disagree about the rule.
 */
const GATEWAY_BLOCKED_STAGES: OpportunityStage[] = ["underwriting_review", "processor_approval"];

/** Hold before a touch becomes a drag — below this it is a tap or a scroll. */
const TOUCH_HOLD_MS = 320;
/** Finger travel that cancels the hold, i.e. the gesture was a column scroll. */
const TOUCH_SLOP = 10;

interface TouchDragState {
  opportunity: Opportunity;
  element: HTMLElement;
  ghost: HTMLElement | null;
  startX: number;
  startY: number;
  armed: boolean;
  holdTimer: number | null;
  lastStage: OpportunityStage | null;
}

interface UnifiedPipelineBoardProps {
  opportunities: Opportunity[];
  onUpdateOpportunity: (id: string, updates: Partial<Opportunity>) => void;
  onAssignmentChange?: (opportunityId: string, assignedTo: string | null) => void;
  onSlaStatusChange?: (opportunityId: string, slaStatus: string | null) => void;
  onAddNew?: () => void;
  onMarkAsDead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onConvertToGateway?: (opportunity: Opportunity) => Promise<void> | void;
  onMoveToProcessing?: (opportunity: Opportunity) => Promise<void> | void;
  onRefresh?: () => Promise<void>;
  currentUser?: string;
  isAdmin?: boolean;
}

const UnifiedPipelineBoard = ({
  opportunities,
  onUpdateOpportunity,
  onAssignmentChange,
  onSlaStatusChange,
  onAddNew,
  onMarkAsDead,
  onDelete,
  onConvertToGateway,
  onMoveToProcessing,
  onRefresh,
  currentUser,
  isAdmin,
}: UnifiedPipelineBoardProps) => {
  const [draggedOpportunity, setDraggedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /**
   * One funnel on screen at a time.
   *
   * Two stacked lanes put the real cards two bordered containers deep and gave
   * the rep a second axis to navigate before reaching a deal. Picking the
   * funnel once, up here, keeps the rule structural — the visible columns are
   * only the ones this service type is allowed to walk — while the board stays
   * a single row. It is also what the phone's Funnel screen already does.
   */
  const [lane, setLane] = useState<ServiceType>("processing");
  const autoScrollRef = useRef<{ raf: number | null; vx: number; el: HTMLElement | null }>({
    raf: null,
    vx: 0,
    el: null,
  });
  const touchDragRef = useRef<TouchDragState | null>(null);
  const blockTouchScrollRef = useRef<((ev: TouchEvent) => void) | null>(null);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try { await onRefresh(); } finally { setIsRefreshing(false); }
  };

  /* ---------------------------------------------------------------------
     Edge auto-scroll.

     The board is 2,546px of columns behind a viewport that is ~1,176px on a
     1440px laptop, and dragOver did nothing but preventDefault — so reaching a
     late stage meant scrolling the board, which put the card you were holding
     off-screen. A drag from Discovery to Testing was not slow, it was
     impossible. Both pointer paths feed this.
     --------------------------------------------------------------------- */
  const stopAutoScroll = useCallback(() => {
    const s = autoScrollRef.current;
    if (s.raf !== null) cancelAnimationFrame(s.raf);
    s.raf = null;
    s.vx = 0;
    s.el = null;
  }, []);

  const updateAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      // Resolved from the pointer rather than a single ref: each lane scrolls
      // independently, so the board has to follow whichever one the card is over.
      const under = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const el = (under?.closest("[data-scroll-container]") as HTMLElement | null) ?? null;
      if (!el) {
        stopAutoScroll();
        return;
      }

      const r = el.getBoundingClientRect();
      const vx = edgeScrollVelocity(clientX, r.left, r.right);
      autoScrollRef.current.el = el;
      autoScrollRef.current.vx = vx;
      if (vx === 0) {
        stopAutoScroll();
        return;
      }
      if (autoScrollRef.current.raf === null) {
        const step = () => {
          const s = autoScrollRef.current;
          if (!s.el || s.vx === 0) {
            s.raf = null;
            return;
          }
          s.el.scrollLeft += s.vx;
          s.raf = requestAnimationFrame(step);
        };
        autoScrollRef.current.raf = requestAnimationFrame(step);
      }
    },
    [stopAutoScroll],
  );

  /** The one place a stage change is decided, whatever moved the card. */
  const commitStageChange = useCallback(
    (opportunity: Opportunity, stage: OpportunityStage) => {
      if (opportunity.stage === stage || opportunity.outcome_status) return;
      if (getServiceType(opportunity) === "gateway_only" && GATEWAY_BLOCKED_STAGES.includes(stage)) {
        // Was a bare `return` commented "Silently reject": the card snapped back
        // and nothing said why, while the detail modal toasted a clear error for
        // the identical rule. A finger has even less to go on than a cursor.
        toast.error("Gateway-only deals skip underwriting", {
          description: "This deal has no processing application, so it can't enter Underwriting or Approved.",
        });
        return;
      }
      onUpdateOpportunity(opportunity.id, { stage });
    },
    [onUpdateOpportunity],
  );

  const stageAtPoint = (x: number, y: number): OpportunityStage | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest("[data-stage]") as HTMLElement | null;
    return (col?.dataset.stage as OpportunityStage | undefined) ?? null;
  };

  const clearDropHighlight = () => {
    document.querySelectorAll("[data-stage].drag-over").forEach((el) => el.classList.remove("drag-over"));
  };

  const clearTouchDrag = useCallback(() => {
    const state = touchDragRef.current;
    if (state) {
      if (state.holdTimer !== null) window.clearTimeout(state.holdTimer);
      state.ghost?.remove();
      state.element.classList.remove("dragging");
    }
    touchDragRef.current = null;
    if (blockTouchScrollRef.current) {
      document.removeEventListener("touchmove", blockTouchScrollRef.current);
      blockTouchScrollRef.current = null;
    }
    clearDropHighlight();
    stopAutoScroll();
    setDraggedOpportunity(null);
  }, [stopAutoScroll]);

  // A drag interrupted by a route change or a realtime re-render must not leave
  // a ghost node and a document-level listener behind.
  useEffect(() => clearTouchDrag, [clearTouchDrag]);

  /* ---------------------------------------------------------------------
     Touch drag.

     PipelineColumn and OpportunityCard have accepted onTouchDrag* since they
     were written, and nothing ever passed them — so on an iPad, where HTML5
     `draggable` does not fire, there was no way to move a card at all. These
     are the handlers those props were waiting for.
     --------------------------------------------------------------------- */
  const armTouchDrag = useCallback(() => {
    const state = touchDragRef.current;
    if (!state) return;

    const rect = state.element.getBoundingClientRect();
    const ghost = state.element.cloneNode(true) as HTMLElement;
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.margin = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.opacity = "0.92";
    ghost.style.zIndex = "9999";
    ghost.style.transform = "scale(1.03)";
    ghost.style.boxShadow = "0 18px 36px -12px rgba(0, 0, 0, 0.6)";
    document.body.appendChild(ghost);

    state.ghost = ghost;
    state.armed = true;
    state.element.classList.add("dragging");
    setDraggedOpportunity(state.opportunity);

    // React attaches touchmove passively at the root, so preventDefault from
    // the JSX handler is ignored and the column scrolls under the drag. A
    // non-passive document listener is the only thing that holds it still.
    const block = (ev: TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    blockTouchScrollRef.current = block;
  }, []);

  const handleTouchDragStart = useCallback(
    (e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => {
      const t = e.touches[0];
      if (!t || opportunity.outcome_status) return;
      // Only tear down a previous gesture if one is actually open — an
      // unconditional clear here re-rendered the whole board on every tap.
      if (touchDragRef.current || blockTouchScrollRef.current) clearTouchDrag();
      const state: TouchDragState = {
        opportunity,
        element,
        ghost: null,
        startX: t.clientX,
        startY: t.clientY,
        armed: false,
        holdTimer: null,
        lastStage: null,
      };
      state.holdTimer = window.setTimeout(armTouchDrag, TOUCH_HOLD_MS);
      touchDragRef.current = state;
    },
    [armTouchDrag, clearTouchDrag],
  );

  const handleTouchDragMove = useCallback(
    (e: React.TouchEvent) => {
      const state = touchDragRef.current;
      const t = e.touches[0];
      if (!state || !t) return;

      if (!state.armed) {
        // Moving before the hold elapses means the finger is scrolling a
        // column, not picking a card up. Stand down and let the browser have it.
        if (Math.abs(t.clientX - state.startX) > TOUCH_SLOP || Math.abs(t.clientY - state.startY) > TOUCH_SLOP) {
          if (state.holdTimer !== null) window.clearTimeout(state.holdTimer);
          touchDragRef.current = null;
        }
        return;
      }

      if (state.ghost) {
        state.ghost.style.transform = `translate(${t.clientX - state.startX}px, ${t.clientY - state.startY}px) scale(1.03)`;
      }
      updateAutoScroll(t.clientX, t.clientY);

      const stage = stageAtPoint(t.clientX, t.clientY);
      if (stage !== state.lastStage) {
        clearDropHighlight();
        if (stage) document.querySelector(`[data-stage="${stage}"]`)?.classList.add("drag-over");
        state.lastStage = stage;
      }
    },
    [updateAutoScroll],
  );

  const handleTouchDragEnd = useCallback(() => {
    const state = touchDragRef.current;
    if (!state) return;
    const { armed, lastStage, opportunity } = state;
    clearTouchDrag();
    if (!armed) return;

    // touchend is followed by a synthetic click, which would open the detail
    // modal for the card just dropped.
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    document.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => document.removeEventListener("click", swallow, true), 400);

    if (lastStage) commitStageChange(opportunity, lastStage);
  }, [clearTouchDrag, commitStageChange]);

  const handleDragStart = (e: React.DragEvent, opportunity: Opportunity) => {
    setDraggedOpportunity(opportunity);
    e.dataTransfer.effectAllowed = "move";
    // Add dragging class to the element
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => el.classList.add("dragging"));
  };

  const handleDragEnd = () => {
    setDraggedOpportunity(null);
    stopAutoScroll();
    // Remove dragging class from all cards
    document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    updateAutoScroll(e.clientX, e.clientY);
  };

  const handleDrop = (e: React.DragEvent, stage: OpportunityStage) => {
    e.preventDefault();
    stopAutoScroll();
    if (draggedOpportunity) commitStageChange(draggedOpportunity, stage);
    setDraggedOpportunity(null);
  };

  /**
   * Deals still in play, split by the funnel each one actually belongs to.
   *
   * `status` matters as much as `outcome_status`: the realtime UPDATE handler
   * writes a row marked dead straight back into local state, so without it the
   * card sat on the board until the next full refetch.
   */
  const lanes = useMemo(() => {
    const live = opportunities.filter((o) => !o.outcome_status && o.status !== "dead");
    return {
      processing: live.filter((o) => getServiceType(o) === "processing"),
      gateway_only: live.filter((o) => getServiceType(o) === "gateway_only"),
    };
  }, [opportunities]);

  // One batched fetch for the whole board, shared by every card and by the
  // queue — so the queue's ranking and the cards' status lines are computed
  // from the same numbers.
  const liveIds = useMemo(
    () => [...lanes.processing, ...lanes.gateway_only].map((o) => o.id),
    [lanes],
  );
  const signals = useDealSignals(liveIds);
  const isMobile = useIsMobile();

  const handleClaim = useCallback(
    async (opportunity: Opportunity, assignedTo: string) => {
      const result = await assignDeal(opportunity, assignedTo);
      if (!result.ok) {
        toast.error("Couldn't claim that deal");
        return;
      }
      onAssignmentChange?.(opportunity.id, assignedTo);
      toast.success(`Assigned to ${assignedTo}`);
    },
    [onAssignmentChange],
  );




  const hasGatewayOpportunity = selectedOpportunity
    ? opportunities.some(
        (opp) =>
          opp.account_id === selectedOpportunity.account_id &&
          getServiceType(opp) === "gateway_only"
      )
    : false;

  const totalPipelineValue = useMemo(
    () => sumMonthlyRevenue([...lanes.processing, ...lanes.gateway_only]),
    [lanes],
  );
  const laneValues = useMemo(
    () => ({
      processing: sumMonthlyRevenue(lanes.processing),
      gateway_only: sumMonthlyRevenue(lanes.gateway_only),
    }),
    [lanes],
  );


  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);


  return (
    <div className="bg-background/80 dark:bg-transparent flex flex-col flex-1 min-h-0 rounded-xl">
      {/* Inline toolbar — compact action row */}
      <div className="flex-shrink-0 px-4 py-1.5 flex items-center justify-end gap-1.5 gradient-header rounded-t-xl">
        {totalPipelineValue > 0 && (
          <span className="hidden sm:inline-flex text-xs font-semibold text-foreground bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full mr-auto">
            {formatCurrency(laneValues[lane])}/mo in {lane === "gateway_only" ? "Gateway" : "Processing"} &middot; {formatCurrency(totalPipelineValue)}/mo total
          </span>
        )}
        <div
          role="group"
          aria-label="Pipeline"
          className="inline-flex gap-0.5 p-0.5 rounded-md border border-border/60 bg-muted/40 mr-1"
        >
          {(["processing", "gateway_only"] as ServiceType[]).map((key) => {
            const Icon = key === "gateway_only" ? Zap : CreditCard;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setLane(key)}
                aria-pressed={lane === key}
                className={cn(
                  "inline-flex items-center gap-1.5 h-6 px-2.5 rounded text-[11px] font-semibold transition-colors",
                  lane === key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {key === "gateway_only" ? "Gateway" : "Processing"}
                <span className="font-pipeline-mono text-[10px] text-muted-foreground">
                  {lanes[key].length}
                </span>
              </button>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-7 px-2 gap-1 text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh pipeline data</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCompact(!isCompact)}
              className="h-7 px-2 gap-1 text-xs border border-border rounded-md"
            >
              {isCompact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isCompact ? "Expand" : "Compact"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isCompact ? "Switch to regular view" : "Switch to compact view"}</TooltipContent>
        </Tooltip>
        {onAddNew && (
          <Button
            size="sm"
            onClick={onAddNew}
            className="h-7 px-3 gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Deal</span>
          </Button>
        )}
      </div>

      {/* Two funnels, two lanes.

          A gateway-only deal has no processing application, so it never enters
          Underwriting or Approved — a rule the single ten-column row could only
          enforce by refusing a drop after the fact. Given its own lane it has
          seven columns and no illegal target to reach for. */}
      {/* Same route, two answers. A phone gets the mobile view; everything from
          tablet up gets the board. One link works on any device — see
          MobilePipeline for why a phone does not get columns. */}
      {isMobile ? (
        <MobilePipeline
          opportunities={[...lanes.processing, ...lanes.gateway_only]}
          signals={signals}
          onSelect={setSelectedOpportunity}
          onCommitStage={commitStageChange}
          onAssign={handleClaim}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      ) : (
      <div className="flex-1 min-h-0 flex items-stretch">
        <PipelineQueue
          opportunities={[...lanes.processing, ...lanes.gateway_only]}
          signals={signals}
          onSelect={setSelectedOpportunity}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />

        <div className={cn("flex-1 min-h-0 flex flex-col", isCompact ? "p-1.5" : "p-2")}>
          <PipelineLane
            canonicalStages={lane === "gateway_only" ? GATEWAY_ONLY_PIPELINE_STAGES : PROCESSING_PIPELINE_STAGES}
            opportunities={lanes[lane]}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onCardClick={setSelectedOpportunity}
            onAssignmentChange={onAssignmentChange}
            onSlaStatusChange={onSlaStatusChange}
            onMarkAsDead={onMarkAsDead}
            onAddNew={onAddNew}
            onTouchDragStart={handleTouchDragStart}
            onTouchDragMove={handleTouchDragMove}
            onTouchDragEnd={handleTouchDragEnd}
            isCompact={isCompact}
            currentUser={currentUser}
            isAdmin={isAdmin}
            signals={signals}
            onCommitStage={commitStageChange}
          />
        </div>
      </div>
      )}

      <OpportunityDetailModal
        opportunity={selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
        onUpdate={(updates) => {
          if (selectedOpportunity) {
            onUpdateOpportunity(selectedOpportunity.id, updates);
          }
        }}
        onMarkAsDead={onMarkAsDead}
        onDelete={onDelete}
        onConvertToGateway={onConvertToGateway}
        onMoveToProcessing={onMoveToProcessing}
        hasGatewayOpportunity={hasGatewayOpportunity}
      />
    </div>
  );
};

export default UnifiedPipelineBoard;
