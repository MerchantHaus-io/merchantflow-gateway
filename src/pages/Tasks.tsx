import { useEffect, useMemo, useState } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useTasks } from "@/contexts/TasksContext";
import { useAuth } from "@/contexts/AuthContext";
import { Task } from "@/types/task";
import { EMAIL_TO_USER, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ListChecks,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import DateRangeFilter from "@/components/DateRangeFilter";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";

const statusLabels: Record<Task["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

const viewOptions = [
  { value: "all", label: "All Tasks" },
  { value: "mine", label: "My Tasks" },
  { value: "team", label: "By Team Member" },
] as const;

type ViewOption = (typeof viewOptions)[number]["value"];

type SortKey = "createdAt" | "dueAt" | "assignee" | "status";

const storageKey = {
  view: "tasks:view",
  assignee: "tasks:assignee",
  sortKey: "tasks:sortKey",
  sortDir: "tasks:sortDir",
};

type StatusFilter = 'all' | 'open' | 'in_progress' | 'done';

const Tasks = () => {
  const { user } = useAuth();
  const displayName = EMAIL_TO_USER[user?.email?.toLowerCase() || ""] || user?.email || "Me";
  const { tasks, addTask, updateTaskStatus, updateTask, refreshTasks } = useTasks();

  const [view, setView] = useState<ViewOption>("all");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>(displayName);
  const [dueAt, setDueAt] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBy, setFilterBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    const savedView = (localStorage.getItem(storageKey.view) as ViewOption | null) || "all";
    const savedAssignee = localStorage.getItem(storageKey.assignee) || "";
    const savedSortKey = (localStorage.getItem(storageKey.sortKey) as SortKey | null) || "createdAt";
    const savedSortDir = localStorage.getItem(storageKey.sortDir) === "asc";

    setView(savedView);
    setSelectedAssignee(savedAssignee);
    setSortKey(savedSortKey);
    setSortAsc(savedSortDir);
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey.view, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(storageKey.assignee, selectedAssignee);
  }, [selectedAssignee]);

  useEffect(() => {
    localStorage.setItem(storageKey.sortKey, sortKey);
  }, [sortKey]);

  useEffect(() => {
    localStorage.setItem(storageKey.sortDir, sortAsc ? "asc" : "desc");
  }, [sortAsc]);

  const uniqueAssignees = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((task) => {
      if (task.assignee) names.add(task.assignee);
    });
    return Array.from(names);
  }, [tasks]);

  const isInDateRange = (dateStr: string | undefined) => {
    if (!dateRange?.from || !dateStr) return true;
    const date = new Date(dateStr);
    const start = startOfDay(dateRange.from);
    const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
    return isWithinInterval(date, { start, end });
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;
    
    // Date range filter
    result = result.filter((task) => {
      const dateToCheck = filterBy === 'created_at' ? task.createdAt : task.createdAt;
      return isInDateRange(dateToCheck);
    });

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((task) => task.status === statusFilter);
    } else if (showOnlyActive) {
      result = result.filter((task) => task.status !== "done");
    }

    if (view === "mine") {
      result = result.filter(
        (task) => task.assignee === displayName || task.assignee === user?.email,
      );
    } else if (view === "team" && selectedAssignee) {
      result = result.filter((task) => task.assignee === selectedAssignee);
    }

    result = [...result].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === "createdAt" || sortKey === "dueAt") {
        const aDate = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
        const bDate = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
        return (aDate - bDate) * dir;
      }
      const aValue = (a[sortKey] || "").toString().toLowerCase();
      const bValue = (b[sortKey] || "").toString().toLowerCase();
      return aValue.localeCompare(bValue) * dir;
    });

    return result;
  }, [tasks, dateRange, filterBy, statusFilter, showOnlyActive, view, displayName, user?.email, selectedAssignee, sortKey, sortAsc]);

  const totalsByAssignee = useMemo(
    () =>
      filteredTasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.assignee] = (acc[task.assignee] || 0) + 1;
        return acc;
      }, {}),
    [filteredTasks],
  );

  const chartData = useMemo(
    () =>
      Object.entries(totalsByAssignee).map(([name, total]) => ({
        name,
        total,
      })),
    [totalsByAssignee],
  );

  const toggleExpand = (taskId: string) => {
    setExpandedRows((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const submitTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    addTask({
      title,
      description,
      assignee,
      dueAt: dueAt || undefined,
      createdBy: displayName,
      comments: description,
      source: "manual",
    });

    setTitle("");
    setDescription("");
    setDueAt("");
  };

  const formatDate = (date?: string) =>
    date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-";

  return (
    <SidebarProvider>
      <SidebarInset>
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-16 items-center gap-2 border-b px-4 justify-between">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div>
                <p className="text-sm text-muted-foreground">Collaboration</p>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-primary" />
                  Tasks
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

          <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
            <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card className="order-2 lg:order-1">
                <CardHeader className="flex flex-col gap-2">
                  <CardTitle>All tasks</CardTitle>
                  <CardDescription>
                    Sort and filter every task across the team. Click a bar to jump straight to an assignee.
                  </CardDescription>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label>View</Label>
                      <Select value={view} onValueChange={(value) => setView(value as ViewOption)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {viewOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Team member</Label>
                      <Select
                        value={selectedAssignee}
                        onValueChange={setSelectedAssignee}
                        disabled={view !== "team"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a teammate" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All</SelectItem>
                          {[...TEAM_MEMBERS, ...uniqueAssignees]
                            .filter((name, index, arr) => arr.indexOf(name) === index)
                            .map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Sort by</Label>
                      <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="createdAt">Created date</SelectItem>
                          <SelectItem value="dueAt">Due date</SelectItem>
                          <SelectItem value="assignee">Assignee</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="flex items-center justify-between gap-2">
                        Sort direction
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setSortAsc((prev) => !prev)}
                          className="h-9 w-9"
                          aria-label="Toggle sort direction"
                        >
                          {sortAsc ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
                        </Button>
                      </Label>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Assigned by</TableHead>
                          <TableHead>Assigned to</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTasks.map((task) => (
                          <TableRow key={task.id} className="align-top">
                            <TableCell className="font-medium min-w-[180px]">{task.title}</TableCell>
                            <TableCell className="max-w-md">
                              {task.description ? (
                                <div className="text-sm text-muted-foreground space-y-1">
                                  <p className={cn(!expandedRows[task.id] && "line-clamp-2")}>{task.description}</p>
                                  {task.description.length > 120 && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0"
                                      onClick={() => toggleExpand(task.id)}
                                    >
                                      {expandedRows[task.id] ? "Show less" : "Expand"}
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No description</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {task.createdBy || "System"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <UserRound className="h-4 w-4 text-muted-foreground" />
                                {task.assignee || "Unassigned"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={task.status}
                                onValueChange={(value) => updateTaskStatus(task.id, value as Task["status"])}
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(statusLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <CalendarClock className="h-4 w-4" />
                                {formatDate(task.dueAt)}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDate(task.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredTasks.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                              No tasks match this view yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="order-1 lg:order-2 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Task analytics</CardTitle>
                    <CardDescription>Click a bar to filter the list to that teammate.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No tasks to chart yet.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} width={32} />
                          <RechartsTooltip />
                          <Bar
                            dataKey="total"
                            fill="hsl(var(--primary))"
                            radius={[4, 4, 0, 0]}
                            onClick={(data) => {
                              setView("team");
                              setSelectedAssignee(data.name);
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Create task</CardTitle>
                    <CardDescription>Capture follow-ups with due dates and ownership.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-3" onSubmit={submitTask}>
                      <div className="space-y-1">
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Schedule onboarding call"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Share context, links, or requirements"
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Assign to</Label>
                          <Select value={assignee} onValueChange={setAssignee}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select teammate" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={displayName}>{displayName} (you)</SelectItem>
                              {[...TEAM_MEMBERS, ...uniqueAssignees]
                                .filter((name, index, arr) => arr.indexOf(name) === index)
                                .map((name) => (
                                  <SelectItem key={name} value={name}>
                                    {name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="due">Due date</Label>
                          <Input
                            id="due"
                            type="date"
                            value={dueAt}
                            onChange={(e) => setDueAt(e.target.value)}
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full">
                        Create task
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Status legend</CardTitle>
                    <CardDescription>Quick glance at status meanings.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CircleDot className="h-4 w-4 text-blue-500" />
                      <span>Open</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarClock className="h-4 w-4 text-amber-500" />
                      <span>In progress</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Done</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Tasks;
