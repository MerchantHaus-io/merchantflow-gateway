import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowRight, CalendarDays, Check, Clock, Plus, TrendingDown, TrendingUp, UserPlus,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useOperationsHome, type QueueItem } from "@/hooks/useOperationsHome";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { type AttentionTone } from "@/lib/dealAttention";
import { cn } from "@/lib/utils";

/**
 * Operations — the signed-in front door.
 *
 * What this replaced, and why: the previous home screen was a launcher. Thirty
 * shortcuts in three switchable layouts (cards, icon orbs, a 3D carousel), a
 * greeting, a favourites star, and no state. The icon rail to its left already
 * did navigation, so the front door's whole job was duplicated — and a rep
 * opening the app to find out what had gone wrong overnight learned nothing
 * from it.
 *
 * It also broke the product's own third principle: one launcher served reps,
 * account managers, support and admins identically.
 *
 * This screen answers three questions in order — what needs me, what is the
 * book worth, what just happened — and only then offers navigation, as text,
 * in one screen-inch. Ranking comes from `dealAttention()`, the same function
 * the board and the mobile Today screen call, so no two surfaces can disagree
 * about which deals are urgent.
 *
 * Every colour is a token and every state is carried by a word as well as a
 * hue, because the app ships sixteen palettes and iPad-in-landscape is a real
 * scene. No hover-only affordances: the old favourite star was
 * `opacity-0 group-hover:opacity-100`, which is invisible to a finger.
 */

type RoleView = "sales" | "am" | "support" | "admin";

const ROLE_LABEL: Record<RoleView, string> = {
  sales: "Sales",
  am: "Account management",
  support: "Support",
  admin: "Administrator",
};

const ROLE_ACTION: Record<RoleView, { label: string; to: string }> = {
  sales: { label: "New opportunity", to: "/opportunities?new=1" },
  am: { label: "Live & billing", to: "/live-billing" },
  support: { label: "Support queue", to: "/support" },
  admin: { label: "Administration", to: "/admin/administration" },
};

const TONE_RULE: Record<AttentionTone, string> = {
  critical: "bg-primary",
  soon: "bg-warning",
  ready: "bg-success",
  steady: "bg-border",
};

const TONE_TEXT: Record<AttentionTone, string> = {
  critical: "text-primary",
  soon: "text-warning",
  ready: "text-success",
  steady: "text-muted-foreground",
};

const TONE_ICON: Record<AttentionTone, typeof Clock> = {
  critical: AlertCircle,
  soon: Clock,
  ready: Check,
  steady: Clock,
};

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const compact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Section furniture. One mono label, one count, tools on the right. */
function SectionHead({
  title, count, note, action, actionTo,
}: { title: string; count?: number; note?: string; action?: string; actionTo?: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-2">
      <h2 className="font-display text-[10.5px] font-bold uppercase tracking-[0.15em] text-foreground">
        {title}
      </h2>
      {count != null && (
        <span
          className={cn(
            "font-display text-[9.5px] font-bold min-w-[18px] h-[17px] px-1.5 grid place-items-center rounded border",
            count > 0
              ? "bg-primary/15 text-primary border-primary/35"
              : "bg-muted text-muted-foreground border-border/60",
          )}
        >
          {count}
        </span>
      )}
      {note && <span className="font-display text-[10px] uppercase tracking-[0.11em] text-muted-foreground">{note}</span>}
      {action && actionTo && (
        <Link to={actionTo} className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          {action} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/** One deal, one sentence, one resolving action. */
function QueueRow({ item }: { item: QueueItem }) {
  const navigate = useNavigate();
  const { attention, opportunity, stageLabel, value, daysInStage } = item;
  const Icon = TONE_ICON[attention.tone];
  const unassigned = !opportunity.assigned_to;

  // The action that resolves the sentence, not a generic "view".
  const resolve = unassigned
    ? { label: "Assign" }
    : attention.text.startsWith("Meeting")
      ? { label: "Prep notes" }
      : attention.text.startsWith("Approved")
        ? { label: "Send activation" }
        : attention.text.startsWith("Underwriting")
          ? { label: "Review report" }
          : { label: "Chase" };

  return (
    <div className="grid grid-cols-[3px_minmax(0,1.7fr)_112px_152px_104px_auto] items-center gap-x-3.5 pr-3.5 min-h-[56px] border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
      <div className={cn("self-stretch w-[3px]", TONE_RULE[attention.tone])} aria-hidden />

      <button
        onClick={() => navigate(`/opportunities/${opportunity.id}`)}
        className="text-left py-2.5 pl-3.5 min-w-0"
      >
        <div className="text-[13.5px] font-semibold tracking-[-0.01em] truncate">
          {(opportunity as { account?: { name?: string | null } | null }).account?.name || "Unnamed account"}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-px truncate">
          <Icon className={cn("h-3 w-3 shrink-0", TONE_TEXT[attention.tone])} />
          <span className={cn("font-medium", TONE_TEXT[attention.tone])}>{attention.text}</span>
        </div>
      </button>

      <div className="py-2.5 min-w-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-[22px] w-[22px] rounded-full grid place-items-center font-display text-[8.5px] font-bold border shrink-0",
              unassigned
                ? "border-dashed border-primary/60 text-primary bg-primary/10"
                : "border-border bg-muted text-foreground",
            )}
          >
            {unassigned ? "?" : (opportunity.assigned_to ?? "").slice(0, 2).toUpperCase()}
          </div>
          <span className={cn("text-xs truncate", unassigned ? "text-primary" : "text-muted-foreground")}>
            {unassigned ? "Unassigned" : opportunity.assigned_to}
          </span>
        </div>
      </div>

      <div className="py-2.5 hidden lg:block">
        <div className="font-display text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground truncate">
          {stageLabel}
        </div>
        <div className="font-display text-[10px] text-muted-foreground/70 mt-0.5">
          {daysInStage}d in stage
        </div>
      </div>

      <div className="py-2.5 text-right font-display text-[13px] tabular-nums">
        {value > 0 ? money(value) : "—"}
        <span className="block font-sans text-[10px] uppercase tracking-[0.06em] text-muted-foreground mt-px">
          /mo est
        </span>
      </div>

      <div className="flex items-center gap-1.5 justify-end py-2.5">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => navigate(`/opportunities/${opportunity.id}`)}
        >
          {resolve.label}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => navigate(`/opportunities/${opportunity.id}`)}
        >
          Open
        </Button>
      </div>
    </div>
  );
}

/** A number that earns its space: value, movement, and somewhere to go. */
function Tile({
  label, value, unit, delta, dir, to, attn,
}: {
  label: string; value: string; unit?: string; delta?: string;
  dir?: "up" | "down" | "flat"; to: string; attn?: boolean;
}) {
  const Arrow = dir === "down" ? TrendingDown : TrendingUp;
  return (
    <Link
      to={to}
      className={cn(
        "rounded-lg border bg-card/60 p-3 flex flex-col gap-2 transition-colors hover:border-foreground/30 hover:bg-card/80",
        attn ? "border-primary/45" : "border-border/55",
      )}
    >
      <span className="font-display text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <span className={cn("font-display text-[25px] font-bold leading-none tracking-[-0.03em] tabular-nums", attn && "text-primary")}>
        {value}
        {unit && <span className="text-sm font-normal tracking-normal text-muted-foreground">{unit}</span>}
      </span>
      {delta && (
        <span
          className={cn(
            "font-display text-[10.5px] inline-flex items-center gap-1 mt-auto",
            dir === "up" ? "text-success" : dir === "down" ? "text-primary" : "text-muted-foreground",
          )}
        >
          {dir !== "flat" && <Arrow className="h-3 w-3" />}
          {delta}
        </span>
      )}
    </Link>
  );
}

/** The old thirty shortcuts, as text, grouped, in one screen-inch. */
const JUMP: { title: string; links: [string, string][] }[] = [
  { title: "Pipeline & sales", links: [
    ["Pipeline board", "/pipeline"], ["Opportunities", "/opportunities"],
    ["Quotes & contracts", "/quotes-contracts"], ["Email outreach", "/outreach"],
    ["Web submissions", "/admin/web-submissions"], ["Tasks", "/tasks"], ["Calendar", "/calendar"],
  ]},
  { title: "Book of business", links: [
    ["Live & billing", "/live-billing"], ["Accounts", "/accounts"], ["Contacts", "/contacts"],
    ["Commissions", "/commissions"], ["Payout runs", "/admin/payout-runs"],
    ["Documents", "/documents"], ["Processors", "/supported-processors"],
  ]},
  { title: "Tools", links: [
    ["Statement analysis", "/tools/statement-analysis"], ["Revenue calculator", "/tools/revenue-calculator"],
    ["Quote builder", "/tools/quote-builder"], ["Preboarding wizard", "/tools/preboarding-wizard"],
    ["NMI boarding", "/tools/nmi-boarding"], ["Portal guide", "/tools/gateway-guide"],
    ["CSV import", "/tools/csv-import"],
  ]},
  { title: "Admin & reference", links: [
    ["Administration", "/admin/administration"], ["Observability", "/admin/observability"],
    ["Tenants", "/admin/tenants"], ["Affiliates", "/admin/affiliates"],
    ["Deletion requests", "/admin/deletion-requests"], ["Data export", "/admin/data-export"],
    ["SOP", "/sop"], ["Terminal updates", "/tools/terminal-updates"],
  ]},
];

export default function Home() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const email = user?.email?.toLowerCase() ?? "";
  const displayName = EMAIL_TO_USER[email] ?? email.split("@")[0] ?? "";

  // Role is the user's to override, not ours to guess. Admins land on admin;
  // everyone else on sales until roles carry a working-role column.
  const [role, setRole] = useState<RoleView>(isAdmin ? "admin" : "sales");
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const { loading, now, today, steady, ladder, counts, activity } = useOperationsHome(
    displayName,
    isAdmin && scope === "all",
  );

  const maxStage = useMemo(() => Math.max(1, ...ladder.map((l) => l.count)), [ladder]);

  const tiles = useMemo(() => {
    const shared = [
      { label: "Weighted pipeline", value: compact(counts.weightedPipeline), delta: "per month, est.", dir: "flat" as const, to: "/reports" },
      { label: "Active deals", value: String(counts.activeDeals), delta: `${steady} steady`, dir: "flat" as const, to: "/pipeline" },
      { label: "Stalled 14d+", value: String(counts.stalled), delta: counts.stalled ? "needs chasing" : "none", dir: counts.stalled ? ("down" as const) : ("flat" as const), to: "/pipeline", attn: counts.stalled > 0 },
      { label: "Live merchants", value: String(counts.liveMerchants), delta: "in the book", dir: "flat" as const, to: "/live-billing" },
    ];

    if (role === "support") {
      return [
        { label: "Open tickets", value: String(counts.openTickets), delta: "unclosed", dir: "flat" as const, to: "/support" },
        { label: "Breaching SLA", value: String(counts.breachingTickets), delta: counts.breachingTickets ? "past response budget" : "all inside SLA", dir: counts.breachingTickets ? ("down" as const) : ("flat" as const), to: "/support", attn: counts.breachingTickets > 0 },
        { label: "Unassigned", value: String(counts.unassignedTickets), delta: "nobody owns these", dir: counts.unassignedTickets ? ("down" as const) : ("flat" as const), to: "/support" },
        ...shared.slice(3),
      ];
    }

    if (role === "admin") {
      return [
        ...shared.slice(0, 2),
        { label: "Submissions unreviewed", value: String(counts.unreviewedSubmissions), delta: "from /merchant-apply", dir: counts.unreviewedSubmissions ? ("down" as const) : ("flat" as const), to: "/admin/web-submissions", attn: counts.unreviewedSubmissions > 0 },
        { label: "Compliance queue", value: String(counts.openDeletionRequests), delta: "deletion requests", dir: counts.openDeletionRequests ? ("down" as const) : ("flat" as const), to: "/admin/deletion-requests", attn: counts.openDeletionRequests > 0 },
        { label: "Open tickets", value: String(counts.openTickets), delta: `${counts.breachingTickets} breaching`, dir: "flat" as const, to: "/support" },
        ...shared.slice(3),
      ];
    }

    return [
      ...shared,
      { label: "Residual run-rate", value: "—", delta: "wire nmi_partner_residuals", dir: "flat" as const, to: "/commissions" },
      { label: "Open tickets", value: String(counts.openTickets), delta: `${counts.unassignedTickets} unassigned`, dir: "flat" as const, to: "/support" },
    ];
  }, [role, counts, steady]);

  return (
    <AppLayout>
      <div className="max-w-[1560px] mx-auto px-4 lg:px-5 pt-5 pb-16">

        {/* Page head — facts, not a greeting. */}
        <div className="flex items-end gap-5 flex-wrap mb-1">
          <div>
            <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Operations</h1>
            <div className="flex items-center gap-2.5 flex-wrap mt-1.5">
              {[
                <><b className="text-foreground font-bold">{counts.activeDeals}</b> active deals</>,
                <><b className={cn("font-bold", now.length ? "text-primary" : "text-foreground")}>{now.length}</b> need you now</>,
                <><b className="text-foreground font-bold">{money(counts.weightedPipeline)}</b> weighted /mo</>,
                <><b className={cn("font-bold", counts.breachingTickets ? "text-warning" : "text-foreground")}>{counts.breachingTickets}</b> breaching SLA</>,
              ].map((f, i) => (
                <span key={i} className="font-display text-[10px] uppercase tracking-[0.11em] text-muted-foreground flex items-center gap-2.5">
                  {i > 0 && <span className="h-[3px] w-[3px] rounded-full bg-border" />}
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Role decides the home screen — principle 3, made visible. */}
            <div className="flex rounded-md border border-border/60 overflow-hidden">
              {(Object.keys(ROLE_LABEL) as RoleView[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={cn(
                    "h-7 px-2.5 font-display text-[9.5px] uppercase tracking-[0.1em] border-l first:border-l-0 border-border/60 transition-colors",
                    role === r ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r === "am" ? "Acct mgr" : r === "sales" ? "Rep" : r}
                </button>
              ))}
            </div>

            {isAdmin && (
              <div className="flex rounded-md border border-border/60 overflow-hidden">
                {(["mine", "all"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    aria-pressed={scope === s}
                    className={cn(
                      "h-7 px-2.5 font-display text-[9.5px] uppercase tracking-[0.1em] border-l first:border-l-0 border-border/60 transition-colors",
                      scope === s ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "mine" ? "My book" : "All"}
                  </button>
                ))}
              </div>
            )}

            <Button asChild className="h-8">
              <Link to={ROLE_ACTION[role].to}>
                <Plus className="h-3.5 w-3.5" />
                {ROLE_ACTION[role].label}
              </Link>
            </Button>
          </div>
        </div>

        {/* ── 1. Needs you ───────────────────────────────────── */}
        <section className="mt-6">
          <SectionHead
            title="Needs you"
            count={now.length + today.length}
            note={ROLE_LABEL[role]}
            action="Open board"
            actionTo="/pipeline"
          />
          <div className="rounded-lg border border-border/55 bg-card/60 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading the queue…</div>
            ) : now.length + today.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-sm font-semibold">Nothing is asking for you.</div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">
                  {steady} {steady === 1 ? "deal is" : "deals are"} assigned, inside stage clock, and not waiting on anyone.
                </div>
              </div>
            ) : (
              <>
                {now.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-muted/45 border-b border-border/50">
                      <span className="font-display text-[10px] font-bold uppercase tracking-[0.13em]">Now</span>
                      <span className="font-display text-[9.5px] font-bold px-1.5 h-[17px] grid place-items-center rounded bg-primary/15 text-primary border border-primary/35">
                        {now.length}
                      </span>
                      <span className="text-[11px] text-muted-foreground">Already going wrong, or about to</span>
                    </div>
                    {now.map((item) => <QueueRow key={item.opportunity.id} item={item} />)}
                  </>
                )}
                {today.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-muted/45 border-y border-border/50">
                      <span className="font-display text-[10px] font-bold uppercase tracking-[0.13em]">Today</span>
                      <span className="font-display text-[9.5px] font-bold px-1.5 h-[17px] grid place-items-center rounded bg-muted text-muted-foreground border border-border/60">
                        {today.length}
                      </span>
                      <span className="text-[11px] text-muted-foreground">Owed to someone before end of day</span>
                    </div>
                    {today.map((item) => <QueueRow key={item.opportunity.id} item={item} />)}
                  </>
                )}
                {steady > 0 && (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-muted/25">
                    <span className="font-display text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Steady</span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {steady} moving on schedule — not asking for anything.
                    </span>
                    <Link to="/pipeline" className="ml-auto text-xs text-muted-foreground hover:text-foreground">Show all</Link>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── 2. Portfolio ───────────────────────────────────── */}
        <section className="mt-7">
          <SectionHead title="Portfolio" note="Current" action="Reports" actionTo="/reports" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
            {tiles.map((t) => <Tile key={t.label} {...t} />)}
          </div>
        </section>

        {/* ── 3. Pipeline + activity ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-6 mt-7 items-start">
          <section>
            <SectionHead title="Pipeline by stage" note={`${counts.activeDeals} deals`} />
            <div className="rounded-lg border border-border/55 bg-card/60 py-1">
              {ladder.map((bucket) => {
                const pct = (bucket.count / maxStage) * 100;
                const flagPct = bucket.count ? (bucket.flagged / bucket.count) * pct : 0;
                return (
                  <Link
                    key={bucket.stage}
                    to={`/opportunities?stage=${bucket.stage}`}
                    className="grid grid-cols-[130px_1fr_40px_72px] items-center gap-3 px-3.5 h-[30px] hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-display text-[9.5px] uppercase tracking-[0.07em] text-muted-foreground truncate">
                      {bucket.label}
                    </span>
                    <span className="h-[7px] rounded-sm bg-muted overflow-hidden flex">
                      <i className="block h-full bg-foreground/30" style={{ width: `${pct - flagPct}%` }} />
                      <i className="block h-full bg-primary/85" style={{ width: `${flagPct}%` }} />
                    </span>
                    <span className="font-display text-xs text-right tabular-nums">{bucket.count}</span>
                    <span className={cn("font-display text-[9.5px] uppercase tracking-[0.06em] text-right", bucket.flagged ? "text-primary" : "text-muted-foreground/40")}>
                      {bucket.flagged ? `${bucket.flagged} flagged` : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHead title="Activity" note="Latest" />
            <div className="rounded-lg border border-border/55 bg-card/60">
              {activity.length === 0 ? (
                <div className="p-6 text-center text-[12.5px] text-muted-foreground">No activity recorded yet.</div>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="grid grid-cols-[46px_1fr] gap-2.5 px-3.5 py-2 border-b border-border/50 last:border-0">
                    <span className="font-display text-[10px] text-muted-foreground pt-0.5">
                      {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[12.5px] leading-snug text-muted-foreground">
                      <b className="text-foreground font-semibold">{a.actor ?? "System"}</b>{" "}
                      {a.description ?? a.type}
                      <span className="font-display text-[9px] uppercase tracking-[0.08em] border border-border rounded px-1 py-px ml-1.5 whitespace-nowrap">
                        {a.type}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5">
              <SectionHead title="System & compliance" action="Observability" actionTo="/admin/observability" />
              <div className="rounded-lg border border-border/55 bg-card/60">
                {[
                  ["Submissions unreviewed", counts.unreviewedSubmissions, "/admin/web-submissions"],
                  ["Deletion requests pending", counts.openDeletionRequests, "/admin/deletion-requests"],
                  ["Tickets unassigned", counts.unassignedTickets, "/support"],
                  ["Tickets breaching SLA", counts.breachingTickets, "/support"],
                ].map(([label, n, to]) => (
                  <Link key={String(label)} to={String(to)} className="grid grid-cols-[9px_1fr_auto] items-center gap-2.5 px-3.5 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                    <span className={cn("h-[7px] w-[7px] rounded-full", Number(n) > 0 ? "bg-warning" : "bg-success")} />
                    <span className="text-[12.5px]">{label}</span>
                    <span className={cn("font-display text-[10.5px] tabular-nums", Number(n) > 0 ? "text-warning" : "text-muted-foreground")}>
                      {Number(n) > 0 ? `${n} outstanding` : "Clear"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ── 4. Jump to ─────────────────────────────────────── */}
        <section className="mt-7">
          <SectionHead title="Jump to" note="29 surfaces" />
          <div className="rounded-lg border border-border/55 bg-card/60 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {JUMP.map((col, i) => (
              <div
                key={col.title}
                className={cn(
                  "px-4 py-3 border-border/50",
                  i < JUMP.length - 1 && "xl:border-r",
                  i % 2 === 0 && "md:border-r xl:border-r",
                  i < 2 && "md:border-b xl:border-b-0",
                )}
              >
                <h3 className="font-display text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground mb-2">
                  {col.title}
                </h3>
                <div className="flex flex-wrap gap-y-0.5">
                  {col.links.map(([label, to]) => (
                    <Link
                      key={to}
                      to={to}
                      className="text-[12.5px] text-muted-foreground hover:text-foreground py-1 pr-2 mr-2 whitespace-nowrap"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </AppLayout>
  );
}
