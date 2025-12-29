import { useEffect, useMemo, useState, useCallback } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTasks } from "@/contexts/TasksContext";
import { useAuth } from "@/contexts/AuthContext";
import { Task } from "@/types/task";
import { EMAIL_TO_USER, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Plus,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ListChecks,
  UserRound,
  Clock,
  AlertCircle,
  Building2,
  User,
  Link2,
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
import { isWithinInterval, startOfDay, endOfDay, format } from "date-fns";
import { SortableTableHead } from "@/components/SortableTableHead";
import ThemeToggle from "@/components/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Lightweight types for linking
interface LightweightOpportunity {
  id: string;
  accountName: string;
}

interface LightweightContact {
  id: string;
  name: string;
  accountId: string;
}

// Mapping of status keys to human-friendly labels
const statusLabels: Record<Task["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

type SortKey = "title" | "account" | "contact" | "createdAt" | "dueAt" | "assignee" | "status";
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'open' | 'in_progress' | 'done';
type ViewFilter = 'all' | 'mine' | 'team';

const Tasks = () => {
  const { user } = useAuth();
  const displayName = EMAIL_TO_USER[user?.email?.toLowerCase() || ""] || user?.email || "Me";
  const { tasks, addTask, updateTaskStatus, refreshTasks } = useTasks();

  // Local loading state
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBy, setFilterBy] = useState<'created_at' | 'updated_at'>('created_at');

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>(displayName);
  const [dueAt, setDueAt] = useState<string>("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [relatedOpportunityId, setRelatedOpportunityId] = useState<string>("");
  const [relatedContactId, setRelatedContactId] = useState<string>("");

  // Data for linking
  const [opportunities, setOpportunities] = useState<LightweightOpportunity[]>([]);
  const [contacts, setContacts] = useState<LightweightContact[]>([]);

  // Fetch opportunities and contacts for linking
  const fetchLinkData = useCallback(async () => {
    const [oppsResult, contactsResult] = await Promise.all([
      supabase
        .from('opportunities')
        .select('id, account:accounts(name)')
        .order('updated_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('id, first_name, last_name, account_id')
        .order('first_name', { ascending: true })
    ]);

    if (oppsResult.data) {
      setOpportunities(oppsResult.data.map((o: any) => ({
        id: o.id,
        accountName: o.account?.name || 'Unknown Account'
      })));
    }

    if (contactsResult.data) {
      setContacts(contactsResult.data.map((c: any) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed',
        accountId: c.account_id
      })));
    }
  }, []);

  // Refresh tasks on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([refreshTasks(), fetchLinkData()]).finally(() => setLoading(false));
  }, [refreshTasks, fetchLinkData]);

  // Compute unique assignees
  const uniqueAssignees = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((task) => {
      if (task.assignee) names.add(task.assignee);
    });
    return Array.from(names);
  }, [tasks]);

  const allAssignees = useMemo(() => {
    return [...new Set([...TEAM_MEMBERS, ...uniqueAssignees])];
  }, [uniqueAssignees]);

  // Date range helper
  const isInDateRange = (dateStr: string | undefined) => {
    if (!dateRange?.from || !dateStr) return true;
    const date = new Date(dateStr);
    const start = startOfDay(dateRange.from);
    const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
    return isWithinInterval(date, { start, end });
  };

  const handleSort = (field: string) => {
    if (sortKey === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(field as SortKey);
      setSortDirection('asc');
    }
  };

  // Filtered and sorted tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Date range filter
    result = result.filter((task) => {
      const dateToCheck = filterBy === 'created_at' ? task.createdAt : task.dueAt ?? task.createdAt;
      return isInDateRange(dateToCheck);
    });

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(task =>
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.assignee?.toLowerCase().includes(query) ||
        task.accountName?.toLowerCase().includes(query) ||
        task.contactName?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((task) => task.status === statusFilter);
    }

    // View filter
    if (viewFilter === 'mine') {
      result = result.filter((task) => task.assignee === displayName || task.assignee === user?.email);
    } else if (viewFilter === 'team' && assigneeFilter !== 'all') {
      result = result.filter((task) => task.assignee === assigneeFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '') * dir;
        case 'account':
          return (a.accountName || '').localeCompare(b.accountName || '') * dir;
        case 'contact':
          return (a.contactName || '').localeCompare(b.contactName || '') * dir;
        case 'createdAt':
        case 'dueAt':
          const aDate = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
          const bDate = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
          return (aDate - bDate) * dir;
        case 'assignee':
          return (a.assignee || '').localeCompare(b.assignee || '') * dir;
        case 'status':
          return (a.status || '').localeCompare(b.status || '') * dir;
        default:
          return 0;
      }
    });

    return result;
  }, [tasks, dateRange, filterBy, searchQuery, statusFilter, viewFilter, displayName, user?.email, assigneeFilter, sortKey, sortDirection]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: tasks.length,
      open: tasks.filter(t => t.status === 'open').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      done: tasks.filter(t => t.status === 'done').length,
    };
  }, [tasks]);

  // Chart data
  const chartData = useMemo(() => {
    const totals = filteredTasks.reduce<Record<string, number>>((acc, task) => {
      const name = task.assignee || 'Unassigned';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(totals).map(([name, total]) => ({ name, total }));
  }, [filteredTasks]);

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
      source: 'manual',
      relatedOpportunityId: relatedOpportunityId || undefined,
      relatedContactId: relatedContactId || undefined,
    });

    setTitle('');
    setDescription('');
    setDueAt('');
    setRelatedOpportunityId('');
    setRelatedContactId('');
    setShowNewModal(false);
  };

  const formatDate = (date?: string) =>
    date ? format(new Date(date), 'MMM d') : '-';

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'open': return <CircleDot className="h-3 w-3 text-blue-500" />;
      case 'in_progress': return <Clock className="h-3 w-3 text-amber-500" />;
      case 'done': return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen">
        {/* Header */}
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <SidebarTrigger />
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Tasks</h1>
          </div>
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            filterBy={filterBy}
            onFilterByChange={setFilterBy}
          />
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
          {/* Stats badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="h-6 px-2 text-xs font-medium gap-1">
              <ListChecks className="h-3 w-3" />Total {stats.total}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-blue-500/30 text-blue-500">
              <CircleDot className="h-3 w-3" />Open {stats.open}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-amber-500/30 text-amber-500">
              <Clock className="h-3 w-3" />In Progress {stats.inProgress}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-emerald-500/30 text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />Done {stats.done}
            </Badge>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={viewFilter} onValueChange={(v) => setViewFilter(v as ViewFilter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="View" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Tasks</SelectItem>
                    <SelectItem value="mine">My Tasks</SelectItem>
                    <SelectItem value="team">By Assignee</SelectItem>
                  </SelectContent>
                </Select>

                {viewFilter === 'team' && (
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Assignees</SelectItem>
                      {allAssignees.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
                  <DialogTrigger asChild>
                    <Button className="ml-auto">
                      <Plus className="h-4 w-4 mr-1" />
                      New Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create Task</DialogTitle>
                      <DialogDescription>
                        Add a new task with due dates and ownership.
                      </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitTask}>
                      <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Schedule onboarding call"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Share context, links, or requirements"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Assign to</Label>
                          <Select value={assignee} onValueChange={setAssignee}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select teammate" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={displayName}>{displayName} (you)</SelectItem>
                              {allAssignees.map((name) => (
                                <SelectItem key={name} value={name}>
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="due">Due date</Label>
                          <Input
                            id="due"
                            type="date"
                            value={dueAt}
                            onChange={(e) => setDueAt(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5" />
                          Link to Opportunity
                        </Label>
                        <Select value={relatedOpportunityId} onValueChange={setRelatedOpportunityId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select opportunity (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {opportunities.map((opp) => (
                              <SelectItem key={opp.id} value={opp.id}>
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  {opp.accountName}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          Link to Contact
                        </Label>
                        <Select value={relatedContactId} onValueChange={setRelatedContactId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select contact (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {contacts.map((contact) => (
                              <SelectItem key={contact.id} value={contact.id}>
                                <div className="flex items-center gap-1.5">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  {contact.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button type="submit" className="w-full">
                        Create Task
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* Results */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {filteredTasks.length} Tasks
                  </CardTitle>
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'cards')}>
                    <TabsList className="h-8">
                      <TabsTrigger value="table" className="text-xs px-3">Table</TabsTrigger>
                      <TabsTrigger value="cards" className="text-xs px-3">Cards</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : viewMode === 'table' ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <SortableTableHead field="title" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Title</SortableTableHead>
                          <SortableTableHead field="account" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                          <SortableTableHead field="assignee" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Assignee</SortableTableHead>
                          <SortableTableHead field="status" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</SortableTableHead>
                          <SortableTableHead field="dueAt" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Due</SortableTableHead>
                          <SortableTableHead field="createdAt" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Created</SortableTableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTasks.map((task, index) => (
                          <TableRow key={task.id} className="hover:bg-muted/50">
                            <TableCell className="text-muted-foreground text-sm">{index + 1}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{task.title}</p>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {task.accountName ? (
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm">{task.accountName}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{task.assignee || 'Unassigned'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={task.status}
                                onValueChange={(value) => updateTaskStatus(task.id, value as Task['status'])}
                              >
                                <SelectTrigger className="h-8 w-[130px]">
                                  <div className="flex items-center gap-1.5">
                                    {getStatusIcon(task.status)}
                                    <SelectValue />
                                  </div>
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(statusLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                      <div className="flex items-center gap-1.5">
                                        {getStatusIcon(key as Task['status'])}
                                        {label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {formatDate(task.dueAt)}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(task.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredTasks.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                              No tasks found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filteredTasks.map((task) => (
                      <Card key={task.id} className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm leading-tight">{task.title}</h4>
                            <Badge variant="outline" className={cn(
                              "text-xs flex-shrink-0",
                              task.status === 'open' && "border-blue-500/30 text-blue-500",
                              task.status === 'in_progress' && "border-amber-500/30 text-amber-500",
                              task.status === 'done' && "border-emerald-500/30 text-emerald-500"
                            )}>
                              {statusLabels[task.status]}
                            </Badge>
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {task.accountName && (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {task.accountName}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <UserRound className="h-3 w-3" />
                              {task.assignee || 'Unassigned'}
                            </div>
                            {task.dueAt && (
                              <div className="flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                {formatDate(task.dueAt)}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                    {filteredTasks.length === 0 && (
                      <div className="col-span-2 py-12 text-center text-muted-foreground">
                        No tasks found.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Analytics Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Task Analytics</CardTitle>
                </CardHeader>
                <CardContent className="h-[200px]">
                  {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No tasks to chart.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical">
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} />
                        <RechartsTooltip />
                        <Bar
                          dataKey="total"
                          fill="hsl(var(--primary))"
                          radius={[0, 4, 4, 0]}
                          onClick={(data) => {
                            setViewFilter('team');
                            setAssigneeFilter(data.name);
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Status Legend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CircleDot className="h-4 w-4 text-blue-500" />
                    <span>Open</span>
                    <span className="ml-auto text-muted-foreground">{stats.open}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span>In Progress</span>
                    <span className="ml-auto text-muted-foreground">{stats.inProgress}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>Done</span>
                    <span className="ml-auto text-muted-foreground">{stats.done}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Tasks;
