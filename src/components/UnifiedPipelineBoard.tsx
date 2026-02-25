import { useState, useCallback, useRef, useEffect } from "react";
import { RefreshCw, Minimize2, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { Opportunity, OpportunityStage, UNIFIED_PIPELINE_STAGES, STAGE_CONFIG, getServiceType, migrateStage } from "@/types/opportunity";
import PipelineColumn from "./PipelineColumn";
import OpportunityDetailModal from "./OpportunityDetailModal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

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

  return (
    <>
      {/* Toolbar */}
      <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between border-b-2 border-foreground/10">
        <div className="flex items-center gap-3">
          <span className="font-black text-sm uppercase tracking-widest text-foreground">
            Pipeline
          </span>
          <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 border border-border">
            {totalCount} deals
          </span>
        </div>
        <div className="flex items-center gap-1">
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
                className="h-7 px-2 gap-1 text-xs border-2 border-foreground/30"
              >
                {isCompact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isCompact ? "Expand" : "Compact"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCompact ? "Switch to regular view" : "Switch to compact view"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Pipeline columns */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden min-h-0"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className={cn("flex items-stretch min-w-max h-full", isCompact ? "gap-0 p-1" : "gap-0 p-2")}>
          {UNIFIED_PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              opportunities={getOpportunitiesByStage(stage)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={setSelectedOpportunity}
              onAssignmentChange={onAssignmentChange}
              onSlaStatusChange={onSlaStatusChange}
              onAddNew={stage === "application_started" ? onAddNew : undefined}
              isCompact={isCompact}
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
                  i === currentColumnIndex ? "bg-primary w-3" : "bg-muted-foreground/40"
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
    </>
  );
};

export default UnifiedPipelineBoard;
