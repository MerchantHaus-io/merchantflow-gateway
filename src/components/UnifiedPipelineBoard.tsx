import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { RefreshCw, Minimize2, Maximize2, ChevronLeft, ChevronRight, Focus, Minimize, X, User, CreditCard, Zap, Calendar, Plus } from "lucide-react";
import { Opportunity, OpportunityStage, UNIFIED_PIPELINE_STAGES, STAGE_CONFIG, getServiceType, migrateStage } from "@/types/opportunity";
import PipelineColumn from "./PipelineColumn";
import OpportunityDetailModal from "./OpportunityDetailModal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

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
  /** Controlled focus mode state from parent */
  focusMode?: boolean;
  /** Called when focus mode should change */
  onFocusModeChange?: (active: boolean) => void;
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
  focusMode: externalFocusMode,
  onFocusModeChange,
}: UnifiedPipelineBoardProps) => {
  const [draggedOpportunity, setDraggedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [internalFocusMode, setInternalFocusMode] = useState(false);
  const [showExitButton, setShowExitButton] = useState(false);
  const [currentColumnIndex, setCurrentColumnIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Use external focus mode if provided, otherwise internal
  const isFocusMode = externalFocusMode !== undefined ? externalFocusMode : internalFocusMode;
  const setIsFocusMode = useCallback((active: boolean) => {
    if (onFocusModeChange) onFocusModeChange(active);
    else setInternalFocusMode(active);
  }, [onFocusModeChange]);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try { await onRefresh(); } finally { setIsRefreshing(false); }
  };

  const handleDragStart = (e: React.DragEvent, opportunity: Opportunity) => {
    setDraggedOpportunity(opportunity);
    e.dataTransfer.effectAllowed = "move";
    // Add dragging class to the element
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => el.classList.add("dragging"));
  };

  const handleDragEnd = () => {
    setDraggedOpportunity(null);
    // Remove dragging class from all cards
    document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, stage: OpportunityStage) => {
    e.preventDefault();
    if (draggedOpportunity && draggedOpportunity.stage !== stage) {
      onUpdateOpportunity(draggedOpportunity.id, { stage });
    }
    setDraggedOpportunity(null);
  };

  const getOpportunitiesByStage = useCallback(
    (stage: OpportunityStage) =>
      opportunities
        .filter((o) => migrateStage(o.stage) === stage)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [opportunities]
  );

  const scrollToColumn = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(index, UNIFIED_PIPELINE_STAGES.length - 1));
    const col = container.children[0]?.children[clamped] as HTMLElement | undefined;
    col?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setCurrentColumnIndex(clamped);
  }, []);

  const handleHorizontalWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    }
  }, []);

  // Track scroll position for mobile dots
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isMobile) return;
    const onScroll = () => {
      const colW = (el.scrollWidth / UNIFIED_PIPELINE_STAGES.length);
      setCurrentColumnIndex(Math.round(el.scrollLeft / colW));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  const hasGatewayOpportunity = selectedOpportunity
    ? opportunities.some(
        (opp) =>
          opp.account_id === selectedOpportunity.account_id &&
          getServiceType(opp) === "gateway_only"
      )
    : false;

  const totalCount = opportunities.length;

  // Calculate total pipeline revenue: 33% of 2.92% processing fee + $1 per 10 transactions
  const totalPipelineValue = useMemo(() => {
    let total = 0;
    opportunities.forEach((opp) => {
      const formState = opp.wizard_state?.form_state as Record<string, string> | undefined;
      if (!formState?.monthly_volume) return;
      const vol = parseFloat(formState.monthly_volume.replace(/[^0-9.]/g, ""));
      if (isNaN(vol) || vol <= 0) return;
      const processingRevenue = vol * 0.0292 * 0.33;
      const avgTicket = formState.average_transaction
        ? parseFloat(formState.average_transaction.replace(/[^0-9.]/g, ""))
        : 0;
      const txnRevenue = avgTicket > 0 ? (vol / avgTicket / 10) : 0;
      total += processingRevenue + txnRevenue;
    });
    return total;
  }, [opportunities]);

  // Focus mode: separate current user's deals from others
  const { myDeals, otherDeals } = useMemo(() => {
    if (!isFocusMode || !currentUser) return { myDeals: [], otherDeals: [] };
    const mine: Opportunity[] = [];
    const others: Opportunity[] = [];
    opportunities.forEach((opp) => {
      if (opp.assigned_to === currentUser) mine.push(opp);
      else others.push(opp);
    });
    return { myDeals: mine, otherDeals: others };
  }, [opportunities, currentUser, isFocusMode]);

  // Stable random positions for background cards (regenerated only when deals change)
  const bgCardPositions = useMemo(() => {
    return otherDeals.map(() => ({
      x: Math.floor(Math.random() * 75) + 5,
      y: Math.floor(Math.random() * 70) + 5,
      animDuration: Math.random() * 15 + 20,
      animDelay: Math.random() * -20,
      depthScale: Math.random() * 0.3 + 0.65,
    }));
  }, [otherDeals.length]);

  // Stable random animation timings for foreground cards (desynchronized)
  const fgCardAnimations = useMemo(() => {
    return myDeals.map(() => ({
      animDuration: Math.random() * 2 + 3,
      animDelay: Math.random() * -5,
    }));
  }, [myDeals.length]);

  // ESC key to exit focus mode
  useEffect(() => {
    if (!isFocusMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFocusMode(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFocusMode, setIsFocusMode]);

  // Mouse near top to show exit button
  useEffect(() => {
    if (!isFocusMode) return;
    const handleMouseMove = (e: MouseEvent) => {
      setShowExitButton(e.clientY < 100);
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isFocusMode]);

  // History API — push state on entering focus mode, pop to exit
  useEffect(() => {
    if (!isFocusMode) return;
    window.history.pushState({ focusMode: true }, "");
    const onPopState = () => setIsFocusMode(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isFocusMode, setIsFocusMode]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

  // Helper to get a deal's value from wizard_state (matches OpportunityCard logic)
  const getDealValue = (opp: Opportunity): number => {
    const formState = opp.wizard_state?.form_state as Record<string, string> | undefined;
    if (!formState?.monthly_volume) return 0;
    const vol = parseFloat(formState.monthly_volume.replace(/[^0-9.]/g, ""));
    if (isNaN(vol) || vol <= 0) return 0;
    // Processing fee revenue: 33% of 2.92% of monthly volume
    const processingRevenue = vol * 0.0292 * 0.33;
    // Per-transaction revenue: $1 per 10 transactions
    const avgTicket = formState.average_transaction
      ? parseFloat(formState.average_transaction.replace(/[^0-9.]/g, ""))
      : 0;
    const txnRevenue = avgTicket > 0 ? (vol / avgTicket / 10) : 0;
    return processingRevenue + txnRevenue;
  };

  // Focus mode rendering
  if (isFocusMode) {
    return (
      <>
        {/* Floating exit button — hidden, fades in when cursor near top */}
        <div
          className={cn(
            "fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300",
            showExitButton ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
        >
          <Button
            onClick={() => setIsFocusMode(false)}
            className="bg-gray-900/90 backdrop-blur-sm text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 hover:bg-gray-900 transition-all"
          >
            <Minimize className="h-4 w-4" />
            Exit Focus Mode (Esc)
          </Button>
        </div>

        {/* Focus mode container — fixed to fill entire viewport */}
        <div className="fixed inset-0 z-40 overflow-hidden bg-background">
          {/* Background Layer — Other Users' Deals (Parallax Depth) */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            {otherDeals.map((deal, idx) => {
              const pos = bgCardPositions[idx];
              if (!pos) return null;
              const blurAmount = (1 - pos.depthScale) * 4;
              const opacityAmount = pos.depthScale * 0.5;
              return (
                <div
                  key={deal.id}
                  className="bg-floating-card bg-card p-4 rounded-xl w-64 border border-border"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    ["--depth-scale" as string]: pos.depthScale,
                    filter: `grayscale(100%) blur(${blurAmount}px)`,
                    opacity: opacityAmount,
                    animationDuration: `${pos.animDuration}s`,
                    animationDelay: `${pos.animDelay}s`,
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-foreground text-sm">{deal.account?.name || "Unknown"}</h4>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block"
                        style={{
                          color: STAGE_CONFIG[deal.stage]?.color || "#6b7280",
                          backgroundColor: `${STAGE_CONFIG[deal.stage]?.color || "#6b7280"}15`,
                        }}
                      >
                        {STAGE_CONFIG[deal.stage]?.label || deal.stage}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    {deal.assigned_to || "Unassigned"}
                  </p>
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="font-bold text-muted-foreground text-sm">
                      {getDealValue(deal) > 0 ? formatCurrency(getDealValue(deal)) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Foreground Layer — Current User's Deals (Iron Man Animation) */}
          <div className="relative z-10 flex flex-wrap gap-10 justify-center items-center content-center w-full h-full p-8 overflow-y-auto no-scrollbar pointer-events-auto">
            {myDeals.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <p className="text-lg font-bold">No deals assigned to you</p>
                <p className="text-sm mt-2">Cards assigned to you will appear here in focus mode.</p>
              </div>
            ) : (
              myDeals.map((deal, idx) => {
                const anim = fgCardAnimations[idx] || { animDuration: 4, animDelay: 0 };
                const serviceType = getServiceType(deal);
                const dealValue = getDealValue(deal);
                const stageConfig = STAGE_CONFIG[deal.stage];
                return (
                  <div
                    key={deal.id}
                    className="floating-card bg-card p-5 rounded-xl w-72 cursor-pointer group shrink-0"
                    style={{
                      animationDuration: `${anim.animDuration}s`,
                      animationDelay: `${anim.animDelay}s`,
                    }}
                    onClick={() => setSelectedOpportunity(deal)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg group-hover:text-indigo-600 transition-colors">
                          {deal.account?.name || "Unknown"}
                        </h4>
                        {/* Stage pill badge (visible because column headers are gone) */}
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full border mt-1 inline-block"
                          style={{
                            color: stageConfig?.color || "#6b7280",
                            backgroundColor: `${stageConfig?.color || "#6b7280"}15`,
                            borderColor: `${stageConfig?.color || "#6b7280"}30`,
                          }}
                        >
                          {stageConfig?.label || deal.stage}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border",
                          serviceType === "gateway_only"
                            ? "text-teal-600 border-teal-500/40 bg-teal-500/10"
                            : "text-indigo-600 border-indigo-500/40 bg-indigo-500/10"
                        )}
                      >
                        {serviceType === "gateway_only" ? (
                          <><Zap className="h-3 w-3" />GW</>
                        ) : (
                          <><CreditCard className="h-3 w-3" />CC</>
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {deal.contact?.last_name || deal.contact?.first_name || "No contact"}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-4">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(deal.created_at), "MMM d, yyyy")}
                    </p>
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <span className="font-bold text-gray-900 text-lg">
                        {dealValue > 0 ? formatCurrency(dealValue) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

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
          hasGatewayOpportunity={
            selectedOpportunity
              ? opportunities.some(
                  (opp) =>
                    opp.account_id === selectedOpportunity.account_id &&
                    getServiceType(opp) === "gateway_only"
                )
              : false
          }
        />
      </>
    );
  }

  return (
    <div className="backdrop-blur-md bg-background/40 dark:backdrop-blur-none dark:bg-transparent flex flex-col flex-1 min-h-0 rounded-xl">
      {/* Inline toolbar — compact action row */}
      <div className="flex-shrink-0 px-4 py-1.5 flex items-center justify-end gap-1.5 gradient-header rounded-t-xl">
        {totalPipelineValue > 0 && (
          <span className="hidden sm:inline-flex text-xs font-semibold text-foreground bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full mr-auto">
            Revenue: {formatCurrency(totalPipelineValue)}/mo
          </span>
        )}
        {currentUser && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFocusMode(true)}
                className="h-7 px-2.5 gap-1 text-xs font-medium"
              >
                <Focus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Focus Mode</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show only your deals in focus mode</TooltipContent>
          </Tooltip>
        )}
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

      {/* Kanban board — horizontal scroll with vertical scroll per column */}
      <div
        ref={scrollRef}
        onWheel={handleHorizontalWheel}
        className="flex-1 overflow-x-auto overflow-y-auto min-h-0 pipeline-scrollbar"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
        data-scroll-container
      >
        <div className={cn("flex items-stretch min-w-max h-full", isCompact ? "gap-1.5 p-1.5" : "gap-2 p-3")}>
          {UNIFIED_PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              opportunities={getOpportunitiesByStage(stage)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onCardClick={setSelectedOpportunity}
              onAssignmentChange={onAssignmentChange}
              onSlaStatusChange={onSlaStatusChange}
              onAddNew={stage === "application_started" ? onAddNew : undefined}
              isCompact={isCompact}
              currentUser={currentUser}
            />
          ))}
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobile && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-1.5 bg-muted/30 border-t border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scrollToColumn(currentColumnIndex - 1)}
            disabled={currentColumnIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {UNIFIED_PIPELINE_STAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToColumn(i)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-200",
                  i === currentColumnIndex ? "bg-indigo-600 w-3" : "bg-muted-foreground/40"
                )}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scrollToColumn(currentColumnIndex + 1)}
            disabled={currentColumnIndex === UNIFIED_PIPELINE_STAGES.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
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
