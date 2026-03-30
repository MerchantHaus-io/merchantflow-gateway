import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft as PaginationLeft, ChevronRight as PaginationRight } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
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
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { Task, TaskPriority } from "@/types/task";
import { EMAIL_TO_USER, TEAM_MEMBERS, resolveDisplayName } from "@/types/opportunity";
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
  Flag,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertTriangle,
  Bell,
  Trash2,
  Zap,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { isWithinInterval, startOfDay, endOfDay, format, isPast, isToday, isTomorrow, differenceInDays } from "date-fns";
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
import { TaskDetailModal } from "@/components/TaskDetailModal";

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

// Priority configuration
const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: typeof ArrowUp }> = {
  high: { label: "High", color: "text-red-500 border-red-500/30", icon: ArrowUp },
  medium: { label: "Medium", color: "text-amber-500 border-amber-500/30", icon: Minus },
  low: { label: "Low", color: "text-blue-500 border-blue-500/30", icon: ArrowDown },
};

type SortKey = "title" | "account" | "contact" | "createdAt" | "dueAt" | "assignee" | "status" | "priority";
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'open' | 'in_progress' | 'done';
type ViewFilter = 'all' | 'mine' | 'team';
type PriorityFilter = 'all' | TaskPriority;

const Tasks = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const displayName = EMAIL_TO_USER[user?.email?.toLowerCase() || ""] || user?.email || "Me";
  const { tasks, addTask, updateTaskStatus, deleteTask, refreshTasks } = useTasks();

  // Local loading state
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
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
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState<string>("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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

  // Refresh tasks on mount and subscribe to real-time updates
  useEffect(() => {
    setLoading(true);
    Promise.all([refreshTasks(), fetchLinkData()]).finally(() => setLoading(false));

    // Subscribe to real-time changes on tasks table
    const channel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          
          // Refresh tasks when any change occurs
          refreshTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter((task) => task.priority === priorityFilter);
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
        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          const aPriority = priorityOrder[a.priority || 'medium'];
          const bPriority = priorityOrder[b.priority || 'medium'];
          return (aPriority - bPriority) * dir;
        default:
          return 0;
      }
    });

    return result;
  }, [tasks, dateRange, filterBy, searchQuery, statusFilter, priorityFilter, viewFilter, displayName, user?.email, assigneeFilter, sortKey, sortDirection]);

  // Split into manual and auto tasks
  const manualTasks = useMemo(() => filteredTasks.filter(t => t.source !== 'sla'), [filteredTasks]);
  const autoTasks = useMemo(() => filteredTasks.filter(t => t.source === 'sla'), [filteredTasks]);

  // Pagination state
  const [manualPage, setManualPage] = useState(1);
  const [autoPage, setAutoPage] = useState(1);
  const MANUAL_PER_PAGE = 10;
  const AUTO_PER_PAGE = 5;

  // Reset pages when filters change
  useEffect(() => { setManualPage(1); }, [searchQuery, statusFilter, priorityFilter, viewFilter, assigneeFilter, dateRange]);
  useEffect(() => { setAutoPage(1); }, [searchQuery, statusFilter, priorityFilter, viewFilter, assigneeFilter, dateRange]);

  const manualTotalPages = Math.max(1, Math.ceil(manualTasks.length / MANUAL_PER_PAGE));
  const autoTotalPages = Math.max(1, Math.ceil(autoTasks.length / AUTO_PER_PAGE));
  const paginatedManual = manualTasks.slice((manualPage - 1) * MANUAL_PER_PAGE, manualPage * MANUAL_PER_PAGE);
  const paginatedAuto = autoTasks.slice((autoPage - 1) * AUTO_PER_PAGE, autoPage * AUTO_PER_PAGE);

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
      priority,
      dueAt: dueAt || undefined,
      createdBy: displayName,
      comments: description,
      source: 'manual',
      relatedOpportunityId: relatedOpportunityId || undefined,
      relatedContactId: relatedContactId || undefined,
    });

    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueAt('');
    setRelatedOpportunityId('');
    setRelatedContactId('');
    setShowNewModal(false);
  };

  const formatDate = (date?: string) =>
    date ? format(new Date(date), 'MMM d') : '-';

  // Due date status helpers
  const getDueDateStatus = (dueAt?: string, status?: Task['status']) => {
    if (!dueAt || status === 'done') return null;
    const dueDate = startOfDay(new Date(dueAt));
    const today = startOfDay(new Date());
    
    if (isPast(dueDate) && !isToday(new Date(dueAt))) {
      return 'overdue';
    }
    if (isToday(new Date(dueAt))) {
      return 'due-today';
    }
    if (isTomorrow(new Date(dueAt))) {
      return 'due-tomorrow';
    }
    if (differenceInDays(dueDate, today) <= 3) {
      return 'due-soon';
    }
    return null;
  };

  const getDueDateLabel = (dueAt?: string, status?: Task['status']) => {
    const dueStatus = getDueDateStatus(dueAt, status);
    if (!dueStatus) return formatDate(dueAt);
    
    switch (dueStatus) {
      case 'overdue':
        const daysOverdue = differenceInDays(new Date(), new Date(dueAt!));
        return `${daysOverdue}d overdue`;
      case 'due-today':
        return 'Due today';
      case 'due-tomorrow':
        return 'Due tomorrow';
      case 'due-soon':
        return formatDate(dueAt);
      default:
        return formatDate(dueAt);
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'open': return <CircleDot className="h-3 w-3 text-blue-500" />;
      case 'in_progress': return <Clock className="h-3 w-3 text-amber-500" />;
      case 'done': return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    }
  };

  // Overdue and due soon counts
  const overdueCount = useMemo(() => {
    return tasks.filter(t => getDueDateStatus(t.dueAt, t.status) === 'overdue').length;
  }, [tasks]);

  const dueSoonCount = useMemo(() => {
    return tasks.filter(t => {
      const status = getDueDateStatus(t.dueAt, t.status);
      return status === 'due-today' || status === 'due-tomorrow' || status === 'due-soon';
    }).length;
  }, [tasks]);

  return (
    <AppLayout
      pageTitle="Tasks"
      headerActions={
        <>
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            filterBy={filterBy}
            onFilterByChange={setFilterBy}
          />
        </>
      }
    >
      <div className="p-4 lg:p-6 space-y-6">
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
            {overdueCount > 0 && (
              <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-red-500/30 text-red-500 bg-red-500/10">
                <AlertTriangle className="h-3 w-3" />Overdue {overdueCount}
              </Badge>
            )}
            {dueSoonCount > 0 && (
              <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-orange-500/30 text-orange-500 bg-orange-500/10">
                <Bell className="h-3 w-3" />Due Soon {dueSoonCount}
              </Badge>
            )}
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

                <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-1.5">
                        <ArrowUp className="h-3 w-3 text-red-500" />
                        High
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-1.5">
                        <Minus className="h-3 w-3 text-amber-500" />
                        Medium
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-1.5">
                        <ArrowDown className="h-3 w-3 text-blue-500" />
                        Low
                      </div>
                    </SelectItem>
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
                          <Label className="flex items-center gap-1.5">
                            <Flag className="h-3.5 w-3.5" />
                            Priority
                          </Label>
                          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">
                                <div className="flex items-center gap-1.5">
                                  <ArrowUp className="h-3 w-3 text-red-500" />
                                  High
                                </div>
                              </SelectItem>
                              <SelectItem value="medium">
                                <div className="flex items-center gap-1.5">
                                  <Minus className="h-3 w-3 text-amber-500" />
                                  Medium
                                </div>
                              </SelectItem>
                              <SelectItem value="low">
                                <div className="flex items-center gap-1.5">
                                  <ArrowDown className="h-3 w-3 text-blue-500" />
                                  Low
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
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
                  <div className="space-y-8">
                    {/* ── User-Created Tasks ── */}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-primary" />
                        User-Created Tasks
                        <Badge variant="secondary" className="text-xs">{manualTasks.length}</Badge>
                      </h3>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <SortableTableHead field="title" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Title</SortableTableHead>
                              <SortableTableHead field="priority" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Priority</SortableTableHead>
                              <SortableTableHead field="account" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                              <SortableTableHead field="assignee" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Assignee</SortableTableHead>
                              <SortableTableHead field="status" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</SortableTableHead>
                              <SortableTableHead field="createdAt" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Created</SortableTableHead>
                              <SortableTableHead field="dueAt" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Due</SortableTableHead>
                              {isAdmin && <TableHead className="w-12"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedManual.map((task, index) => {
                              const dueStatus = getDueDateStatus(task.dueAt, task.status);
                              return (
                              <TableRow 
                                key={task.id} 
                                className={cn(
                                  "hover:bg-muted/50 cursor-pointer",
                                  task.status === 'done' && "bg-emerald-500/10",
                                  task.status !== 'done' && dueStatus === 'overdue' && "bg-red-500/5 border-l-2 border-l-red-500",
                                  task.status !== 'done' && dueStatus === 'due-today' && "bg-orange-500/5 border-l-2 border-l-orange-500",
                                  task.status !== 'done' && dueStatus === 'due-tomorrow' && "bg-amber-500/5 border-l-2 border-l-amber-500"
                                )}
                                onClick={() => setSelectedTask(task)}
                              >
                                <TableCell className={cn("text-sm", task.status === 'done' ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{(manualPage - 1) * MANUAL_PER_PAGE + index + 1}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {dueStatus === 'overdue' && task.status !== 'done' && <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                                    <div>
                                      <p className={cn("font-medium", task.status === 'done' && "text-emerald-600 dark:text-emerald-400 line-through")}>{task.title}</p>
                                      {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const taskPriority = task.priority || 'medium';
                                    const config = priorityConfig[taskPriority];
                                    const IconComponent = config.icon;
                                    return (
                                      <Badge variant="outline" className={cn("text-xs gap-1", config.color)}>
                                        <IconComponent className="h-3 w-3" />{config.label}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell>
                                  {task.accountName ? (
                                    <div className="flex items-center gap-1.5">
                                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-sm">{task.accountName}</span>
                                    </div>
                                  ) : <span className="text-muted-foreground text-sm">-</span>}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-sm">{resolveDisplayName(task.assignee)}</span>
                                    {task.source === 'notice' && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-purple-500/30 text-purple-500 bg-purple-500/10">Notice</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Select value={task.status} onValueChange={(value) => updateTaskStatus(task.id, value as Task['status'])}>
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
                                            {getStatusIcon(key as Task['status'])}{label}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {task.createdAt ? format(new Date(task.createdAt), 'MMM d, h:mm a') : '-'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className={cn(
                                    "flex items-center gap-1 text-sm",
                                    dueStatus === 'overdue' && "text-red-500 font-medium",
                                    dueStatus === 'due-today' && "text-orange-500 font-medium",
                                    dueStatus === 'due-tomorrow' && "text-amber-500",
                                    dueStatus === 'due-soon' && "text-amber-500/80",
                                    !dueStatus && "text-muted-foreground"
                                  )}>
                                    {dueStatus === 'overdue' ? <AlertTriangle className="h-3.5 w-3.5" /> : dueStatus === 'due-today' || dueStatus === 'due-tomorrow' ? <Bell className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                                    {getDueDateLabel(task.dueAt, task.status)}
                                  </div>
                                </TableCell>
                                {isAdmin && (
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Task</AlertDialogTitle>
                                          <AlertDialogDescription>Are you sure you want to delete "{task.title}"? This action cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteTask(task.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </TableCell>
                                )}
                              </TableRow>
                              );
                            })}
                            {paginatedManual.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={isAdmin ? 9 : 8} className="h-16 text-center text-muted-foreground">No user-created tasks found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      {/* Manual tasks pagination */}
                      {manualTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 px-1">
                          <span className="text-xs text-muted-foreground">
                            Showing {(manualPage - 1) * MANUAL_PER_PAGE + 1}–{Math.min(manualPage * MANUAL_PER_PAGE, manualTasks.length)} of {manualTasks.length}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={manualPage <= 1} onClick={() => setManualPage(p => p - 1)}>
                              <PaginationLeft className="h-3.5 w-3.5" />
                            </Button>
                            {Array.from({ length: manualTotalPages }, (_, i) => i + 1).map(p => (
                              <Button key={p} variant={p === manualPage ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => setManualPage(p)}>
                                {p}
                              </Button>
                            ))}
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={manualPage >= manualTotalPages} onClick={() => setManualPage(p => p + 1)}>
                              <PaginationRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Auto / SLA Tasks ── */}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Auto Tasks
                        <Badge variant="secondary" className="text-xs">{autoTasks.length}</Badge>
                      </h3>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <SortableTableHead field="title" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Title</SortableTableHead>
                              <SortableTableHead field="priority" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Priority</SortableTableHead>
                              <SortableTableHead field="account" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                              <SortableTableHead field="assignee" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Assignee</SortableTableHead>
                              <SortableTableHead field="status" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</SortableTableHead>
                              <SortableTableHead field="createdAt" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Created</SortableTableHead>
                              <SortableTableHead field="dueAt" currentSortField={sortKey} sortDirection={sortDirection} onSort={handleSort}>Due</SortableTableHead>
                              {isAdmin && <TableHead className="w-12"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedAuto.map((task, index) => {
                              const dueStatus = getDueDateStatus(task.dueAt, task.status);
                              return (
                              <TableRow 
                                key={task.id} 
                                className={cn(
                                  "hover:bg-muted/50 cursor-pointer",
                                  task.status === 'done' && "bg-emerald-500/10",
                                  task.status !== 'done' && dueStatus === 'overdue' && "bg-red-500/5 border-l-2 border-l-red-500",
                                  task.status !== 'done' && dueStatus === 'due-today' && "bg-orange-500/5 border-l-2 border-l-orange-500",
                                  task.status !== 'done' && dueStatus === 'due-tomorrow' && "bg-amber-500/5 border-l-2 border-l-amber-500"
                                )}
                                onClick={() => setSelectedTask(task)}
                              >
                                <TableCell className={cn("text-sm", task.status === 'done' ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{(autoPage - 1) * AUTO_PER_PAGE + index + 1}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {dueStatus === 'overdue' && task.status !== 'done' && <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                                    <div>
                                      <p className={cn("font-medium", task.status === 'done' && "text-emerald-600 dark:text-emerald-400 line-through")}>{task.title}</p>
                                      {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const taskPriority = task.priority || 'medium';
                                    const config = priorityConfig[taskPriority];
                                    const IconComponent = config.icon;
                                    return (
                                      <Badge variant="outline" className={cn("text-xs gap-1", config.color)}>
                                        <IconComponent className="h-3 w-3" />{config.label}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell>
                                  {task.accountName ? (
                                    <div className="flex items-center gap-1.5">
                                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-sm">{task.accountName}</span>
                                    </div>
                                  ) : <span className="text-muted-foreground text-sm">-</span>}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-sm">{task.assignee || 'Unassigned'}</span>
                                  </div>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Select value={task.status} onValueChange={(value) => updateTaskStatus(task.id, value as Task['status'])}>
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
                                            {getStatusIcon(key as Task['status'])}{label}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {task.createdAt ? format(new Date(task.createdAt), 'MMM d, h:mm a') : '-'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className={cn(
                                    "flex items-center gap-1 text-sm",
                                    dueStatus === 'overdue' && "text-red-500 font-medium",
                                    dueStatus === 'due-today' && "text-orange-500 font-medium",
                                    dueStatus === 'due-tomorrow' && "text-amber-500",
                                    dueStatus === 'due-soon' && "text-amber-500/80",
                                    !dueStatus && "text-muted-foreground"
                                  )}>
                                    {dueStatus === 'overdue' ? <AlertTriangle className="h-3.5 w-3.5" /> : dueStatus === 'due-today' || dueStatus === 'due-tomorrow' ? <Bell className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                                    {getDueDateLabel(task.dueAt, task.status)}
                                  </div>
                                </TableCell>
                                {isAdmin && (
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Task</AlertDialogTitle>
                                          <AlertDialogDescription>Are you sure you want to delete "{task.title}"? This action cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteTask(task.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </TableCell>
                                )}
                              </TableRow>
                              );
                            })}
                            {paginatedAuto.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={isAdmin ? 9 : 8} className="h-16 text-center text-muted-foreground">No auto tasks found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      {/* Auto tasks pagination */}
                      {autoTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 px-1">
                          <span className="text-xs text-muted-foreground">
                            Showing {(autoPage - 1) * AUTO_PER_PAGE + 1}–{Math.min(autoPage * AUTO_PER_PAGE, autoTasks.length)} of {autoTasks.length}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={autoPage <= 1} onClick={() => setAutoPage(p => p - 1)}>
                              <PaginationLeft className="h-3.5 w-3.5" />
                            </Button>
                            {Array.from({ length: autoTotalPages }, (_, i) => i + 1).map(p => (
                              <Button key={p} variant={p === autoPage ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => setAutoPage(p)}>
                                {p}
                              </Button>
                            ))}
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={autoPage >= autoTotalPages} onClick={() => setAutoPage(p => p + 1)}>
                              <PaginationRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Cards view - split like table view */
                  <div className="space-y-8">
                    {/* User-Created Tasks Cards */}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-primary" />
                        User-Created Tasks
                        <Badge variant="secondary" className="text-xs">{manualTasks.length}</Badge>
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {paginatedManual.map((task) => {
                          const taskPriority = task.priority || 'medium';
                          const priorityConf = priorityConfig[taskPriority];
                          const PriorityIcon = priorityConf.icon;
                          const dueStatus = getDueDateStatus(task.dueAt, task.status);
                          return (
                            <Card key={task.id} className={cn("p-3 cursor-pointer hover:shadow-md transition-shadow", task.status === 'done' && "bg-emerald-500/10 border-emerald-500/30", task.status !== 'done' && dueStatus === 'overdue' && "border-red-500/50 bg-red-500/5", task.status !== 'done' && dueStatus === 'due-today' && "border-orange-500/50 bg-orange-500/5", task.status !== 'done' && dueStatus === 'due-tomorrow' && "border-amber-500/30 bg-amber-500/5")} onClick={() => setSelectedTask(task)}>
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {task.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" /> : dueStatus === 'overdue' ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" /> : <PriorityIcon className={cn("h-3.5 w-3.5 flex-shrink-0", priorityConf.color.split(' ')[0])} />}
                                    <h4 className={cn("font-medium text-sm leading-tight truncate", task.status === 'done' && "text-emerald-600 dark:text-emerald-400 line-through")}>{task.title}</h4>
                                  </div>
                                  <Badge variant="outline" className={cn("text-xs flex-shrink-0", task.status === 'open' && "border-blue-500/30 text-blue-500", task.status === 'in_progress' && "border-amber-500/30 text-amber-500", task.status === 'done' && "border-emerald-500/30 text-emerald-500")}>{statusLabels[task.status]}</Badge>
                                </div>
                                {task.description && <p className={cn("text-xs line-clamp-2", task.status === 'done' ? "text-emerald-600/60 dark:text-emerald-400/60" : "text-muted-foreground")}>{task.description}</p>}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                  <Badge variant="outline" className={cn("text-[10px] gap-0.5 h-5", priorityConf.color)}><PriorityIcon className="h-2.5 w-2.5" />{priorityConf.label}</Badge>
                                  {task.source === 'notice' && <Badge variant="outline" className="text-[10px] gap-0.5 h-5 border-purple-500/30 text-purple-500 bg-purple-500/10">Notice</Badge>}
                                  {task.accountName && <div className="flex items-center gap-1"><Building2 className="h-3 w-3" />{task.accountName}</div>}
                                  <div className="flex items-center gap-1"><UserRound className="h-3 w-3" />{task.assignee || 'Unassigned'}</div>
                                  <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{task.createdAt ? format(new Date(task.createdAt), 'MMM d, h:mm a') : '-'}</div>
                                  {task.dueAt && (
                                    <div className={cn("flex items-center gap-1", dueStatus === 'overdue' && "text-red-500 font-medium", dueStatus === 'due-today' && "text-orange-500 font-medium", dueStatus === 'due-tomorrow' && "text-amber-500", dueStatus === 'due-soon' && "text-amber-500/80")}>
                                      {dueStatus === 'overdue' ? <AlertTriangle className="h-3 w-3" /> : dueStatus === 'due-today' || dueStatus === 'due-tomorrow' ? <Bell className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                                      {getDueDateLabel(task.dueAt, task.status)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                        {paginatedManual.length === 0 && <div className="col-span-2 py-8 text-center text-muted-foreground">No user-created tasks found.</div>}
                      </div>
                      {manualTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 px-1">
                          <span className="text-xs text-muted-foreground">Showing {(manualPage - 1) * MANUAL_PER_PAGE + 1}–{Math.min(manualPage * MANUAL_PER_PAGE, manualTasks.length)} of {manualTasks.length}</span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={manualPage <= 1} onClick={() => setManualPage(p => p - 1)}><PaginationLeft className="h-3.5 w-3.5" /></Button>
                            {Array.from({ length: manualTotalPages }, (_, i) => i + 1).map(p => (<Button key={p} variant={p === manualPage ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => setManualPage(p)}>{p}</Button>))}
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={manualPage >= manualTotalPages} onClick={() => setManualPage(p => p + 1)}><PaginationRight className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Auto Tasks Cards */}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Auto Tasks
                        <Badge variant="secondary" className="text-xs">{autoTasks.length}</Badge>
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {paginatedAuto.map((task) => {
                          const taskPriority = task.priority || 'medium';
                          const priorityConf = priorityConfig[taskPriority];
                          const PriorityIcon = priorityConf.icon;
                          const dueStatus = getDueDateStatus(task.dueAt, task.status);
                          return (
                            <Card key={task.id} className={cn("p-3 cursor-pointer hover:shadow-md transition-shadow", task.status === 'done' && "bg-emerald-500/10 border-emerald-500/30", task.status !== 'done' && dueStatus === 'overdue' && "border-red-500/50 bg-red-500/5", task.status !== 'done' && dueStatus === 'due-today' && "border-orange-500/50 bg-orange-500/5", task.status !== 'done' && dueStatus === 'due-tomorrow' && "border-amber-500/30 bg-amber-500/5")} onClick={() => setSelectedTask(task)}>
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {task.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" /> : dueStatus === 'overdue' ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" /> : <PriorityIcon className={cn("h-3.5 w-3.5 flex-shrink-0", priorityConf.color.split(' ')[0])} />}
                                    <h4 className={cn("font-medium text-sm leading-tight truncate", task.status === 'done' && "text-emerald-600 dark:text-emerald-400 line-through")}>{task.title}</h4>
                                  </div>
                                  <Badge variant="outline" className={cn("text-xs flex-shrink-0", task.status === 'open' && "border-blue-500/30 text-blue-500", task.status === 'in_progress' && "border-amber-500/30 text-amber-500", task.status === 'done' && "border-emerald-500/30 text-emerald-500")}>{statusLabels[task.status]}</Badge>
                                </div>
                                {task.description && <p className={cn("text-xs line-clamp-2", task.status === 'done' ? "text-emerald-600/60 dark:text-emerald-400/60" : "text-muted-foreground")}>{task.description}</p>}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                  <Badge variant="outline" className={cn("text-[10px] gap-0.5 h-5", priorityConf.color)}><PriorityIcon className="h-2.5 w-2.5" />{priorityConf.label}</Badge>
                                  <Badge variant="outline" className="text-[10px] gap-0.5 h-5 border-amber-500/30 text-amber-500"><Zap className="h-2.5 w-2.5" />Auto</Badge>
                                  {task.accountName && <div className="flex items-center gap-1"><Building2 className="h-3 w-3" />{task.accountName}</div>}
                                  <div className="flex items-center gap-1"><UserRound className="h-3 w-3" />{task.assignee || 'Unassigned'}</div>
                                  <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{task.createdAt ? format(new Date(task.createdAt), 'MMM d, h:mm a') : '-'}</div>
                                  {task.dueAt && (
                                    <div className={cn("flex items-center gap-1", dueStatus === 'overdue' && "text-red-500 font-medium", dueStatus === 'due-today' && "text-orange-500 font-medium", dueStatus === 'due-tomorrow' && "text-amber-500", dueStatus === 'due-soon' && "text-amber-500/80")}>
                                      {dueStatus === 'overdue' ? <AlertTriangle className="h-3 w-3" /> : dueStatus === 'due-today' || dueStatus === 'due-tomorrow' ? <Bell className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                                      {getDueDateLabel(task.dueAt, task.status)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                        {paginatedAuto.length === 0 && <div className="col-span-2 py-8 text-center text-muted-foreground">No auto tasks found.</div>}
                      </div>
                      {autoTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 px-1">
                          <span className="text-xs text-muted-foreground">Showing {(autoPage - 1) * AUTO_PER_PAGE + 1}–{Math.min(autoPage * AUTO_PER_PAGE, autoTasks.length)} of {autoTasks.length}</span>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={autoPage <= 1} onClick={() => setAutoPage(p => p - 1)}><PaginationLeft className="h-3.5 w-3.5" /></Button>
                            {Array.from({ length: autoTotalPages }, (_, i) => i + 1).map(p => (<Button key={p} variant={p === autoPage ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => setAutoPage(p)}>{p}</Button>))}
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={autoPage >= autoTotalPages} onClick={() => setAutoPage(p => p + 1)}><PaginationRight className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
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
        </div>
        <TaskDetailModal
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => { if (!open) setSelectedTask(null); }}
        />
    </AppLayout>
  );
};

export default Tasks;
