import { useMemo, useState } from "react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { ArrowRightLeft, ChevronRight, CreditCard, Phone, Send, UserPlus, Zap } from "lucide-react";
import {
  GATEWAY_ONLY_PIPELINE_STAGES,
  Opportunity,
  OpportunityStage,
  PROCESSING_PIPELINE_STAGES,
  STAGE_CONFIG,
  ServiceType,
  getServiceType,
  migrateStage,
} from "@/types/opportunity";
import { NEEDS_ATTENTION_NOW, dealAttention, type AttentionTone, type DealAttention } from "@/lib/dealAttention";
import { laneStagesFor } from "@/lib/pipelineLanes";
import { phasesFor } from "@/lib/pipelinePhases";
import { monthlyRevenueEstimate, sumMonthlyRevenue } from "@/lib/pipelineValue";
import { emptyDealSignal, type DealSignal } from "@/hooks/useDealSignals";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import MobileDealScreen from "./MobileDealScreen";
import { cn } from "@/lib/utils";

interface MobilePipelineProps {
  opportunities: Opportunity[];
  signals: Map<string, DealSignal>;
  onSelect: (opportunity: Opportunity) => void;
  onCommitStage: (opportunity: Opportunity, stage: OpportunityStage) => void;
  onAssign: (opportunity: Opportunity, assignedTo: string) => void;
  /** The page's assignee filter — 'all', 'mine', or a team member's name. */
  assigneeFilter?: string;
  onAssigneeFilterChange?: (next: string) => void;
  currentUser?: string;
  isAdmin?: boolean;
}

type View = "today" | "funnel";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const toneBar: Record<AttentionTone, string> = {
  critical: "bg-red-500",
  soon: "bg-amber-500",
  ready: "bg-emerald-500",
  steady: "bg-muted-foreground/40",
};

interface Ranked {
  opportunity: Opportunity;
  attention: DealAttention;
  stage: OpportunityStage;
  value: number;
  serviceType: ServiceType;
  daysInStage: number;
}

/**
 * The pipeline on a phone.
 *
 * A kanban board's whole value is lateral comparison — Discovery beside
 * Underwriting beside Testing — and a phone can show one column at a time. So
 * the board pays every cost of the metaphor (a fixed column grid, horizontal
 * scrolling, drag targets) and collects none of its benefit. It isn't cramped
 * on a phone; it's pointless on one.
 *
 * A rep on a phone is between meetings and is asking "who do I call next, and
 * what do I say?", not "how is my funnel shaped?". Two screens answer those
 * separately: Today ranks the work, Funnel keeps the shape available.
 *
 * Same route as the desktop board, so one link works on any device. Every rule
 * is the desktop one — dealAttention() for ranking, the lane's own stage list
 * for what a move is allowed to do, and the board's commitStageChange with its
 * undo window — because a second copy of the logic is how the two drift apart.
 */
const MobilePipeline = ({
  opportunities,
  signals,
  onSelect,
  onCommitStage,
  onAssign,
  assigneeFilter,
  onAssigneeFilterChange,
  currentUser,
  isAdmin,
}: MobilePipelineProps) => {
  const [view, setView] = useState<View>("today");
  const [lane, setLane] = useState<ServiceType>("processing");
  const [moving, setMoving] = useState<Opportunity | null>(null);
  const [openDeal, setOpenDeal] = useState<Ranked | null>(null);

  const ranked = useMemo<Ranked[]>(
    () =>
      opportunities.map((opportunity) => {
        const signal = signals.get(opportunity.id) ?? emptyDealSignal;
        const stage = migrateStage(opportunity.stage);
        const enteredAt = opportunity.stage_entered_at
          ? new Date(opportunity.stage_entered_at)
          : new Date(opportunity.created_at);
        const daysInStage = differenceInDays(new Date(), enteredAt);

        return {
          opportunity,
          stage,
          daysInStage,
          serviceType: getServiceType(opportunity),
          value: monthlyRevenueEstimate(opportunity),
          attention: dealAttention({
            daysInStage,
            stageLabel: STAGE_CONFIG[stage]?.label ?? "this stage",
            assignedTo: opportunity.assigned_to,
            hoursToMeeting: signal.nextEvent
              ? differenceInHours(new Date(signal.nextEvent.start_time), new Date())
              : null,
            meetingLabel: signal.nextEvent ? format(new Date(signal.nextEvent.start_time), "h:mm a") : null,
            underwritingScore: signal.underwritingScore,
            activationReady:
              Boolean(opportunity.portal_merchant_id) && stage === "go_live_ready" && !opportunity.outcome_status,
          }),
        };
      }),
    [opportunities, signals],
  );

  const mine = useMemo(
    () => ranked.filter((r) => isAdmin || !r.opportunity.assigned_to || r.opportunity.assigned_to === currentUser),
    [ranked, isAdmin, currentUser],
  );

  // "Now" and "Later" rather than one ranked list: a phone screen holds about
  // five rows, and a rep needs to know where the line is without counting.
  const now = useMemo(() => mine.filter((r) => r.attention.rank >= NEEDS_ATTENTION_NOW), [mine]);
  const later = useMemo(
    () => mine.filter((r) => r.attention.rank > 0 && r.attention.rank < NEEDS_ATTENTION_NOW),
    [mine],
  );
  const steady = mine.length - now.length - later.length;

  const laneDeals = useMemo(() => ranked.filter((r) => r.serviceType === lane), [ranked, lane]);

  const funnel = useMemo(() => {
    const deals = laneDeals.map((r) => r.opportunity);
    const stages = laneStagesFor(
      lane === "gateway_only" ? GATEWAY_ONLY_PIPELINE_STAGES : PROCESSING_PIPELINE_STAGES,
      deals,
    );
    const busiest = Math.max(
      1,
      ...stages.map((s) => deals.filter((d) => migrateStage(d.stage) === s).length),
    );
    return phasesFor(stages).map(({ phase, stages: phaseStages }) => ({
      phase,
      rows: phaseStages.map((stage) => {
        const inStage = deals.filter((d) => migrateStage(d.stage) === stage);
        return {
          stage,
          count: inStage.length,
          value: sumMonthlyRevenue(inStage),
          share: inStage.length / busiest,
        };
      }),
      value: sumMonthlyRevenue(deals.filter((d) => phaseStages.includes(migrateStage(d.stage)))),
    }));
  }, [laneDeals, lane]);

  /** The stages this deal's own funnel allows — the list the board's lane uses. */
  const movableStages = useMemo(() => {
    if (!moving) return [];
    return laneStagesFor(
      getServiceType(moving) === "gateway_only" ? GATEWAY_ONLY_PIPELINE_STAGES : PROCESSING_PIPELINE_STAGES,
      [moving],
    );
  }, [moving]);

  const renderRow = (row: Ranked) => {
    const { opportunity, attention, stage, value } = row;
    const phone = opportunity.contact?.phone;

    /**
     * The action follows what the deal needs, not what the component finds
     * convenient. A deal nobody owns wants claiming; one that is late or
     * expected wants a call; an approved one wants sending on. Anything else,
     * the useful shortcut is the stage move — the thing dragging did.
     */
    const action = !opportunity.assigned_to
      ? { icon: UserPlus, label: "Claim", href: undefined, run: () => currentUser && onAssign(opportunity, currentUser) }
      : attention.tone === "ready"
        ? { icon: Send, label: "Send", href: undefined, run: () => setOpenDeal(row) }
        : (attention.tone === "critical" || attention.tone === "soon") && phone
          ? { icon: Phone, label: "Call", href: `tel:${phone.replace(/[^\d+]/g, "")}`, run: undefined }
          : { icon: ArrowRightLeft, label: "Move", href: undefined, run: () => setMoving(opportunity) };
    const ActionIcon = action.icon;

    return (
      <li key={opportunity.id} className="flex items-stretch rounded-xl border border-border/60 bg-card overflow-hidden">
        <span className={cn("w-[3px] shrink-0", toneBar[attention.tone])} aria-hidden="true" />
        <button
          type="button"
          onClick={() => setOpenDeal(row)}
          className="flex-1 min-w-0 text-left px-3 py-2.5"
        >
          <span className="block text-[14px] font-semibold leading-tight truncate">
            {opportunity.account?.name || "Unknown"}
          </span>
          <span className="block text-[12px] leading-snug text-muted-foreground mt-0.5">
            {attention.text}
          </span>
          <span className="flex items-center gap-2 mt-1.5">
            <span className="font-pipeline-mono text-[9px] uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-1 py-px">
              {STAGE_CONFIG[stage]?.label ?? stage}
            </span>
            <span className="font-pipeline-mono text-[11px] text-[hsl(var(--gold))]">
              {value > 0 ? `${formatCurrency(value)}/mo` : "—"}
            </span>
          </span>
        </button>

        {/* A labelled 56px target, not a swipe: an invisible interaction is not
            an interaction, and a rep using this is often one-handed. */}
        {action.href ? (
          <a
            href={action.href}
            aria-label={`${action.label} ${opportunity.account?.name || "deal"}`}
            className="w-[58px] shrink-0 flex flex-col items-center justify-center gap-1 border-l border-border/60 bg-muted/40 active:bg-muted"
          >
            <ActionIcon className="h-4 w-4 text-[hsl(var(--gold))]" />
            <span className="text-[9.5px] font-bold">{action.label}</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={action.run}
            aria-label={`${action.label} ${opportunity.account?.name || "deal"}`}
            className="w-[58px] shrink-0 flex flex-col items-center justify-center gap-1 border-l border-border/60 bg-muted/40 active:bg-muted"
          >
            <ActionIcon className="h-4 w-4 text-[hsl(var(--gold))]" />
            <span className="text-[9.5px] font-bold">{action.label}</span>
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-border/40">
        <div className="flex items-baseline gap-2 mb-2">
          <h1 className="text-[19px] font-bold tracking-tight leading-none">
            {view === "today" ? "Today" : "Funnel"}
          </h1>
          <p className="text-[11.5px] text-muted-foreground">
            {view === "today" ? (
              <>
                {new Date().toLocaleDateString(undefined, { weekday: "long" })}
                {" · "}
                {now.length + later.length === 0
                  ? "nothing waiting"
                  : `${now.length + later.length} need you`}
              </>
            ) : (
              `${laneDeals.length} open · ${formatCurrency(sumMonthlyRevenue(laneDeals.map((r) => r.opportunity)))}/mo est.`
            )}
          </p>
        </div>
        {/* The page header and the board toolbar are both gone on a phone, so
            the one control worth keeping from them — whose deals you are
            looking at — lives here instead of costing another 300px above the
            first card.

            New Application deliberately did not come with it. MegaMenuHeader's
            + is on every screen and its New Opportunity item calls the same
            callback, so a button here would be the second copy of an action
            already 300px up the same viewport — the duplication this change
            exists to remove. */}
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-0.5 p-0.5 rounded-full border border-border/60 bg-muted/40">
            {(["today", "funnel"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "font-pipeline-mono text-[10px] font-bold uppercase tracking-wider px-3.5 min-h-[32px] rounded-full transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {onAssigneeFilterChange && (
              <div
                role="group"
                aria-label="Whose deals"
                className="inline-flex gap-0.5 p-0.5 rounded-full border border-border/60 bg-muted/40"
              >
                {([
                  ["mine", "Mine"],
                  ["all", "All"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onAssigneeFilterChange(key)}
                    aria-pressed={assigneeFilter === key}
                    className={cn(
                      "font-pipeline-mono text-[10px] font-bold uppercase tracking-wider px-3 min-h-[32px] rounded-full transition-colors",
                      assigneeFilter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {view === "today" ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
          <section>
            <h2 className="font-pipeline-mono text-[10px] font-bold uppercase tracking-[0.14em] text-red-600 dark:text-red-400 mb-2">
              Now &middot; {now.length}
            </h2>
            {now.length === 0 ? (
              <p className="text-[12px] text-muted-foreground border border-dashed border-border/50 rounded-lg p-3">
                Nothing urgent. No unassigned deals, nothing stalled, no meeting in the next couple of hours.
              </p>
            ) : (
              <ul className="space-y-2">{now.map(renderRow)}</ul>
            )}
          </section>

          {later.length > 0 && (
            <section>
              <h2 className="font-pipeline-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                Later &middot; {later.length}
              </h2>
              <ul className="space-y-2">{later.map(renderRow)}</ul>
            </section>
          )}

          {steady > 0 && (
            <p className="text-[11.5px] text-muted-foreground pb-2">
              {steady} other {steady === 1 ? "deal is" : "deals are"} on schedule.
            </p>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
          <div className="inline-flex gap-0.5 p-0.5 rounded-full border border-border/60 bg-muted/40">
            {(["processing", "gateway_only"] as ServiceType[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLane(l)}
                aria-pressed={lane === l}
                className={cn(
                  "inline-flex items-center gap-1 font-pipeline-mono text-[10px] font-bold uppercase tracking-wider px-3 min-h-[32px] rounded-full transition-colors",
                  lane === l
                    ? "bg-indigo-600 text-white dark:bg-indigo-500"
                    : "text-muted-foreground",
                )}
              >
                {l === "gateway_only" ? <Zap className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                {l === "gateway_only" ? "Gateway" : "Processing"}
              </button>
            ))}
          </div>

          {funnel.map(({ phase, rows, value }) => (
            <section key={phase.id}>
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="font-pipeline-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground">
                  {phase.label}
                </h2>
                <span className="text-[10.5px] text-muted-foreground">{phase.owner}</span>
                {value > 0 && (
                  <span className="font-pipeline-mono text-[10.5px] text-[hsl(var(--gold))] ml-auto">
                    {formatCurrency(value)}/mo
                  </span>
                )}
              </div>
              <ul>
                {rows.map(({ stage, count, value: stageValue, share }) => (
                  <li
                    key={stage}
                    className="flex items-center gap-3 min-h-[46px] border-b border-border/40 py-1.5"
                  >
                    <span
                      className={cn(
                        "font-pipeline-mono text-[13px] font-bold w-6 text-right",
                        count === 0 && "text-muted-foreground/50",
                      )}
                    >
                      {count}
                    </span>
                    <span className={cn("text-[13.5px]", count === 0 && "text-muted-foreground/60")}>
                      {STAGE_CONFIG[stage]?.label ?? stage}
                    </span>
                    <span className="h-[3px] w-14 rounded-full bg-border overflow-hidden ml-1">
                      <span
                        className="block h-full bg-[hsl(var(--gold))]"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </span>
                    <span className="font-pipeline-mono text-[10.5px] text-[hsl(var(--gold))] ml-auto">
                      {stageValue > 0 ? formatCurrency(stageValue) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {openDeal && (
        <MobileDealScreen
          opportunity={openDeal.opportunity}
          attention={openDeal.attention}
          stage={openDeal.stage}
          value={openDeal.value}
          daysInStage={openDeal.daysInStage}
          signal={signals.get(openDeal.opportunity.id) ?? emptyDealSignal}
          onBack={() => setOpenDeal(null)}
          onMove={() => setMoving(openDeal.opportunity)}
          onOpenFullRecord={() => {
            const target = openDeal.opportunity;
            setOpenDeal(null);
            onSelect(target);
          }}
        />
      )}

      {/* Move — the replacement for dragging a card across columns that don't
          fit on the screen. Only this deal's funnel is listed, so an illegal
          move is unreachable rather than refused. */}
      <Drawer open={Boolean(moving)} onOpenChange={(open) => !open && setMoving(null)}>
        <DrawerContent>
          <div className="px-4 pb-6 pt-1">
            <DrawerTitle className="text-[15px]">
              Move {moving?.account?.name || "this deal"}
            </DrawerTitle>
            <DrawerDescription className="text-[11.5px] mb-3">
              {getServiceType(moving ?? ({} as Opportunity)) === "gateway_only" ? "Gateway" : "Processing"} funnel.
              One tap moves it — you get five seconds to undo before anyone is notified.
            </DrawerDescription>

            <ul className="space-y-1.5 max-h-[52dvh] overflow-y-auto">
              {movableStages.map((stage) => {
                const here = moving ? migrateStage(moving.stage) === stage : false;
                return (
                  <li key={stage}>
                    <button
                      type="button"
                      disabled={here}
                      onClick={() => {
                        if (moving) onCommitStage(moving, stage);
                        setMoving(null);
                        setOpenDeal(null);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 min-h-[46px] px-3 rounded-lg border text-[13.5px] text-left",
                        here
                          ? "border-dashed border-border text-muted-foreground"
                          : "border-border bg-card active:bg-muted",
                      )}
                    >
                      {STAGE_CONFIG[stage]?.label ?? stage}
                      {here ? (
                        <span className="ml-auto font-pipeline-mono text-[9px] uppercase tracking-wider">
                          Here now
                        </span>
                      ) : (
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default MobilePipeline;
