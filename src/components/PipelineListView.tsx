import { useMemo } from "react";
import { Opportunity, STAGE_CONFIG, getServiceType, EMAIL_TO_USER, TEAM_MEMBER_COLORS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { User, Building2, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PipelineListViewProps {
  opportunities: Opportunity[];
  onCardClick: (opportunity: Opportunity) => void;
  selectedId?: string | null;
  onSelect?: (opportunity: Opportunity) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const PipelineListView = ({ opportunities, onCardClick, selectedId, onSelect }: PipelineListViewProps) => {
  const activeOpps = useMemo(
    () =>
      opportunities
        .filter((o) => !o.outcome_status)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [opportunities]
  );

  const getDealValue = (opp: Opportunity): number => {
    const formState = opp.wizard_state?.form_state as Record<string, string> | undefined;
    if (!formState?.monthly_volume) return 0;
    const vol = parseFloat(formState.monthly_volume.replace(/[^0-9.]/g, ""));
    if (isNaN(vol) || vol <= 0) return 0;
    const processingRevenue = vol * 0.0292 * 0.33;
    const avgTicket = formState.average_transaction
      ? parseFloat(formState.average_transaction.replace(/[^0-9.]/g, ""))
      : 0;
    const txnRevenue = avgTicket > 0 ? (vol / avgTicket / 10) : 0;
    return processingRevenue + txnRevenue;
  };

  // Calculate stage progress as a fraction of total stages
  const stageOrder = Object.keys(STAGE_CONFIG);
  const getStageProgress = (stage: string) => {
    const idx = stageOrder.indexOf(stage);
    if (idx === -1) return 0;
    return Math.round(((idx + 1) / stageOrder.length) * 100);
  };

  if (activeOpps.length === 0) return null;

  return (
    <div className="flex flex-col min-h-0 rounded-xl border border-border/60 bg-card/80 backdrop-blur-md overflow-hidden max-w-3xl">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-tight">Pipeline Overview</h3>
          <p className="text-[10px] text-muted-foreground">{activeOpps.length} active deals</p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0 pipeline-scrollbar">
        {/* Column headers */}
        <div className="sticky top-0 z-10 grid grid-cols-[2fr_1.5fr_1fr_120px] gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-card/95 backdrop-blur-sm">
          <span>Merchant</span>
          <span>Account</span>
          <span>Progress</span>
          <span className="text-right">Stage</span>
        </div>

        {/* Rows */}
        {activeOpps.map((opp) => {
          const config = STAGE_CONFIG[opp.stage];
          const progress = getStageProgress(opp.stage);
          const assigneeName = opp.assigned_to ? EMAIL_TO_USER[opp.assigned_to] || opp.assigned_to?.split("@")[0] : null;
          const contactName = [opp.contact?.first_name, opp.contact?.last_name].filter(Boolean).join(" ") || "No contact";
          const dealValue = getDealValue(opp);
          const serviceType = getServiceType(opp);
          const timeAgo = formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true });

          return (
            <div
              key={opp.id}
              onClick={() => onSelect ? onSelect(opp) : onCardClick(opp)}
              className={cn(
                "grid grid-cols-[2fr_1.5fr_1fr_120px] gap-2 px-4 py-2.5 border-b border-border/20 hover:bg-muted/40 cursor-pointer transition-colors group items-center",
                selectedId === opp.id && "bg-primary/5 border-l-2 border-l-primary"
              )}
            >
              {/* Merchant / Contact */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ring-2",
                  assigneeName && TEAM_MEMBER_COLORS[assigneeName]
                    ? `${TEAM_MEMBER_COLORS[assigneeName]} ring-current`
                    : "ring-muted-foreground/20"
                )}
                  style={{ backgroundColor: `${config?.color || '#6b7280'}20`, color: config?.color || '#6b7280' }}
                >
                  {contactName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {contactName}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {assigneeName || "Unassigned"} · {timeAgo}
                  </p>
                </div>
              </div>

              {/* Account / Company */}
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{opp.account?.name || "Unknown"}</p>
                <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                  <span className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                    serviceType === "gateway_only" ? "bg-teal-500" : "bg-indigo-500"
                  )} />
                  {serviceType === "gateway_only" ? "Gateway" : "Processing"}
                  {dealValue > 0 && <span className="ml-1">· {formatCurrency(dealValue)}/mo</span>}
                </p>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground w-8 shrink-0">{progress}%</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: config?.color || '#6b7280',
                    }}
                  />
                </div>
              </div>

              {/* Stage badge */}
              <div className="flex justify-end">
                <span
                  className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
                  style={{
                    color: config?.color || '#6b7280',
                    backgroundColor: `${config?.color || '#6b7280'}15`,
                    borderColor: `${config?.color || '#6b7280'}30`,
                  }}
                >
                  {config?.label || opp.stage}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineListView;
