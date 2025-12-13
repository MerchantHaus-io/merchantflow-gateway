import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_CONFIG, TEAM_MEMBERS, OpportunityStage } from "@/types/opportunity";
import { useTasks } from "@/contexts/TasksContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, PieChartIcon, TrendingUp, Users, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface OpportunityData {
  id: string;
  stage: OpportunityStage;
  assigned_to: string | null;
  created_at: string;
  status: string | null;
}

interface ActivityData {
  id: string;
  type: string;
  created_at: string;
  opportunity_id: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(180, 70%, 45%)",
  "hsl(200, 70%, 50%)",
  "hsl(220, 70%, 55%)",
  "hsl(260, 60%, 55%)",
  "hsl(300, 60%, 50%)",
  "hsl(340, 65%, 50%)",
];

const Reports = () => {
  const { tasks } = useTasks();
  const [opportunities, setOpportunities] = useState<OpportunityData[]>([]);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [oppRes, actRes] = await Promise.all([
        supabase.from("opportunities").select("id, stage, assigned_to, created_at, status"),
        supabase.from("activities").select("id, type, created_at, opportunity_id").order("created_at", { ascending: false }).limit(500),
      ]);

      if (oppRes.data) setOpportunities(oppRes.data as OpportunityData[]);
      if (actRes.data) setActivities(actRes.data as ActivityData[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Pipeline stage distribution
  const stageData = useMemo(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach((opp) => {
      if (opp.status !== "dead") {
        counts[opp.stage] = (counts[opp.stage] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([stage, count]) => ({
      stage: STAGE_CONFIG[stage as OpportunityStage]?.label || stage,
      count,
    }));
  }, [opportunities]);

  // Team workload distribution
  const teamData = useMemo(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach((opp) => {
      if (opp.status !== "dead" && opp.assigned_to) {
        counts[opp.assigned_to] = (counts[opp.assigned_to] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
    }));
  }, [opportunities]);

  // Task status breakdown
  const taskStatusData = useMemo(() => {
    const counts = { open: 0, in_progress: 0, done: 0 };
    tasks.forEach((task) => {
      counts[task.status] = (counts[task.status] || 0) + 1;
    });
    return [
      { name: "Open", value: counts.open, color: "hsl(var(--destructive))" },
      { name: "In Progress", value: counts.in_progress, color: "hsl(var(--chart-4))" },
      { name: "Done", value: counts.done, color: "hsl(var(--primary))" },
    ];
  }, [tasks]);

  // Weekly activity trend (last 4 weeks)
  const activityTrend = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = new Date();
    
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7 + now.getDay()));
      const weekLabel = `Week ${4 - i}`;
      weeks[weekLabel] = 0;
    }

    activities.forEach((act) => {
      const actDate = new Date(act.created_at);
      const diffDays = Math.floor((now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex < 4) {
        const weekLabel = `Week ${4 - weekIndex}`;
        weeks[weekLabel] = (weeks[weekLabel] || 0) + 1;
      }
    });

    return Object.entries(weeks).map(([week, count]) => ({ week, activities: count }));
  }, [activities]);

  // Team task performance
  const teamTaskData = useMemo(() => {
    const data: Record<string, { open: number; done: number }> = {};
    TEAM_MEMBERS.forEach((member) => {
      data[member] = { open: 0, done: 0 };
    });

    tasks.forEach((task) => {
      if (task.assignee && data[task.assignee]) {
        if (task.status === "done") {
          data[task.assignee].done++;
        } else {
          data[task.assignee].open++;
        }
      }
    });

    return Object.entries(data)
      .filter(([, counts]) => counts.open > 0 || counts.done > 0)
      .map(([name, counts]) => ({
        name,
        open: counts.open,
        done: counts.done,
      }));
  }, [tasks]);

  // Summary stats
  const stats = useMemo(() => {
    const activeOpps = opportunities.filter((o) => o.status !== "dead").length;
    const closedWon = opportunities.filter((o) => o.stage === "closed_won").length;
    const openTasks = tasks.filter((t) => t.status !== "done").length;
    const overdueTasks = tasks.filter((t) => {
      if (!t.dueAt || t.status === "done") return false;
      return new Date(t.dueAt) < new Date();
    }).length;

    return { activeOpps, closedWon, openTasks, overdueTasks };
  }, [opportunities, tasks]);

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <SidebarInset className="flex-1 flex flex-col overflow-hidden">
            <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
              <SidebarTrigger className="md:hidden" />
              <h1 className="text-lg font-semibold text-foreground">Reports</h1>
            </header>
            <main className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">Loading reports...</p>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <div>
              <p className="text-sm text-muted-foreground">Analytics</p>
              <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Reports
              </h1>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Active Pipeline</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeOpps}</div>
                  <p className="text-xs text-muted-foreground">opportunities in progress</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Closed Won</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.closedWon}</div>
                  <p className="text-xs text-muted-foreground">successfully closed deals</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.openTasks}</div>
                  <p className="text-xs text-muted-foreground">tasks pending completion</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{stats.overdueTasks}</div>
                  <p className="text-xs text-muted-foreground">tasks past due date</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Pipeline by Stage
                  </CardTitle>
                  <CardDescription>Distribution of opportunities across stages</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {stageData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No pipeline data yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis dataKey="stage" type="category" width={120} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team Workload
                  </CardTitle>
                  <CardDescription>Opportunities assigned per team member</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {teamData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No assignment data yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4" />
                    Task Status
                  </CardTitle>
                  <CardDescription>Breakdown of tasks by status</CardDescription>
                </CardHeader>
                <CardContent className="h-[250px]">
                  {tasks.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No tasks yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={taskStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                          labelLine={false}
                        >
                          {taskStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Activity Trend
                  </CardTitle>
                  <CardDescription>Logged activities over the last 4 weeks</CardDescription>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activityTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="activities"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Team Task Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Team Task Performance</CardTitle>
                <CardDescription>Open vs completed tasks by team member</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {teamTaskData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No task data to display
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teamTaskData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="open" name="Open" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="done" name="Done" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Summary Tables */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline Summary</CardTitle>
                  <CardDescription>Opportunity count by stage</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stageData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">
                            No data
                          </TableCell>
                        </TableRow>
                      ) : (
                        stageData.map((row) => (
                          <TableRow key={row.stage}>
                            <TableCell>{row.stage}</TableCell>
                            <TableCell className="text-right font-medium">{row.count}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Team Summary</CardTitle>
                  <CardDescription>Opportunities per team member</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Team Member</TableHead>
                        <TableHead className="text-right">Opportunities</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">
                            No assignments
                          </TableCell>
                        </TableRow>
                      ) : (
                        teamData.map((row) => (
                          <TableRow key={row.name}>
                            <TableCell>{row.name}</TableCell>
                            <TableCell className="text-right font-medium">{row.count}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Reports;