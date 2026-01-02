import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_CONFIG, TEAM_MEMBERS, OpportunityStage } from "@/types/opportunity";
import { useTasks } from "@/contexts/TasksContext";
import { Task } from "@/types/task";
import DateRangeFilter from "@/components/DateRangeFilter";
import ReportDetailModal from "@/components/ReportDetailModal";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
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
import {
  BarChart3,
  PieChartIcon,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface OpportunityData {
  id: string;
  stage: OpportunityStage;
  assigned_to: string | null;
  created_at: string;
  status: string | null;
  account?: { name: string } | null;
  contact?: { first_name: string | null; last_name: string | null } | null;
}

interface ActivityData {
  id: string;
  type: string;
  created_at: string;
  opportunity_id: string;
}

interface ModalState {
  open: boolean;
  title: string;
  description: string;
  type: "opportunities" | "tasks";
  opportunities: OpportunityData[];
  tasks: Task[];
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBy, setFilterBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    title: "",
    description: "",
    type: "opportunities",
    opportunities: [],
    tasks: [],
  });

  const isInDateRange = (dateStr: string) => {
    if (!dateRange?.from) return true;
    const date = new Date(dateStr);
    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
    return isWithinInterval(date, { start: from, end: to });
  };

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => isInDateRange(opp.created_at));
  }, [opportunities, dateRange]);

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => isInDateRange(act.created_at));
  }, [activities, dateRange]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const dateToCheck = filterBy === 'created_at' ? task.createdAt : task.dueAt ?? task.createdAt;
      return isInDateRange(dateToCheck);
    });
  }, [tasks, dateRange, filterBy]);

  useEffect(() => {
    const fetchData = async () => {
      const [oppRes, actRes] = await Promise.all([
        supabase.from('opportunities').select('id, stage, assigned_to, created_at, status, account:accounts(name), contact:contacts(first_name, last_name)'),
        supabase.from('activities').select('id, type, created_at, opportunity_id').order('created_at', { ascending: false }).limit(500),
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
    filteredOpportunities.forEach((opp) => {
      if (opp.status !== 'dead') {
        counts[opp.stage] = (counts[opp.stage] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([stage, count]) => ({
      stage: STAGE_CONFIG[stage as OpportunityStage]?.label || stage,
      stageKey: stage,
      count,
    }));
  }, [filteredOpportunities]);

  // Team workload distribution
  const teamData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOpportunities.forEach((opp) => {
      if (opp.status !== 'dead' && opp.assigned_to) {
        counts[opp.assigned_to] = (counts[opp.assigned_to] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [filteredOpportunities]);

  // Task status breakdown
  const taskStatusData = useMemo(() => {
    const counts = { open: 0, in_progress: 0, done: 0 };
    filteredTasks.forEach((task) => {
      counts[task.status] = (counts[task.status] || 0) + 1;
    });
    return [
      { name: 'Open', value: counts.open, color: 'hsl(var(--destructive))', statusKey: 'open' },
      { name: 'In Progress', value: counts.in_progress, color: 'hsl(var(--chart-4))', statusKey: 'in_progress' },
      { name: 'Done', value: counts.done, color: 'hsl(var(--primary))', statusKey: 'done' },
    ];
  }, [filteredTasks]);

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
    filteredActivities.forEach((act) => {
      const actDate = new Date(act.created_at);
      const diffDays = Math.floor((now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex < 4) {
        const weekLabel = `Week ${4 - weekIndex}`;
        weeks[weekLabel] = (weeks[weekLabel] || 0) + 1;
      }
    });
    return Object.entries(weeks).map(([week, activities]) => ({ week, activities }));
  }, [filteredActivities]);

  // Team task performance
  const teamTaskData = useMemo(() => {
    const data: Record<string, { open: number; done: number }> = {};
    TEAM_MEMBERS.forEach((member) => {
      data[member] = { open: 0, done: 0 };
    });
    filteredTasks.forEach((task) => {
      if (task.assignee && data[task.assignee]) {
        if (task.status === 'done') {
          data[task.assignee].done++;
        } else {
          data[task.assignee].open++;
        }
      }
    });
    return Object.entries(data)
      .filter(([, counts]) => counts.open > 0 || counts.done > 0)
      .map(([name, counts]) => ({ name, open: counts.open, done: counts.done }));
  }, [filteredTasks]);

  // Summary stats
  const stats = useMemo(() => {
    const activeOpps = filteredOpportunities.filter((o) => o.status !== 'dead').length;
    const closedWon = filteredOpportunities.filter((o) => o.stage === 'closed_won').length;
    const openTasks = filteredTasks.filter((t) => t.status !== 'done').length;
    const overdueTasks = filteredTasks.filter((t) => {
      if (!t.dueAt || t.status === 'done') return false;
      return new Date(t.dueAt) < new Date();
    }).length;
    return { activeOpps, closedWon, openTasks, overdueTasks };
  }, [filteredOpportunities, filteredTasks]);

  // Click handlers for charts
  const handlePipelineClick = (stageKey: string, stageLabel: string) => {
    const opps = filteredOpportunities.filter((o) => o.stage === stageKey && o.status !== 'dead');
    setModalState({
      open: true,
      title: `Pipeline: ${stageLabel}`,
      description: `${opps.length} opportunities in this stage`,
      type: "opportunities",
      opportunities: opps,
      tasks: [],
    });
  };

  const handleTeamWorkloadClick = (teamMember: string) => {
    const opps = filteredOpportunities.filter((o) => o.assigned_to === teamMember && o.status !== 'dead');
    setModalState({
      open: true,
      title: `Team Workload: ${teamMember}`,
      description: `${opps.length} opportunities assigned to ${teamMember}`,
      type: "opportunities",
      opportunities: opps,
      tasks: [],
    });
  };

  const handleTaskStatusClick = (statusKey: string, statusLabel: string) => {
    const filteredByStatus = filteredTasks.filter((t) => t.status === statusKey);
    setModalState({
      open: true,
      title: `Tasks: ${statusLabel}`,
      description: `${filteredByStatus.length} tasks with status "${statusLabel}"`,
      type: "tasks",
      opportunities: [],
      tasks: filteredByStatus,
    });
  };

  const handleTeamTaskClick = (teamMember: string, taskType: 'open' | 'done') => {
    const filteredByMember = filteredTasks.filter((t) => {
      if (t.assignee !== teamMember) return false;
      if (taskType === 'done') return t.status === 'done';
      return t.status !== 'done';
    });
    setModalState({
      open: true,
      title: `${teamMember}: ${taskType === 'done' ? 'Completed' : 'Open'} Tasks`,
      description: `${filteredByMember.length} ${taskType === 'done' ? 'completed' : 'open'} tasks`,
      type: "tasks",
      opportunities: [],
      tasks: filteredByMember,
    });
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <SidebarInset className="flex-1 flex flex-col min-h-0">
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
        <SidebarInset className="flex-1 flex flex-col min-h-0">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2 justify-between">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <div>
                <p className="text-sm text-muted-foreground">Analytics</p>
                <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Reports
                </h1>
              </div>
            </div>
            <DateRangeFilter
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              filterBy={filterBy}
              onFilterByChange={setFilterBy}
            />
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
                  <CardDescription>Click a bar to see opportunities in that stage</CardDescription>
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
                        <Bar
                          dataKey="count"
                          fill="hsl(var(--primary))"
                          radius={[0, 4, 4, 0]}
                          className="cursor-pointer"
                          onClick={(data) => handlePipelineClick(data.stageKey, data.stage)}
                        />
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
                  <CardDescription>Click a bar to see opportunities assigned to that team member</CardDescription>
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
                        <Bar
                          dataKey="count"
                          fill="hsl(var(--chart-2))"
                          radius={[4, 4, 0, 0]}
                          className="cursor-pointer"
                          onClick={(data) => handleTeamWorkloadClick(data.name)}
                        />
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
                  <CardDescription>Click a slice to see tasks with that status</CardDescription>
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
                          className="cursor-pointer"
                          onClick={(data) => handleTaskStatusClick(data.statusKey, data.name)}
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
                        dot={{ fill: 'hsl(var(--primary))' }}
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
                <CardDescription>Click a bar to see tasks for that team member</CardDescription>
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
                      <Bar
                        dataKey="open"
                        name="Open"
                        fill="hsl(var(--chart-4))"
                        radius={[4, 4, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data) => handleTeamTaskClick(data.name, 'open')}
                      />
                      <Bar
                        dataKey="done"
                        name="Done"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data) => handleTeamTaskClick(data.name, 'done')}
                      />
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
                  <CardDescription>Click a row to see opportunities</CardDescription>
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
                          <TableRow
                            key={row.stage}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handlePipelineClick(row.stageKey, row.stage)}
                          >
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
                  <CardDescription>Click a row to see opportunities</CardDescription>
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
                          <TableRow
                            key={row.name}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleTeamWorkloadClick(row.name)}
                          >
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

      {/* Detail Modal */}
      <ReportDetailModal
        open={modalState.open}
        onOpenChange={(open) => setModalState((s) => ({ ...s, open }))}
        title={modalState.title}
        description={modalState.description}
        type={modalState.type}
        opportunities={modalState.opportunities}
        tasks={modalState.tasks}
      />
    </SidebarProvider>
  );
};

export default Reports;
