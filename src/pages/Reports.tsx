import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_CONFIG, TEAM_MEMBERS, OpportunityStage } from "@/types/opportunity";
import { useTasks } from "@/contexts/TasksContext";
import { Task } from "@/types/task";
import type { OutreachCampaign } from "@/types/db";
import DateRangeFilter from "@/components/DateRangeFilter";
import ReportDetailModal from "@/components/ReportDetailModal";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay, subDays, differenceInDays, format, subMonths, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, Legend, FunnelChart, Funnel, LabelList, AreaChart, Area,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, PieChartIcon, TrendingUp, Users, CheckCircle2, Clock, AlertTriangle,
  Target, Layers, Mail, Send, MessageSquare, ArrowUpRight, ArrowDownRight,
  Minus, Trophy, Zap, Activity, RefreshCw, Filter, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { aggregateLossReasons, lossesByStage, lossesByTier } from "@/lib/lossReasons";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OppData {
  id: string;
  stage: OpportunityStage;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  status: string | null;
  stage_entered_at?: string | null;
  outcome_status?: string | null;
  outcome_reason?: string | null;
  gateway_tier?: string | null;
  account?: { name: string } | null;
  contact?: { first_name: string | null; last_name: string | null } | null;
}

interface ActivityData {
  id: string; type: string; created_at: string; opportunity_id: string;
}

interface ModalState {
  open: boolean; title: string; description: string;
  type: "opportunities" | "tasks";
  opportunities: OppData[]; tasks: Task[];
}

// ─── Chart palette ────────────────────────────────────────────────────────────
const P = {
  primary:  "hsl(var(--primary))",
  blue:     "hsl(217, 91%, 60%)",
  emerald:  "hsl(160, 84%, 39%)",
  amber:    "hsl(38, 92%, 50%)",
  violet:   "hsl(263, 70%, 50%)",
  rose:     "hsl(350, 89%, 60%)",
  teal:     "hsl(175, 77%, 40%)",
};
const PALETTE = Object.values(P);

// ─── KPI Delta badge ──────────────────────────────────────────────────────────
function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" />No change</span>;
  const up = value > 0;
  return (
    <span className={cn("text-[10px] font-medium flex items-center gap-0.5", up ? "text-emerald-500" : "text-destructive")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{value}{suffix} vs prev period
    </span>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, icon: Icon, color, bg, delta, suffix, onClick }: {
  label: string; value: string | number; icon: any;
  color: string; bg: string; delta?: number; suffix?: string; onClick?: () => void;
}) {
  return (
    <Card className={cn("border-border/60 transition-all", onClick && "cursor-pointer hover:border-primary/40 hover:shadow-sm")} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", bg)}>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
          {delta !== undefined && <Delta value={delta} suffix={suffix} />}
        </div>
        <p className={cn("text-2xl font-bold", color)}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, description }: { icon: any; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const Reports = () => {
  const { tasks } = useTasks();
  const [opps, setOpps]             = useState<OppData[]>([]);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [campaigns, setCampaigns]   = useState<OutreachCampaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dateRange, setDateRange]   = useState<DateRange | undefined>();
  const [filterBy]                  = useState<"created_at" | "updated_at">("created_at");
  const [modalState, setModalState] = useState<ModalState>({
    open: false, title: "", description: "", type: "opportunities", opportunities: [], tasks: [],
  });

  const inRange = (dateStr: string) => {
    if (!dateRange?.from) return true;
    const d = new Date(dateStr);
    return isWithinInterval(d, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to || dateRange.from) });
  };

  const filteredOpps  = useMemo(() => opps.filter(o => inRange(o[filterBy])), [opps, dateRange, filterBy]);
  const filteredActs  = useMemo(() => activities.filter(a => inRange(a.created_at)), [activities, dateRange]);
  const filteredTasks = useMemo(() => tasks.filter(t => t.source !== 'sla' && inRange(t.createdAt)), [tasks, dateRange]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [oppRes, actRes, campRes] = await Promise.all([
      supabase.from("opportunities").select("id, stage, assigned_to, created_at, updated_at, status, stage_entered_at, outcome_status, outcome_reason, gateway_tier, account:accounts(name), contact:contacts(first_name, last_name)"),
      supabase.from("activities").select("id, type, created_at, opportunity_id").order("created_at", { ascending: false }).limit(1000),
      supabase.from("outreach_campaigns").select("*").order("created_at", { ascending: false }),
    ]);
    if (oppRes.data)  setOpps(oppRes.data as OppData[]);
    if (actRes.data)  setActivities(actRes.data as ActivityData[]);
    if (campRes.data) setCampaigns(campRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Pipeline funnel ──
  const funnelData = useMemo(() => {
    const order: OpportunityStage[] = [
      "discovery", "application_prep", "underwriting_review", "processor_approval", "integration_setup", "go_live_ready"
    ];
    return order.map(stage => ({
      stage,
      label: STAGE_CONFIG[stage]?.label || stage,
      count: filteredOpps.filter(o => o.stage === stage && o.status !== "dead").length,
    })).filter(d => d.count > 0);
  }, [filteredOpps]);

  // ── Stage distribution (bar) ──
  const stageData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOpps.forEach(o => { if (o.status !== "dead") counts[o.stage] = (counts[o.stage] || 0) + 1; });
    return Object.entries(counts).map(([stage, count]) => ({
      stage: STAGE_CONFIG[stage as OpportunityStage]?.label || stage, stageKey: stage, count,
    }));
  }, [filteredOpps]);

  // ── Team workload ──
  const teamData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOpps.forEach(o => { if (o.status !== "dead" && o.assigned_to) counts[o.assigned_to] = (counts[o.assigned_to] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filteredOpps]);

  // ── Leaderboard (closed + converted) ──
  const leaderboard = useMemo(() => {
    const data: Record<string, { won: number; total: number; name: string }> = {};
    TEAM_MEMBERS.forEach(m => { data[m] = { name: m, won: 0, total: 0 }; });
    filteredOpps.forEach(o => {
      if (!o.assigned_to) return;
      if (!data[o.assigned_to]) data[o.assigned_to] = { name: o.assigned_to, won: 0, total: 0 };
      data[o.assigned_to].total++;
      if (o.stage === "go_live_ready" || o.outcome_status === "closed_won") data[o.assigned_to].won++;
    });
    return Object.values(data).sort((a, b) => b.won - a.won).filter(d => d.total > 0);
  }, [filteredOpps]);

  // ── Weekly trend (last 8 weeks) ──
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = startOfWeek(subDays(now, (7 - i) * 7));
      const end   = endOfWeek(start);
      return {
        week: format(start, "MMM d"),
        opps: filteredOpps.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; }).length,
        activities: filteredActs.filter(a => { const d = new Date(a.created_at); return d >= start && d <= end; }).length,
      };
    });
    return weeks;
  }, [filteredOpps, filteredActs]);

  // ── Task metrics ──
  const taskStatus = useMemo(() => {
    const open = filteredTasks.filter(t => t.status === "open").length;
    const wip  = filteredTasks.filter(t => t.status === "in_progress").length;
    const done = filteredTasks.filter(t => t.status === "done").length;
    return [
      { name: "Open",        value: open, color: "hsl(var(--destructive))", statusKey: "open" },
      { name: "In Progress", value: wip,  color: P.amber,                    statusKey: "in_progress" },
      { name: "Done",        value: done, color: P.emerald,                  statusKey: "done" },
    ];
  }, [filteredTasks]);

  // ── Outreach funnel ──
  const outreachMetrics = useMemo(() => {
    const total  = campaigns.reduce((a, c) => a + (c.total_contacts || 0), 0);
    const sent   = campaigns.reduce((a, c) => a + (c.sent_count || 0), 0);
    const reply  = campaigns.reduce((a, c) => a + (c.replied_count || 0), 0);
    const conv   = campaigns.reduce((a, c) => a + (c.converted_count || 0), 0);
    return { total, sent, reply, conv, replyRate: sent > 0 ? ((reply/sent)*100).toFixed(1) : "0", convRate: reply > 0 ? ((conv/reply)*100).toFixed(1) : "0" };
  }, [campaigns]);

  // ── Top KPIs ──
  const kpis = useMemo(() => {
    const active    = filteredOpps.filter(o => o.status !== "dead").length;
    const live      = filteredOpps.filter(o => o.outcome_status === 'closed_won').length;
    const openTasks = filteredTasks.filter(t => t.status !== "done").length;
    const overdue   = filteredTasks.filter(t => t.dueAt && t.status !== "done" && new Date(t.dueAt) < new Date()).length;
    return { active, live, openTasks, overdue };
  }, [filteredOpps, filteredTasks]);

  // ── Click handlers ──
  const openModal = (title: string, description: string, type: "opportunities" | "tasks", opps: OppData[], tasks: Task[]) =>
    setModalState({ open: true, title, description, type, opportunities: opps, tasks });

  // ── Custom tooltip ──
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg shadow-md px-3 py-2 text-xs">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <AppLayout pageTitle="Reports">
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading analytics…</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout pageTitle="Reports">
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Header ── */}
        <PageHeader
          icon={BarChart3}
          title="Analytics & Reports"
          description="Pipeline performance · Team productivity · Outreach metrics"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} filterBy="created_at" onFilterByChange={() => {}} />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchData}>
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-8">

          {/* ══ TOP KPIS ══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
            <StatCard label="Active Opportunities" value={kpis.active}   icon={Target}       color="primary"
              onClick={() => openModal("Active Opportunities", `${kpis.active} active`, "opportunities", filteredOpps.filter(o => o.status !== "dead"), [])} />
            <StatCard label="Closed Won"            value={kpis.live}     icon={Zap}          color="success"
              onClick={() => openModal("Closed Won", `${kpis.live} won`, "opportunities", filteredOpps.filter(o => o.outcome_status === "closed_won"), [])} />
            <StatCard label="Open Tasks"            value={kpis.openTasks}icon={Clock}        color="teal"
              onClick={() => openModal("Open Tasks", `${kpis.openTasks} open`, "tasks", [], filteredTasks.filter(t => t.status !== "done"))} />
            <StatCard label="Overdue Tasks"         value={kpis.overdue}  icon={AlertTriangle} color="destructive"
              onClick={() => openModal("Overdue Tasks", `${kpis.overdue} overdue`, "tasks", [], filteredTasks.filter(t => t.dueAt && t.status !== "done" && new Date(t.dueAt) < new Date()))} />
          </div>

          {/* ══ PIPELINE FUNNEL ══ */}
          <section>
            <SectionHeader icon={Target} title="Pipeline Funnel" description="Click any stage to drill into the opportunities" />
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Visual funnel */}
              <Card className="lg:col-span-2 border-border/60">
                <CardContent className="pt-4">
                  {funnelData.length === 0 ? (
                    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No pipeline data</div>
                  ) : (
                    <div className="space-y-2">
                      {funnelData.map((stage, i) => {
                        const maxCount = Math.max(...funnelData.map(s => s.count));
                        const pct = Math.round((stage.count / maxCount) * 100);
                        const dropPct = i > 0 ? Math.round(((funnelData[i-1].count - stage.count) / funnelData[i-1].count) * 100) : null;
                        return (
                          <div key={stage.stage}
                            className="cursor-pointer group"
                            onClick={() => openModal(
                              stage.label, `${stage.count} opportunities in ${stage.label}`, "opportunities",
                              filteredOpps.filter(o => o.stage === stage.stage && o.status !== "dead"), []
                            )}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{stage.label}</span>
                              <div className="flex items-center gap-2">
                                {dropPct !== null && (
                                  <span className={cn("text-[10px]", dropPct > 50 ? "text-destructive" : dropPct > 25 ? "text-amber-500" : "text-muted-foreground")}>
                                    ↓{dropPct}%
                                  </span>
                                )}
                                <span className="text-xs font-bold text-foreground w-6 text-right">{stage.count}</span>
                              </div>
                            </div>
                            <div className="h-8 rounded-md bg-muted/40 overflow-hidden">
                              <div
                                className="h-full rounded-md transition-all duration-500 flex items-center px-3"
                                style={{
                                  width: `${pct}%`,
                                  background: `linear-gradient(90deg, hsl(var(--primary) / 0.8), hsl(var(--primary)))`,
                                }}
                              >
                                {pct > 20 && <span className="text-[10px] font-medium text-primary-foreground">{stage.label}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stage table */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Stage Breakdown</CardTitle>
                  <CardDescription className="text-xs">Click a row to drill down</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      {stageData.length === 0 ? (
                        <TableRow><TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-6">No data</TableCell></TableRow>
                      ) : stageData.map(row => (
                        <TableRow key={row.stage} className="cursor-pointer hover:bg-muted/30 border-border/40"
                          onClick={() => openModal(row.stage, `${row.count} opps`, "opportunities",
                            filteredOpps.filter(o => o.stage === row.stageKey && o.status !== "dead"), [])}>
                          <TableCell className="text-xs text-foreground py-2.5">{row.stage}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-bold text-primary">{row.count}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ══ WEEKLY TREND ══ */}
          <section>
            <SectionHeader icon={TrendingUp} title="Weekly Activity Trend" description="Opportunities created and activities logged over the last 8 weeks" />
            <Card className="border-border/60">
              <CardContent className="pt-4 h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyTrend}>
                    <defs>
                      <linearGradient id="gradOpps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={P.primary}  stopOpacity={0.3} />
                        <stop offset="95%" stopColor={P.primary}  stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradActs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={P.emerald} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={P.emerald} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="opps"       name="New Opps"   stroke={P.primary}  fill="url(#gradOpps)" strokeWidth={2} dot={{ fill: P.primary, r: 3 }} />
                    <Area type="monotone" dataKey="activities" name="Activities" stroke={P.emerald}  fill="url(#gradActs)" strokeWidth={2} dot={{ fill: P.emerald, r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          {/* ══ TEAM SECTION ══ */}
          <section>
            <SectionHeader icon={Users} title="Team Performance" description="Workload distribution and task completion" />
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Leaderboard */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />Conversion Leaderboard</CardTitle>
                  <CardDescription className="text-xs">Live accounts per team member</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40">
                        <TableHead className="text-[10px] w-8">#</TableHead>
                        <TableHead className="text-[10px]">Rep</TableHead>
                        <TableHead className="text-[10px] text-right">Pipeline</TableHead>
                        <TableHead className="text-[10px] text-right">Live</TableHead>
                        <TableHead className="text-[10px] text-right">Win %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No data</TableCell></TableRow>
                      ) : leaderboard.map((rep, i) => {
                        const winPct = rep.total > 0 ? Math.round((rep.won / rep.total) * 100) : 0;
                        return (
                          <TableRow key={rep.name} className="cursor-pointer hover:bg-muted/30 border-border/40"
                            onClick={() => openModal(`${rep.name}'s Opportunities`, `${rep.total} total`, "opportunities",
                              filteredOpps.filter(o => o.assigned_to === rep.name && o.status !== "dead"), [])}>
                            <TableCell className="py-2.5 text-xs text-muted-foreground font-mono">
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                                  {rep.name[0]}
                                </div>
                                <span className="text-xs font-medium text-foreground">{rep.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-xs font-medium">{rep.total}</TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className="text-xs font-bold text-emerald-500">{rep.won}</span>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className={cn("text-xs font-bold", winPct > 50 ? "text-emerald-500" : winPct > 25 ? "text-amber-500" : "text-muted-foreground")}>
                                {winPct}%
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Team workload bar */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-blue-500" />Workload Distribution</CardTitle>
                  <CardDescription className="text-xs">Click a bar to see opportunities</CardDescription>
                </CardHeader>
                <CardContent className="h-[220px]">
                  {teamData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No assignment data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Opportunities" fill={P.blue} radius={[0, 4, 4, 0]} className="cursor-pointer"
                          onClick={d => openModal(`${d.name}'s Opportunities`, `${d.count} opps`, "opportunities",
                            filteredOpps.filter(o => o.assigned_to === d.name && o.status !== "dead"), [])} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ══ TASKS SECTION ══ */}
          <section>
            <SectionHeader icon={CheckCircle2} title="Task Analytics" description="Status breakdown and team task performance" />
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Donut */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Task Status</CardTitle>
                  <CardDescription className="text-xs">Click a slice to drill down</CardDescription>
                </CardHeader>
                <CardContent className="h-[220px]">
                  {filteredTasks.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No tasks</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={taskStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                          paddingAngle={3} dataKey="value" className="cursor-pointer"
                          onClick={d => openModal(`Tasks: ${d.name}`, `${d.value} tasks`, "tasks", [],
                            filteredTasks.filter(t => t.status === d.statusKey))}>
                          {taskStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Team task bars */}
              <Card className="lg:col-span-2 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Team Task Performance</CardTitle>
                  <CardDescription className="text-xs">Open vs completed tasks per rep</CardDescription>
                </CardHeader>
                <CardContent className="h-[220px]">
                  {(() => {
                    const data = TEAM_MEMBERS.map(m => ({
                      name: m,
                      open: filteredTasks.filter(t => t.assignee === m && t.status !== "done").length,
                      done: filteredTasks.filter(t => t.assignee === m && t.status === "done").length,
                    })).filter(d => d.open > 0 || d.done > 0);
                    return data.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No task data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="open" name="Open"      fill={P.rose}    radius={[4,4,0,0]} className="cursor-pointer"
                            onClick={d => openModal(`${d.name}: Open Tasks`, "", "tasks", [], filteredTasks.filter(t => t.assignee === d.name && t.status !== "done"))} />
                          <Bar dataKey="done" name="Completed" fill={P.emerald} radius={[4,4,0,0]} className="cursor-pointer"
                            onClick={d => openModal(`${d.name}: Completed Tasks`, "", "tasks", [], filteredTasks.filter(t => t.assignee === d.name && t.status === "done"))} />
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ══ OUTREACH / EMAIL SECTION ══ */}
          <section>
            <SectionHeader icon={Mail} title="Email Outreach Performance" description="Cadence-level metrics across all lead lists" />

            {/* Outreach KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              {[
                { label: "Total Leads",   value: outreachMetrics.total, icon: Users,         color: "text-foreground",  bg: "bg-muted/60" },
                { label: "Emails Sent",   value: outreachMetrics.sent,  icon: Send,          color: "text-blue-500",    bg: "bg-blue-500/10" },
                { label: "Replied",       value: outreachMetrics.reply, icon: MessageSquare, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                { label: "Reply Rate",    value: `${outreachMetrics.replyRate}%`, icon: BarChart3, color: "text-amber-500", bg: "bg-amber-500/10" },
                { label: "Converted",     value: outreachMetrics.conv,  icon: TrendingUp,    color: "text-violet-500",  bg: "bg-violet-500/10" },
              ].map(k => (
                <Card key={k.label} className="border-border/60">
                  <CardContent className="p-3 flex items-center gap-2.5">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", k.bg)}>
                      <k.icon className={cn("h-4 w-4", k.color)} />
                    </div>
                    <div>
                      <p className={cn("text-xl font-bold leading-none", k.color)}>{k.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Per-campaign table */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Cadence Performance</CardTitle>
                <CardDescription className="text-xs">Reply rate and conversion by cadence</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {campaigns.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No cadences yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40">
                        <TableHead className="text-[10px]">Cadence</TableHead>
                        <TableHead className="text-[10px]">Status</TableHead>
                        <TableHead className="text-[10px] text-right">Leads</TableHead>
                        <TableHead className="text-[10px] text-right">Sent</TableHead>
                        <TableHead className="text-[10px] text-right">Replied</TableHead>
                        <TableHead className="text-[10px] text-right">Reply %</TableHead>
                        <TableHead className="text-[10px] text-right">Converted</TableHead>
                        <TableHead className="text-[10px] text-right">Conv %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map(c => {
                        const rr  = c.sent_count  > 0 ? ((c.replied_count   / c.sent_count)   * 100).toFixed(0) : "—";
                        const cr  = c.replied_count > 0 ? ((c.converted_count / c.replied_count) * 100).toFixed(0) : "—";
                        return (
                          <TableRow key={c.id} className="border-border/40 hover:bg-muted/20">
                            <TableCell>
                              <p className="text-xs font-medium text-foreground">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{c.subject}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">{c.total_contacts}</TableCell>
                            <TableCell className="text-right text-xs text-blue-500 font-medium">{c.sent_count}</TableCell>
                            <TableCell className="text-right text-xs text-emerald-500 font-medium">{c.replied_count}</TableCell>
                            <TableCell className="text-right">
                              <span className={cn("text-xs font-bold",
                                rr !== "—" && Number(rr) > 20 ? "text-emerald-500" : rr !== "—" && Number(rr) > 10 ? "text-amber-500" : "text-muted-foreground"
                              )}>{rr}{rr !== "—" ? "%" : ""}</span>
                            </TableCell>
                            <TableCell className="text-right text-xs text-amber-500 font-medium">{c.converted_count}</TableCell>
                            <TableCell className="text-right">
                              <span className={cn("text-xs font-bold",
                                cr !== "—" && Number(cr) > 30 ? "text-emerald-500" : cr !== "—" && Number(cr) > 15 ? "text-amber-500" : "text-muted-foreground"
                              )}>{cr}{cr !== "—" ? "%" : ""}</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      <ReportDetailModal
        open={modalState.open}
        onOpenChange={open => setModalState(s => ({ ...s, open }))}
        title={modalState.title}
        description={modalState.description}
        type={modalState.type}
        opportunities={modalState.opportunities}
        tasks={modalState.tasks}
      />
    </AppLayout>
  );
};

export default Reports;
