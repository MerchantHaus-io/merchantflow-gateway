import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { RefreshCw, Minimize2, Maximize2, ChevronLeft, ChevronRight, Minimize, X, User, CreditCard, Zap, Calendar, Plus } from "lucide-react";
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
  const [currentColumnIndex, setCurrentColumnIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

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
    if (draggedOpportunity && draggedOpportunity.stage !== stage && !draggedOpportunity.outcome_status) {
      onUpdateOpportunity(draggedOpportunity.id, { stage });
    }
    setDraggedOpportunity(null);
  };

  const getOpportunitiesByStage = useCallback(
    (stage: OpportunityStage) =>
      opportunities
        .filter((o) => migrateStage(o.stage) === stage && !o.outcome_status)
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


  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);


  return (
    <div className="backdrop-blur-md bg-background/40 dark:backdrop-blur-none dark:bg-transparent flex flex-col flex-1 min-h-0 rounded-xl">
      {/* Inline toolbar — compact action row */}
      <div className="flex-shrink-0 px-4 py-1.5 flex items-center justify-end gap-1.5 gradient-header rounded-t-xl">
        {totalPipelineValue > 0 && (
          <span className="hidden sm:inline-flex text-xs font-semibold text-foreground bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full mr-auto">
            Revenue: {formatCurrency(totalPipelineValue)}/mo
          </span>
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

      {/* Kanban board — horizontal scroll only, column cards scroll vertically inside columns */}
      <div
        ref={scrollRef}
        onWheel={handleHorizontalWheel}
        className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 pipeline-scrollbar"
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
              onAddNew={stage === "discovery" ? onAddNew : undefined}
              isCompact={isCompact}
              currentUser={currentUser}
              isAdmin={isAdmin}
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
