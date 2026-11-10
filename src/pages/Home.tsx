import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowRight, CalendarDays, Check, Clock, Mail, Plus, Search, TrendingDown, TrendingUp, UserPlus,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useOperationsHome, type DealBucket, type DealRow, type QueueItem } from "@/hooks/useOperationsHome";
import { Input } from "@/components/ui/input";
import { EMAIL_TO_USER, OUTCOME_CONFIG, resolveDisplayName, type OutcomeStatus } from "@/types/opportunity";
import { pctChange, type BookMonth, type FunnelStats, type MerchantRow, type MerchantTrend, type RepActivity } from "@/lib/opsMetrics";
import type { BookOfBusiness } from "@/hooks/useOperationsHome";
import { type AttentionTone } from "@/lib/dealAttention";
import { cn } from "@/lib/utils";
import { SentEmailDialog } from "@/components/SentEmailDialog";
import { isViewableEmailActivity } from "@/lib/emailActivity";

/** "Today" / "Yesterday" / "2 Nov" (plus year when not this year). */
function activityDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "2-digit" } : {}),
  });
}

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

/** Cents matter while our monthly revenue is still small; drop them from $100. */
const moneyFine = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0,
    minimumFractionDigits: Math.abs(n) < 100 ? 2 : 0,
  }).format(n);

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

const monthLabel = (m: BookMonth | null) =>
  m ? m.start.toLocaleDateString([], { month: "short", year: "numeric" }) : "—";

/** "+12%" / "−40%" against the comparison month, or a plain caption. */
function vsPrevious(current: number | undefined, previous: number | undefined, prevLabel: string) {
  const pct = current != null && previous != null ? pctChange(current, previous) : null;
  if (pct == null) return { delta: "no prior month", dir: "flat" as const };
  const rounded = Math.round(pct);
  return {
    delta: `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)}% vs ${prevLabel}`,
    dir: rounded > 0 ? ("up" as const) : rounded < 0 ? ("down" as const) : ("flat" as const),
  };
}

const TREND_LABEL: Record<MerchantTrend, string> = {
  quiet: "Gone quiet",
  down: "Volume down",
  new: "New",
  up: "Volume up",
  steady: "Steady",
};

const TREND_CLASS: Record<MerchantTrend, string> = {
  quiet: "text-primary border-primary/40 bg-primary/10",
  down: "text-warning border-warning/40 bg-warning/10",
  new: "text-success border-success/40 bg-success/10",
  up: "text-success border-success/40 bg-success/10",
  steady: "text-muted-foreground border-border bg-muted/40",
};

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

/**
 * What the book actually did. Monthly totals are the freshest sync of each
 * month; per-merchant rows are the latest complete *saved* period, labelled
 * with its save date, because the sync does not save on its own.
 */
function BookSection({ book }: { book: BookOfBusiness }) {
  const recent = book.months.slice(-6);
  const maxVol = Math.max(1, ...recent.map((m) => m.volume));
  const lastSync = book.months.reduce<string | null>(
    (latest, m) => (!latest || m.syncedAt > latest ? m.syncedAt : latest),
    null,
  );
  const stale = lastSync ? Date.now() - new Date(lastSync).getTime() > 7 * 86_400_000 : true;
  const flagged = book.merchants.filter((m) => m.trend === "quiet" || m.trend === "down").length;

  return (
    <section className="mt-7">
      <SectionHead
        title="Book of business"
        count={flagged || undefined}
        note={lastSync ? `NMI sync ${shortDay(lastSync)}` : "Never synced"}
        action="Commissions"
        actionTo="/commissions"
      />
      {stale && !book.loading && (
        <div className="mb-2 rounded-md border border-warning/45 bg-warning/10 px-3 py-2 text-[12px]">
          <b className="font-semibold">These figures may be out of date.</b>{" "}
          <span className="text-muted-foreground">
            {lastSync ? `The last NMI sync ran ${shortDay(lastSync)}.` : "NMI has never been synced."} Run a sync from
            Commissions to refresh them.
          </span>
        </div>
      )}
      {book.error ? (
        <div className="rounded-lg border border-primary/45 bg-primary/10 px-3.5 py-2.5 text-[12.5px]">
          <b className="font-semibold">The book didn't load.</b> <span className="text-muted-foreground">{book.error}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
          {/* Monthly volume */}
          <div className="rounded-lg border border-border/55 bg-card/60 p-3.5">
            <div className="font-display text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground mb-3">
              Processing volume by month
            </div>
            {book.loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : recent.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-muted-foreground">No synced months yet.</div>
            ) : (
              <div className="space-y-1.5">
                {recent.map((m) => (
                  <div key={`${m.year}-${m.month}`} className="grid grid-cols-[64px_1fr_76px] items-center gap-2.5">
                    <span className="font-display text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      {monthLabel(m)}
                    </span>
                    <span className="h-[9px] rounded-sm bg-muted overflow-hidden">
                      <i
                        className={cn("block h-full", m.complete ? "bg-foreground/45" : "bg-foreground/20")}
                        style={{ width: `${(m.volume / maxVol) * 100}%` }}
                      />
                    </span>
                    <span className="font-display text-[11px] text-right tabular-nums">
                      {compact(m.volume)}
                      {!m.complete && (
                        <span className="block text-[8.5px] uppercase tracking-[0.06em] text-muted-foreground">
                          {m === book.inProgress ? "to date" : "partial"}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <p className="pt-1.5 text-[10.5px] text-muted-foreground">
                  Faded bars are months whose last sync ran before the month ended.
                </p>
              </div>
            )}
          </div>

          {/* Per merchant */}
          <div className="rounded-lg border border-border/55 bg-card/60 overflow-x-auto">
            <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
              <span className="font-display text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground">
                By merchant
              </span>
              {book.merchantPeriod && (
                <span className="text-[10.5px] text-muted-foreground ml-auto">
                  {new Date(`${book.merchantPeriod.period_start}T12:00:00`).toLocaleDateString([], {
                    month: "long",
                    year: "numeric",
                  })}
                  {book.merchantPeriod.fetched_at && ` · saved ${shortDay(book.merchantPeriod.fetched_at)}`}
                </span>
              )}
            </div>
            {book.loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : book.merchants.length === 0 ? (
              <div className="p-6 text-center text-[12.5px] text-muted-foreground">
                No complete month has been saved yet. Sync a finished month with "save" on Commissions to see
                per-merchant change.
              </div>
            ) : (
              <table className="w-full text-sm min-w-[460px]">
                <thead>
                  <tr className="border-y border-border/50 text-left">
                    {["Merchant", "Volume", "Txns", "Change", ""].map((h, i) => (
                      <th
                        key={i}
                        className={cn(
                          "font-display text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground px-3.5 py-1.5",
                          i > 0 && i < 4 && "text-right",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {book.merchants.map((m: MerchantRow) => (
                    <tr key={m.accountId ?? m.name} className="border-b border-border/50 last:border-0">
                      <td className="px-3.5 py-2 text-[12.5px] font-medium max-w-[220px] truncate">
                        {m.accountId ? (
                          <Link to={`/live-billing/${m.accountId}`} className="hover:underline">{m.name}</Link>
                        ) : (
                          m.name
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-right font-display text-[12px] tabular-nums">{money(m.volume)}</td>
                      <td className="px-3.5 py-2 text-right font-display text-[12px] tabular-nums">{m.transactions}</td>
                      <td
                        className={cn(
                          "px-3.5 py-2 text-right font-display text-[11px] tabular-nums",
                          m.change == null ? "text-muted-foreground" : m.change < 0 ? "text-primary" : "text-success",
                        )}
                      >
                        {m.change == null ? "—" : `${m.change > 0 ? "+" : ""}${Math.round(m.change)}%`}
                      </td>
                      <td className="px-3.5 py-2 text-right">
                        <span
                          className={cn(
                            "font-display text-[9px] uppercase tracking-[0.08em] border rounded px-1.5 py-px whitespace-nowrap",
                            TREND_CLASS[m.trend],
                          )}
                        >
                          {TREND_LABEL[m.trend]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const outcomeLabel = (outcome: string) =>
  outcome === "no_outcome"
    ? "No outcome recorded"
    : (OUTCOME_CONFIG[outcome as OutcomeStatus]?.label ?? outcome.replace(/_/g, " "));

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/** Deals in, deals out, and why the lost ones died. */
function FunnelSection({ funnel, ladder }: { funnel: FunnelStats; ladder: { stage: string; label: string; count: number; flagged: number }[] }) {
  const maxReason = Math.max(1, ...funnel.lossReasons.map((r) => r.count));
  const openStages = ladder.filter((l) => l.count > 0);
  return (
    <section>
      <SectionHead title="Funnel" note={`Last ${funnel.windowDays} days`} action="Reports" actionTo="/reports" />
      <div className="rounded-lg border border-border/55 bg-card/60">
        <div className="grid grid-cols-4 divide-x divide-border/50 border-b border-border/50">
          {[
            ["Created", String(funnel.created)],
            ["Won", String(funnel.won)],
            ["Lost", String(funnel.lost)],
            ["Win rate", pct(funnel.winRate)],
          ].map(([label, value]) => (
            <div key={label} className="px-3.5 py-3">
              <div className="font-display text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground">{label}</div>
              <div className="font-display text-[20px] font-bold tabular-nums mt-1">{value}</div>
            </div>
          ))}
        </div>
        <div className="px-3.5 pt-3 pb-1 text-[11px] text-muted-foreground">
          All time: {funnel.allTime.won} won of {funnel.allTime.decided} decided ({pct(funnel.allTime.winRate)}).
        </div>

        <div className="px-3.5 py-2.5">
          <div className="font-display text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground mb-2">
            Why deals were lost
          </div>
          {funnel.lossReasons.length === 0 ? (
            <div className="text-[12.5px] text-muted-foreground pb-1">No deals lost in this window.</div>
          ) : (
            <div className="space-y-1.5">
              {funnel.lossReasons.map((r) => (
                <div key={r.outcome} className="grid grid-cols-[150px_1fr_28px] items-center gap-2.5">
                  <span className="text-[12px] truncate">{outcomeLabel(r.outcome)}</span>
                  <span className="h-[7px] rounded-sm bg-muted overflow-hidden">
                    <i className="block h-full bg-foreground/35" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </span>
                  <span className="font-display text-[11px] text-right tabular-nums">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3.5 py-2.5 border-t border-border/50">
          <div className="font-display text-[9.5px] uppercase tracking-[0.13em] text-muted-foreground mb-1.5">
            Open now, by stage
          </div>
          {openStages.length === 0 ? (
            <div className="text-[12.5px] text-muted-foreground">No open deals.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {openStages.map((l) => (
                <Link
                  key={l.stage}
                  to={`/opportunities?stage=${l.stage}`}
                  className={cn(
                    "text-[11.5px] rounded border px-2 py-0.5 hover:bg-muted/50 transition-colors",
                    l.flagged ? "border-primary/40 text-primary" : "border-border/60 text-muted-foreground",
                  )}
                >
                  {l.label} <b className="tabular-nums">{l.count}</b>
                  {l.flagged > 0 && ` · ${l.flagged} flagged`}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Who did the work this week, by kind, against the week before. */
function TeamSection({ team }: { team: RepActivity[] }) {
  return (
    <section>
      <SectionHead title="Team activity" note="Last 7 days" />
      <div className="rounded-lg border border-border/55 bg-card/60 overflow-x-auto">
        {team.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-muted-foreground">
            No emails, tasks, stage moves or notes logged in the last two weeks.
          </div>
        ) : (
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-border/50 text-left">
                {["Rep", "Emails", "Tasks done", "Moves", "Notes", "Total"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "font-display text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2",
                      i > 0 && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((r) => {
                const delta = r.thisWeekTotal - r.lastWeekTotal;
                return (
                  <tr key={r.actor} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-[12.5px] font-medium truncate max-w-[160px]">{resolveDisplayName(r.actor)}</td>
                    {(["emails", "tasks", "moves", "notes"] as const).map((k) => (
                      <td key={k} className={cn("px-3 py-2 text-right font-display text-[12px] tabular-nums", !r.thisWeek[k] && "text-muted-foreground/50")}>
                        {r.thisWeek[k]}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-display text-[12px] tabular-nums">
                      <b>{r.thisWeekTotal}</b>
                      <span
                        className={cn(
                          "block text-[9.5px] font-normal",
                          delta > 0 ? "text-success" : delta < 0 ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {delta === 0 ? "same as last wk" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs last wk`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

const BUCKET_LABEL: Record<DealBucket | "all", string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  all: "All",
};

const BUCKET_TEXT: Record<DealBucket, string> = {
  open: "text-foreground",
  won: "text-success",
  lost: "text-muted-foreground",
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "2-digit" } : {}),
  });

/** Every deal in the book — open, won and lost — searchable and filterable. */
function AllDeals({ deals, loading }: { deals: DealRow[]; loading: boolean }) {
  const navigate = useNavigate();
  const [bucket, setBucket] = useState<DealBucket | "all">("open");
  const [owner, setOwner] = useState<"all" | "mine">("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const scoped = owner === "mine" ? deals.filter((d) => d.mine) : deals;
    return {
      open: scoped.filter((d) => d.bucket === "open").length,
      won: scoped.filter((d) => d.bucket === "won").length,
      lost: scoped.filter((d) => d.bucket === "lost").length,
      all: scoped.length,
    };
  }, [deals, owner]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deals.filter(
      (d) =>
        (bucket === "all" || d.bucket === bucket) &&
        (owner === "all" || d.mine) &&
        (!needle ||
          d.merchant.toLowerCase().includes(needle) ||
          d.ownerName.toLowerCase().includes(needle) ||
          d.stageLabel.toLowerCase().includes(needle)),
    );
  }, [deals, bucket, owner, q]);

  return (
    <section className="mt-7">
      <SectionHead title="All deals" count={counts.all} note="Every deal in the book" action="Opportunities" actionTo="/opportunities" />
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex rounded-md border border-border/60 overflow-hidden">
          {(["open", "won", "lost", "all"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              aria-pressed={bucket === b}
              className={cn(
                "h-7 px-2.5 font-display text-[9.5px] uppercase tracking-[0.1em] border-l first:border-l-0 border-border/60 transition-colors",
                bucket === b ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BUCKET_LABEL[b]} <span className="tabular-nums opacity-70">{counts[b]}</span>
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-border/60 overflow-hidden">
          {(["all", "mine"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOwner(o)}
              aria-pressed={owner === o}
              className={cn(
                "h-7 px-2.5 font-display text-[9.5px] uppercase tracking-[0.1em] border-l first:border-l-0 border-border/60 transition-colors",
                owner === o ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o === "all" ? "Everyone" : "Mine"}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant, owner or stage"
            className="h-8 pl-8 text-xs"
            aria-label="Search deals"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/55 bg-card/60 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading deals…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">No deals match.</div>
        ) : (
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-border/50 text-left">
                {["Merchant", "Stage", "Status", "Owner", "Est. /mo", "Updated"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "font-display text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground px-3.5 py-2",
                      i === 4 && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.opportunity.id}
                  onClick={() => navigate(`/opportunities/${d.opportunity.id}`)}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="px-3.5 py-2.5 font-semibold text-[13px] max-w-[260px] truncate">
                    <Link
                      to={`/opportunities/${d.opportunity.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {d.merchant}
                    </Link>
                  </td>
                  <td className="px-3.5 py-2.5 font-display text-[10px] uppercase tracking-[0.07em] text-muted-foreground whitespace-nowrap">
                    {d.stageLabel}
                  </td>
                  <td className={cn("px-3.5 py-2.5 text-xs whitespace-nowrap", BUCKET_TEXT[d.bucket])}>
                    {d.bucket === "open" ? "Open" : d.outcomeLabel}
                  </td>
                  <td className={cn("px-3.5 py-2.5 text-xs whitespace-nowrap", d.owner ? "text-muted-foreground" : "text-primary")}>
                    {d.ownerName}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-display text-[12.5px] tabular-nums whitespace-nowrap">
                    {d.value > 0 ? money(d.value) : "—"}
                  </td>
                  <td className="px-3.5 py-2.5 font-display text-[10.5px] text-muted-foreground whitespace-nowrap">
                    {shortDate(d.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
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
  const [viewEmailActivityId, setViewEmailActivityId] = useState<string | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);

  const {
    loading, error, now, today, steady, ladder, counts, activity, deals,
    book, liveMerchants, funnel, coverage, team,
  } = useOperationsHome({ email, name: displayName }, isAdmin && scope === "all");

  const tiles = useMemo(() => {
    const cur = book.current;
    const prevLabel = monthLabel(book.previous);
    const volumeDelta = vsPrevious(cur?.volume, book.previous?.volume, prevLabel);
    const revenueDelta = vsPrevious(cur?.revenue, book.previous?.revenue, prevLabel);

    const live = {
      label: "Live merchants",
      value: String(liveMerchants),
      delta: cur ? `${cur.merchants} processed in ${monthLabel(cur)}` : "won accounts",
      dir: "flat" as const,
      to: "/live-billing",
    };
    const volume = {
      label: cur ? `Volume · ${monthLabel(cur)}` : "Processing volume",
      value: cur ? compact(cur.volume) : "—",
      unit: cur ? ` · ${cur.transactions} txns` : undefined,
      ...(cur ? volumeDelta : { delta: "no complete month synced", dir: "flat" as const }),
      to: "/commissions",
      attn: volumeDelta.dir === "down",
    };
    const revenue = {
      label: cur ? `Our revenue · ${monthLabel(cur)}` : "Our revenue",
      value: cur ? moneyFine(cur.revenue) : "—",
      ...(cur ? { ...revenueDelta, delta: `residual + gateway · ${revenueDelta.delta}` } : { delta: "no complete month synced", dir: "flat" as const }),
      to: "/commissions",
    };
    const winRate = {
      label: `Win rate · ${funnel.windowDays}d`,
      value: pct(funnel.winRate),
      delta: `${funnel.won} won · ${funnel.lost} lost`,
      dir: "flat" as const,
      to: "/reports",
    };
    const activeDeals = {
      label: "Active deals",
      value: String(counts.activeDeals),
      delta: counts.stalled ? `${counts.stalled} stalled 14d+` : `${steady} steady`,
      dir: counts.stalled ? ("down" as const) : ("flat" as const),
      to: "/pipeline",
      attn: counts.stalled > 0,
    };
    const pipeline = {
      label: "Weighted pipeline",
      value: compact(counts.weightedPipeline),
      unit: "/mo",
      // The estimate needs a monthly volume; say how many deals carry one.
      delta: `${coverage.valued} of ${coverage.total} deals have volume`,
      dir: "flat" as const,
      to: "/pipeline",
    };
    const tickets = {
      label: "Open tickets",
      value: String(counts.openTickets),
      delta: counts.breachingTickets ? `${counts.breachingTickets} breaching SLA` : `${counts.unassignedTickets} unassigned`,
      dir: counts.breachingTickets ? ("down" as const) : ("flat" as const),
      to: "/support",
      attn: counts.breachingTickets > 0,
    };

    if (role === "support") {
      return [
        tickets,
        { label: "Breaching SLA", value: String(counts.breachingTickets), delta: counts.breachingTickets ? "past response budget" : "all inside SLA", dir: counts.breachingTickets ? ("down" as const) : ("flat" as const), to: "/support", attn: counts.breachingTickets > 0 },
        { label: "Unassigned tickets", value: String(counts.unassignedTickets), delta: counts.unassignedTickets ? "nobody owns these" : "all owned", dir: counts.unassignedTickets ? ("down" as const) : ("flat" as const), to: "/support" },
        live,
        volume,
        activeDeals,
      ];
    }
    if (role === "admin") return [volume, revenue, live, winRate, activeDeals, tickets];
    if (role === "am") return [live, volume, revenue, tickets, winRate, activeDeals];
    return [activeDeals, pipeline, winRate, live, volume, revenue];
  }, [role, counts, steady, book, liveMerchants, funnel, coverage]);

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
                <><b className="text-foreground font-bold">{liveMerchants}</b> live merchants</>,
                <><b className="text-foreground font-bold">{book.current ? compact(book.current.volume) : "—"}</b> volume {book.current ? monthLabel(book.current) : ""}</>,
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

        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-primary/45 bg-primary/10 px-3.5 py-2.5 text-[12.5px]">
            <b className="font-semibold">Deals didn't load.</b>{" "}
            <span className="text-muted-foreground">{error}</span>
          </div>
        )}

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

        {/* ── 2. At a glance ─────────────────────────────────── */}
        <section className="mt-7">
          <SectionHead title="At a glance" note={ROLE_LABEL[role]} />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
            {tiles.map((t) => <Tile key={t.label} {...t} />)}
          </div>
        </section>

        {/* ── 3. Book of business ────────────────────────────── */}
        <BookSection book={book} />

        {/* ── 4. Funnel + team ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-7 items-start">
          <FunnelSection funnel={funnel} ladder={ladder} />
          <TeamSection team={team} />
        </div>

        {/* ── 5. Latest activity + system ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-6 mt-7 items-start">
          <section>
            <SectionHead title="Latest activity" note={showAllActivity ? "Last 10" : "Last 5"} />
            <div className="rounded-lg border border-border/55 bg-card/60">
              {activity.length === 0 ? (
                <div className="p-6 text-center text-[12.5px] text-muted-foreground">No activity recorded yet.</div>
              ) : (
                <>
                  {(showAllActivity ? activity : activity.slice(0, 5)).map((a) => (
                    <div key={a.id} className="grid grid-cols-[58px_1fr] gap-2.5 px-3.5 py-2 border-b border-border/50 last:border-0">
                      <span
                        className="font-display text-[10px] text-muted-foreground pt-0.5 leading-tight"
                        title={new Date(a.at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}
                      >
                        <span className="block text-foreground/70">{activityDayLabel(a.at)}</span>
                        {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-[12.5px] leading-snug text-muted-foreground">
                        <b className="text-foreground font-semibold">{a.actor ? resolveDisplayName(a.actor) : "System"}</b>{" "}
                        {a.description ?? a.type.replace(/_/g, " ")}
                        {isViewableEmailActivity(a.type, a.description) && (
                          <button
                            type="button"
                            onClick={() => setViewEmailActivityId(a.id)}
                            className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline whitespace-nowrap"
                          >
                            <Mail className="h-3 w-3" />
                            View email
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  {activity.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllActivity((v) => !v)}
                      className="w-full px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground text-left"
                    >
                      {showAllActivity ? "Show fewer" : `Show ${activity.length - 5} more`}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          <section>
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
          </section>
        </div>

        <AllDeals deals={deals} loading={loading} />

        {/* ── 6. Jump to ─────────────────────────────────────── */}
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
      <SentEmailDialog
        activityId={viewEmailActivityId}
        onOpenChange={(open) => !open && setViewEmailActivityId(null)}
      />
    </AppLayout>
  );
}
