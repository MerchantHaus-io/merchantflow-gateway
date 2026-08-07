import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import { 
  Opportunity, 
  OpportunityStage, 
  OutcomeStatus,
  STAGE_CONFIG, 
  OUTCOME_CONFIG,
  TEAM_MEMBERS, 
  migrateStage, 
  getServiceType,
  EMAIL_TO_USER,
  PROCESSING_PIPELINE_STAGES,
  GATEWAY_ONLY_PIPELINE_STAGES
} from "@/types/opportunity";
import { sendStageChangeEmail } from "@/hooks/useEmailNotifications";
import { sendQualifiedDocsRequest } from "@/hooks/useQualifiedDocsRequest";
import { checkUnderwritingGate } from "@/lib/underwriting-gate";
import { checkDuplicateMerchant } from "@/lib/duplicate-check";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Clock,
  Eye,
  Zap,
  CreditCard,
  ChevronDown,
  Plus,
  TrendingUp,
  CheckCircle2,
  RotateCcw,
  Archive
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import OpportunityDetailModal from "@/components/OpportunityDetailModal";
import { PricingBadges } from "@/components/PricingBadges";
import NewApplicationModal from "@/components/NewApplicationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SortableTableHead } from "@/components/SortableTableHead";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { ListViewHeader } from "@/components/list-view/ListViewHeader";
import { ListViewToolbar } from "@/components/list-view/ListViewToolbar";
import { Upload, Sparkles, Megaphone } from "lucide-react";

type SortField = 'name' | 'stage' | 'outcome' | 'pipeline' | 'owner' | 'tasks' | 'progress' | 'created' | 'updated';
type SortDirection = 'asc' | 'desc';

/** Rows per request; PostgREST refuses to return more than ~1000 at once. */
const PAGE_SIZE = 1000;
/** Safety cap so a runaway table can't lock the browser up. */
const MAX_ROWS = 5000;
/** Coalesce bursts of realtime events into one refetch. */
const REALTIME_DEBOUNCE_MS = 400;

/**
 * `opportunities.status` is constrained to ('active','dead','won') at the
 * database level — see 20260522000000_opportunities_status_allow_won.sql.
 * 'archived' was never a legal value, so the Archive tab could never match a
 * row. 'dead' IS the archived state: it is what the archive badge and the
 * "Reactivate Archived Opportunity?" dialog already key off.
 */
const ARCHIVED_STATUS = 'dead';

/**
 * Terminal stages — excluded from "active" counts and from the idle badge.
 * Note this is just 'closed_won': fetchOpportunities() runs every row through
 * migrateStage(), which rewrites the legacy 'live_activated', 'closed_lost'
 * and 'application_started' names, so those can never appear here.
 */
const CLOSED_STAGES: string[] = ['closed_won'];

const STALE_AFTER_DAYS = 7;

const FILTERS_STORAGE_KEY = 'opportunities:filters:v1';

interface PersistedFilters {
  searchQuery?: string;
  stageFilter?: string;
  ownerFilter?: string;
  pipelineFilter?: string;
  outcomeFilter?: string;
  sortField?: SortField;
  sortDirection?: SortDirection;
  viewMode?: 'table' | 'cards';
  viewTab?: 'all' | 'archive';
  showFilters?: boolean;
}

const readPersistedFilters = (): PersistedFilters => {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedFilters) : {};
  } catch {
    return {};
  }
};

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/** Stale = untouched for a while AND still open. Applies to both views. */
const isStaleOpportunity = (opp: Opportunity) =>
  daysSince(opp.updated_at) > STALE_AFTER_DAYS && !CLOSED_STAGES.includes(opp.stage);

/** Created dates older than the current year need the year to be unambiguous. */
const formatCreated = (iso: string) => {
  const d = new Date(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
};

type ActivityInsert = Database['public']['Tables']['activities']['Insert'];

/**
 * Record an audit-trail entry. These inserts were previously fire-and-forget
 * everywhere in this file, so RLS or network failures left silent holes in the
 * activity log. Returns false on failure so callers can warn.
 */
const logActivity = async (row: ActivityInsert) => {
  const { error } = await supabase.from('activities').insert(row);
  if (error) {
    console.error('Failed to write activity log entry:', error, row);
    return false;
  }
  return true;
};

let channelSeq = 0;

const Opportunities = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { tasks } = useTasks();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Persist filters across navigation (e.g. drilling into an account & clicking Back).
  // Read once via a lazy initialiser — this used to be a bare IIFE in the
  // component body, so it re-parsed sessionStorage on every single render.
  const [persisted] = useState<PersistedFilters>(readPersistedFilters);

  const [searchQuery, setSearchQuery] = useState<string>(persisted.searchQuery ?? "");
  const [stageFilter, setStageFilter] = useState<string>(persisted.stageFilter ?? "all");
  const [ownerFilter, setOwnerFilter] = useState<string>(persisted.ownerFilter ?? "all");
  const [pipelineFilter, setPipelineFilter] = useState<string>(persisted.pipelineFilter ?? "all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>(persisted.outcomeFilter ?? "all");
  const [sortField, setSortField] = useState<SortField>(persisted.sortField ?? 'updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>(persisted.sortDirection ?? 'desc');
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(persisted.viewMode ?? 'table');
  const [viewTab, setViewTab] = useState<'all' | 'archive'>(persisted.viewTab ?? 'all');
  const [reactivateConfirm, setReactivateConfirm] = useState<{ opp: Opportunity; assignee: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState<boolean>(persisted.showFilters ?? false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [channelId] = useState(() => ++channelSeq);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          searchQuery,
          stageFilter,
          ownerFilter,
          pipelineFilter,
          outcomeFilter,
          sortField,
          sortDirection,
          viewMode,
          viewTab,
          showFilters,
        }),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [searchQuery, stageFilter, ownerFilter, pipelineFilter, outcomeFilter, sortField, sortDirection, viewMode, viewTab, showFilters]);

  const toggleRowSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handle ?new=true query param from sidebar navigation
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowNewModal(true);
      // Clear only the param we consumed — setSearchParams({}) wiped every
      // other query param on the URL along with it.
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // PostgREST caps a single response at ~1000 rows. The page previously
      // took whatever came back and computed every KPI off it, so past that
      // ceiling the cards were quietly wrong and rows vanished with no
      // warning. Page through instead, and say so if we hit the safety cap.
      const rows: any[] = [];
      let truncated = false;

      for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('opportunities')
          .select(`
            *,
            account:accounts(*),
            contact:contacts(*),
            wizard_state:onboarding_wizard_states(*)
          `)
          .order('updated_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        rows.push(...(data ?? []));

        if (!data || data.length < PAGE_SIZE) break;
        if (from + PAGE_SIZE >= MAX_ROWS) truncated = true;
      }

      const mapped = rows.map((opp: any) => ({
        ...opp,
        stage: migrateStage(opp.stage),
        wizard_state: Array.isArray(opp.wizard_state) ? opp.wizard_state[0] : opp.wizard_state,
      }));

      setOpportunities(mapped);
      setIsTruncated(truncated);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      setFetchError('Failed to load opportunities. Please try again.');
      toast({ title: "Error loading opportunities", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOpportunities();

    // One teammate running a bulk update fires an event per row. Refetching on
    // each one caused a refetch storm across every open browser, so coalesce
    // bursts into a single trailing refetch.
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefetch = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => fetchOpportunities(), REALTIME_DEBOUNCE_MS);
    };

    // Unique per mount: a static channel name collides when the component
    // mounts twice (StrictMode, or the page open in two views).
    const channel = supabase
      .channel(`opportunities-page:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, scheduleRefetch)
      .subscribe();

    return () => {
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [fetchOpportunities, channelId]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as SortField);
      setSortDirection('asc');
    }
  };

  // "Open" means not done — `status === 'open'` silently dropped in_progress
  // tasks, so the table and card views showed different numbers in the same
  // badge. This matches the convention used in TasksContext.
  const getTaskCount = (opportunityId: string) => {
    return tasks.filter(t => t.relatedOpportunityId === opportunityId && t.status !== 'done').length;
  };

  const filteredOpportunities = useMemo(() => {
    // Exclude auto-synced email leads — they belong on the Leads page only
    let filtered = opportunities.filter(opp => (opp.account?.status as string) !== 'lead');

    // Tab-level filter. See ARCHIVED_STATUS: 'dead' is the archived state, and
    // the tab is the only control that selects it.
    filtered = viewTab === 'archive'
      ? filtered.filter(opp => opp.status === ARCHIVED_STATUS)
      : filtered.filter(opp => opp.status !== ARCHIVED_STATUS);

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(opp =>
        opp.account?.name?.toLowerCase().includes(query) ||
        opp.contact?.email?.toLowerCase().includes(query) ||
        opp.contact?.first_name?.toLowerCase().includes(query) ||
        opp.contact?.last_name?.toLowerCase().includes(query)
      );
    }

    // Stage filter
    if (stageFilter !== "all") {
      filtered = filtered.filter(opp => opp.stage === stageFilter);
    }

    // Owner filter
    if (ownerFilter !== "all") {
      if (ownerFilter === "unassigned") {
        filtered = filtered.filter(opp => !opp.assigned_to);
      } else {
        filtered = filtered.filter(opp => opp.assigned_to === ownerFilter);
      }
    }

    // Pipeline filter
    if (pipelineFilter !== "all") {
      filtered = filtered.filter(opp => getServiceType(opp) === pipelineFilter);
    }

    // Outcome filter
    if (outcomeFilter !== "all") {
      filtered = filtered.filter(opp => opp.outcome_status === outcomeFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.account?.name || '').localeCompare(b.account?.name || '');
          break;
        case 'stage':
          comparison = a.stage.localeCompare(b.stage);
          break;
        case 'outcome':
          comparison = (a.outcome_status || '').localeCompare(b.outcome_status || '');
          break;
        case 'pipeline':
          comparison = getServiceType(a).localeCompare(getServiceType(b));
          break;
        case 'owner':
          comparison = (a.assigned_to || 'zzz').localeCompare(b.assigned_to || 'zzz');
          break;
        case 'tasks':
          comparison = getTaskCount(a.id) - getTaskCount(b.id);
          break;
        case 'progress':
          comparison = (a.wizard_state?.progress || 0) - (b.wizard_state?.progress || 0);
          break;
        case 'created':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [opportunities, searchQuery, stageFilter, ownerFilter, pipelineFilter, outcomeFilter, viewTab, sortField, sortDirection, tasks]);

  // Stats. "Active Deals" previously counted won deals, which then also fed
  // the "Won" card; and the "Archived" card counted a status value the DB
  // constraint makes impossible, so it was permanently zero.
  const stats = useMemo(() => {
    const archived = opportunities.filter(o => o.status === ARCHIVED_STATUS);
    const live = opportunities.filter(o => o.status !== ARCHIVED_STATUS);

    const won = live.filter(o => o.status === 'won' || CLOSED_STAGES.includes(o.stage));
    const open = live.filter(o => o.status !== 'won' && !CLOSED_STAGES.includes(o.stage));

    return {
      total: open.length,
      // Subset of Open: everything that has moved past first-touch discovery.
      inProgress: open.filter(o => o.stage !== 'discovery').length,
      won: won.length,
      archived: archived.length,
    };
  }, [opportunities]);

  // Selection is scoped to what's on screen; keeping ids that the current
  // filters exclude made the "N items selected" counter describe rows the user
  // could not see.
  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredOpportunities.map(o => o.id));
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredOpportunities]);

  const navigateToOpportunity = (opp: Opportunity) => {
    navigate(`/opportunities/${opp.id}`);
  };

  const handleAssignmentChange = (opp: Opportunity, newAssignee: string) => {
    const wasArchived = opp.status === ARCHIVED_STATUS;
    const assigneeValue = newAssignee === 'unassigned' ? null : newAssignee;
    
    // Show confirmation if reactivating an archived opportunity
    if (wasArchived && assigneeValue) {
      setReactivateConfirm({ opp, assignee: newAssignee });
      return;
    }
    
    // Otherwise just update assignment directly
    performAssignmentUpdate(opp, newAssignee, false);
  };

  const performAssignmentUpdate = async (opp: Opportunity, newAssignee: string, isReactivation: boolean) => {
    const assigneeValue = newAssignee === 'unassigned' ? null : newAssignee;
    
    const updatePayload: { assigned_to: string | null; status?: string; stage?: string } = {
      assigned_to: assigneeValue,
    };
    
    if (isReactivation && assigneeValue) {
      updatePayload.status = 'active';
      const serviceType = getServiceType(opp);
      const validStages = serviceType === 'gateway_only' 
        ? GATEWAY_ONLY_PIPELINE_STAGES 
        : PROCESSING_PIPELINE_STAGES;
      if (!validStages.includes(opp.stage as OpportunityStage)) {
        updatePayload.stage = 'application_started';
      }
    }
    
    const { error } = await supabase
      .from('opportunities')
      .update(updatePayload)
      .eq('id', opp.id);
    
    if (error) {
      toast({ title: "Failed to update assignment", variant: "destructive" });
      return;
    }
    
    const logged = await logActivity({
      opportunity_id: opp.id,
      type: isReactivation ? 'reactivated' : 'assignment_change',
      description: isReactivation
        ? `Reactivated and assigned to ${assigneeValue}`
        : `Assigned to ${assigneeValue || 'Unassigned'}`,
      user_id: user?.id,
      user_email: user?.email,
    });

    toast({
      title: isReactivation
        ? `Reactivated and assigned to ${assigneeValue}`
        : `Assigned to ${assigneeValue || 'Unassigned'}`,
      description: logged ? undefined : 'Saved, but the activity log entry failed.',
    });

    fetchOpportunities();
  };

  /**
   * Switch an opportunity between the Processing and Gateway pipelines.
   * Previously implemented twice — inline <Select> and row dropdown — with
   * copy-pasted logic that had already drifted (the dropdown copy carried a
   * dead `newStage` variable).
   */
  const switchPipeline = useCallback(async (opp: Opportunity, newType: 'processing' | 'gateway_only') => {
    const currentType = getServiceType(opp);
    if (newType === currentType) return;

    const label = (t: string) => (t === 'gateway_only' ? 'Gateway' : 'Processing');
    const stageReset =
      newType === 'gateway_only' && !GATEWAY_ONLY_PIPELINE_STAGES.includes(opp.stage as OpportunityStage)
        ? 'discovery'
        : undefined;

    const updatePayload: Record<string, unknown> = { service_type: newType };
    if (stageReset) updatePayload.stage = stageReset;

    const { error } = await supabase
      .from('opportunities')
      .update(updatePayload)
      .eq('id', opp.id);
    if (error) {
      toast({ title: "Failed to switch pipeline", variant: "destructive" });
      return;
    }

    const logged = await logActivity({
      opportunity_id: opp.id,
      type: 'pipeline_change',
      description: `Switched from ${label(currentType)} to ${label(newType)}${stageReset ? ' (stage reset to Discovery)' : ''}`,
      user_id: user?.id,
      user_email: user?.email,
    });

    toast({
      title: `Switched to ${label(newType)} pipeline`,
      description: logged ? undefined : 'Saved, but the activity log entry failed.',
    });
    fetchOpportunities();
  }, [toast, user, fetchOpportunities]);

  const confirmReactivation = () => {
    if (reactivateConfirm) {
      performAssignmentUpdate(reactivateConfirm.opp, reactivateConfirm.assignee, true);
      setReactivateConfirm(null);
    }
  };

  const selectedCount = selectedIds.size;
  const visibleCount = filteredOpportunities.length;
  const viewLabel = viewTab === 'archive' ? 'Archived - Opportunities' : 'All - Opportunities';
  const statusText = selectedCount > 0
    ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} selected`
    : `${visibleCount} item${visibleCount === 1 ? '' : 's'} • Sorted by ${sortField.charAt(0).toUpperCase() + sortField.slice(1)}`;

  const headerActions = (
    <>
      <div className="flex items-center gap-1 bg-muted rounded-md p-0.5 mr-1">
        <button
          onClick={() => setViewTab('all')}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded transition-colors",
            viewTab === 'all' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        <button
          onClick={() => setViewTab('archive')}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1",
            viewTab === 'archive' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Archive className="h-3 w-3" />
          Archive
          {stats.archived > 0 && (
            <Badge variant="muted" className="h-4 px-1 text-[10px] ml-0.5">{stats.archived}</Badge>
          )}
        </button>
      </div>
      <Button variant="outline" size="sm" className="h-8" onClick={() => navigate('/tools/csv-import')}>
        <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
      </Button>
      {/* Not wired up yet — disabled rather than silently doing nothing. */}
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Intelligence View is not available yet"
        className="h-8 text-info border-info/30 hover:bg-info/10 hover:text-info"
      >
        <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Intelligence View
      </Button>
      <Button size="sm" className="h-8" onClick={() => setShowNewModal(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> New
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover">
          <DropdownMenuItem onClick={() => navigate('/admin/data-export')}>Export</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/tools/csv-import')}>Import CSV</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={fetchOpportunities}>Refresh list</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <AppLayout
      onNewApplication={() => setShowNewModal(true)}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <ListViewHeader
          icon={TrendingUp}
          category="Opportunities"
          viewLabel={viewLabel}
          color="success"
          pinUrl="/opportunities"
          status={statusText}
          actions={headerActions}
        />
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
            <StatCard label="Active Deals" value={stats.total} icon={TrendingUp} color="success" />
            <StatCard label="In Progress" value={stats.inProgress} icon={Clock} color="warning" />
            <StatCard label="Won" value={stats.won} icon={CheckCircle2} color="primary" />
            <StatCard label="Archived / Dead" value={stats.archived} icon={Archive} color="muted" />
          </div>

          {isTruncated && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Showing the {MAX_ROWS.toLocaleString()} most recently updated opportunities. Counts above
              cover only these rows — narrow the filters to see the rest.
            </div>
          )}

          {/* Toolbar */}
          <ListViewToolbar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search this list..."
            onRefresh={fetchOpportunities}
            onToggleFilters={() => setShowFilters(v => !v)}
            filtersActive={showFilters}
            leftControls={
              (stageFilter !== 'all' || ownerFilter !== 'all' || pipelineFilter !== 'all' || outcomeFilter !== 'all' || searchQuery) && (
                <button
                  onClick={() => { setStageFilter('all'); setOwnerFilter('all'); setPipelineFilter('all'); setOutcomeFilter('all'); setSearchQuery(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear filters ×
                </button>
              )
            }
          />

          {showFilters && (
            <div className="flex items-center gap-2 flex-wrap pb-1">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Stages</SelectItem>
                  {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key} className="text-xs">{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Owners</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map(member => (<SelectItem key={member} value={member} className="text-xs">{member}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Pipeline" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Pipelines</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="gateway_only">Gateway</SelectItem>
                </SelectContent>
              </Select>
              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Outcomes</SelectItem>
                  {Object.entries(OUTCOME_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key} className="text-xs">{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Results */}
          <Card className="border-border/60 overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Click a row to view details · Stage & pipeline editable inline</span>
                <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                  <button onClick={() => setViewMode('table')} className={cn("px-2 py-1 text-xs rounded transition-colors", viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Table</button>
                  <button onClick={() => setViewMode('cards')} className={cn("px-2 py-1 text-xs rounded transition-colors", viewMode === 'cards' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Cards</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {fetchError ? (
                <QueryErrorCard message={fetchError} onRetry={fetchOpportunities} />
              ) : loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : viewMode === 'table' ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
                        <TableHead className="w-10 text-right pr-2 text-xs text-muted-foreground py-2"></TableHead>
                        <TableHead className="w-8 py-2">
                          <Checkbox
                            checked={filteredOpportunities.length > 0 && filteredOpportunities.every(o => selectedIds.has(o.id))}
                            onCheckedChange={() => {
                              const allSel = filteredOpportunities.length > 0 && filteredOpportunities.every(o => selectedIds.has(o.id));
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (allSel) filteredOpportunities.forEach(o => next.delete(o.id));
                                else filteredOpportunities.forEach(o => next.add(o.id));
                                return next;
                              });
                            }}
                            aria-label="Select all rows"
                          />
                        </TableHead>
                        <SortableTableHead field="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                        <TableHead className="text-xs text-muted-foreground">Tier</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Plan</TableHead>
                        <SortableTableHead field="stage" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Stage</SortableTableHead>
                        <SortableTableHead field="outcome" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Outcome</SortableTableHead>
                        <SortableTableHead field="pipeline" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Pipeline</SortableTableHead>
                        <SortableTableHead field="owner" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Owner</SortableTableHead>
                        <SortableTableHead field="tasks" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Tasks</SortableTableHead>
                        <SortableTableHead field="progress" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Progress</SortableTableHead>
                        <SortableTableHead field="created" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Created</SortableTableHead>
                        <SortableTableHead field="updated" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Updated</SortableTableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOpportunities.map((opp, index) => {
                        const stageConfig = STAGE_CONFIG[opp.stage as OpportunityStage];
                        const serviceType = getServiceType(opp);
                        const taskCount = getTaskCount(opp.id);
                        const progress = opp.wizard_state?.progress || 0;
                        
                          // Staleness: days since last update
                          const daysSinceUpdate = daysSince(opp.updated_at);
                          const isStale = isStaleOpportunity(opp);
                        
                        const isSelected = selectedIds.has(opp.id);
                        return (
                          <TableRow
                            key={opp.id}
                            className={cn(
                              "cursor-pointer transition-colors border-b border-border/40",
                              isSelected ? "bg-info/5 hover:bg-info/10" : "hover:bg-muted/30",
                              isStale && "opacity-75"
                            )}
                            onClick={() => navigateToOpportunity(opp)}
                          >
                            <TableCell className="text-right pr-2 text-[11px] text-muted-foreground tabular-nums py-2">{index + 1}</TableCell>
                            <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleRowSelect(opp.id)}
                                aria-label={`Select ${opp.account?.name || 'opportunity'}`}
                              />
                            </TableCell>
                            <TableCell className="py-2">
                              <div>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <p className="text-info hover:underline text-sm font-normal leading-tight">{opp.account?.name || 'Unknown'}</p>
                                  {opp.status === ARCHIVED_STATUS && (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400">archived</Badge>
                                  )}
                                  {isStale && (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-muted text-muted-foreground">{daysSinceUpdate}d</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-none">
                                  {opp.contact?.first_name ? `${opp.contact.first_name} ${opp.contact.last_name || ''}`.trim() : opp.contact?.email || '—'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <PricingBadges
                                gatewayTier={opp.gateway_tier}
                                short
                              />
                            </TableCell>
                            <TableCell className="py-2.5">
                              <PricingBadges
                                pricingPlan={opp.pricing_plan}
                                short
                              />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={opp.stage}
                                onValueChange={async (value) => {
                                   const newStage = value as OpportunityStage;
                                   const oldStage = opp.stage;
                                   const isGateway = getServiceType(opp) === 'gateway_only';
                                   
                                   // Block gateway deals from entering underwriting/processor_approval
                                   const GATEWAY_BLOCKED: OpportunityStage[] = ['underwriting_review', 'processor_approval'];
                                   if (isGateway && GATEWAY_BLOCKED.includes(newStage)) {
                                     toast({ title: "Gateway deals cannot enter Underwriting or Approved stages", variant: "destructive", duration: 4000 });
                                     return;
                                   }
                                   
                                   // Underwriting gate check
                                   if (newStage === 'underwriting_review') {
                                     const gate = await checkUnderwritingGate(opp.id, opp.service_type);
                                     if (!gate.allowed) {
                                       toast({ title: "Cannot proceed to Underwriting", description: gate.reason, variant: "destructive", duration: 6000 });
                                       return;
                                     }
                                   }
                                   
                                   // Duplicate check when moving past discovery.
                                   // This is advisory — it does not block the
                                   // move — so it must not look like an error.
                                   if (newStage !== 'discovery' && opp.stage === 'discovery') {
                                     const dupWarning = await checkDuplicateMerchant(opp.id);
                                     if (dupWarning) {
                                       toast({ title: "Possible duplicate merchant", description: `${dupWarning} — the stage change was still applied.`, duration: 8000 });
                                     }
                                   }

                                   const { error } = await supabase
                                     .from('opportunities')
                                     .update({ stage: newStage })
                                     .eq('id', opp.id);

                                   if (error) {
                                     toast({ title: "Failed to update stage", variant: "destructive" });
                                     return;
                                   }

                                   // Log activity. Every other STAGE_CONFIG read
                                   // in this file is optional-chained; this one
                                   // was not, so a legacy or unmapped stage threw
                                   // here — after the write had already landed —
                                   // losing the activity entry and the toast.
                                   const stageLabel = (stage: string) =>
                                     STAGE_CONFIG[stage as OpportunityStage]?.label ?? stage;

                                   const logged = await logActivity({
                                     opportunity_id: opp.id,
                                     type: 'stage_change',
                                     description: `Moved from ${stageLabel(oldStage)} to ${stageLabel(newStage)}`,
                                     user_id: user?.id,
                                     user_email: user?.email,
                                   });

                                   // Send email notification. These are async and
                                   // can fail after the success toast, so surface
                                   // the failure instead of only logging it.
                                   if (opp.assigned_to) {
                                     sendStageChangeEmail(
                                       opp.assigned_to,
                                       opp.account?.name || 'Unknown Account',
                                       oldStage,
                                       newStage,
                                       user?.email
                                     ).catch(err => {
                                       console.error("Failed to send stage change email:", err);
                                       toast({
                                         title: "Stage saved, but the owner wasn't notified",
                                         description: `Couldn't email ${opp.assigned_to}.`,
                                         variant: "destructive",
                                       });
                                     });
                                    }

                                    // Trigger qualified docs request email
                                    if (newStage === 'qualified') {
                                      sendQualifiedDocsRequest(
                                        opp.id,
                                        opp.account_id,
                                        opp.contact_id
                                      ).catch(err => {
                                        console.error("Failed to send qualified docs email:", err);
                                        toast({
                                          title: "Stage saved, but the docs request wasn't sent",
                                          variant: "destructive",
                                        });
                                      });
                                    }

                                    toast({
                                      title: `Stage updated to ${stageLabel(newStage)}`,
                                      description: logged ? undefined : 'Saved, but the activity log entry failed.',
                                    });

                                    // Don't rely on realtime being enabled for
                                    // this table — the pipeline switcher refetches
                                    // and this path must too, or the row never
                                    // visibly updates.
                                    fetchOpportunities();
                                }}
                              >
                                <SelectTrigger className="h-7 w-auto min-w-[100px] border-0 bg-transparent hover:bg-muted/50 px-2 text-xs gap-1">
                                  <div 
                                    className="w-2 h-2 rounded-full flex-shrink-0" 
                                    style={{ backgroundColor: stageConfig?.color }}
                                  />
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {(serviceType === 'gateway_only' ? GATEWAY_ONLY_PIPELINE_STAGES : PROCESSING_PIPELINE_STAGES).map((stage) => (
                                    <SelectItem key={stage} value={stage} className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-2 h-2 rounded-full" 
                                          style={{ backgroundColor: STAGE_CONFIG[stage].color }}
                                        />
                                        {STAGE_CONFIG[stage].label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-2.5">
                              {opp.outcome_status ? (() => {
                                const oc = OUTCOME_CONFIG[opp.outcome_status as OutcomeStatus];
                                return oc ? (
                                  <div className="flex flex-col gap-0.5">
                                    <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${oc.bgClass} ${oc.textClass} border-current/20`}>
                                      <span className="mr-1">{oc.icon}</span>{oc.label}
                                    </Badge>
                                    {opp.outcome_reason && (
                                      <span className="text-[9px] text-muted-foreground truncate max-w-[140px]" title={opp.outcome_reason}>
                                        {opp.outcome_reason}
                                      </span>
                                    )}
                                  </div>
                                ) : <span className="text-xs text-muted-foreground/40">—</span>;
                              })() : <span className="text-xs text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={serviceType}
                                onValueChange={(value) => switchPipeline(opp, value as 'processing' | 'gateway_only')}
                              >
                                <SelectTrigger className="h-7 w-auto min-w-[100px] border-0 bg-transparent hover:bg-muted/50 px-2 text-xs gap-1">
                                  {serviceType === 'gateway_only' ? (
                                    <Zap className="h-3 w-3 text-teal-500" />
                                  ) : (
                                    <CreditCard className="h-3 w-3 text-indigo-500" />
                                  )}
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  <SelectItem value="processing" className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <CreditCard className="h-3 w-3 text-indigo-500" />
                                      Processing
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="gateway_only" className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <Zap className="h-3 w-3 text-teal-500" />
                                      Gateway
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={opp.assigned_to || 'unassigned'}
                                onValueChange={(value) => handleAssignmentChange(opp, value)}
                              >
                                <SelectTrigger className="h-7 w-auto min-w-[100px] border-0 bg-transparent hover:bg-muted/50 px-2 text-xs gap-1">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {TEAM_MEMBERS.map(member => (
                                    <SelectItem key={member} value={member}>{member}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()} className="py-2.5">
                              {taskCount > 0 ? (
                                <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/20 border hover:bg-destructive/15">
                                  {taskCount}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={cn("h-full rounded-full", progress >= 100 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-primary")}
                                    style={{ width: `${Math.min(progress, 100)}%` }}
                                  />
                                </div>
                                {progress > 0 && <span className="text-[10px] text-muted-foreground">{progress}%</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-muted-foreground">
                              {formatCreated(opp.created_at)}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true }).replace('about ', '').replace('less than a minute ago', 'just now')}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()} className="w-10 py-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 hover:opacity-100">
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-popover">
                                  <DropdownMenuItem onClick={() => navigateToOpportunity(opp)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() =>
                                    switchPipeline(opp, getServiceType(opp) === 'gateway_only' ? 'processing' : 'gateway_only')
                                  }>
                                    {getServiceType(opp) === 'gateway_only' ? (
                                      <><CreditCard className="h-4 w-4 mr-2" />Switch to Processing</>
                                    ) : (
                                      <><Zap className="h-4 w-4 mr-2" />Switch to Gateway</>
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredOpportunities.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={14}>
                            <EmptyState
                              icon={TrendingUp}
                              title="No opportunities found"
                              description="Adjust your filters or create a new application."
                              actionLabel="New Application"
                              onAction={() => setShowNewModal(true)}
                              size="sm"
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredOpportunities.map(opp => {
                    const stageConfig = STAGE_CONFIG[opp.stage as OpportunityStage];
                    const serviceType = getServiceType(opp);
                    const progress = opp.wizard_state?.progress || 0;
                    // Same rule as the table view — the card view used to omit
                    // the closed-stage exclusion, so won deals showed "43d idle".
                    const daysIdle = daysSince(opp.updated_at);
                    const isStale = isStaleOpportunity(opp);
                    const taskCnt = getTaskCount(opp.id);
                    
                    return (
                      <Card 
                        key={opp.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => navigateToOpportunity(opp)}
                      >
                        <CardContent className="p-0">
                          {/* Stage colored header strip */}
                          <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageConfig?.color }} />
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{stageConfig?.label}</span>
                                {isStale && <span className="text-[10px] text-muted-foreground/50">{daysIdle}d idle</span>}
                              </div>
                              <h3 className="font-semibold text-sm leading-tight">{opp.account?.name || 'Unknown'}</h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-xs text-muted-foreground">
                                  {opp.contact?.first_name ? `${opp.contact.first_name} ${opp.contact.last_name || ''}`.trim() : opp.contact?.email || '—'}
                                </p>
                                <PricingBadges
                                  pricingPlan={opp.pricing_plan}
                                  gatewayTier={opp.gateway_tier}
                                  short
                                  size="xs"
                                />
                              </div>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Select value={opp.assigned_to || 'unassigned'} onValueChange={(value) => handleAssignmentChange(opp, value)}>
                                <SelectTrigger className="h-6 w-auto border-0 bg-transparent hover:bg-muted/50 px-1.5 text-[10px] gap-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {TEAM_MEMBERS.map(member => (<SelectItem key={member} value={member}>{member}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {/* Progress bar */}
                          {progress > 0 && (
                            <div className="px-4 pb-2">
                              <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                <div className={cn("h-full rounded-full", progress >= 100 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-primary")}
                                  style={{ width: `${Math.min(progress, 100)}%` }} />
                              </div>
                            </div>
                          )}
                          {/* Footer */}
                          <div className="px-4 py-2.5 border-t border-border/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {serviceType === 'gateway_only' ? '⚡ Gateway' : '💳 Processing'}
                              </span>
                              {taskCnt > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{taskCnt} task{taskCnt !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground/50">
                              {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true }).replace('about ', '')}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* New Application Modal */}
        <NewApplicationModal
          open={showNewModal}
          onClose={() => setShowNewModal(false)}
          onSubmit={fetchOpportunities}
        />

        {/* Reactivation Confirmation Dialog */}
        <AlertDialog open={!!reactivateConfirm} onOpenChange={(open) => !open && setReactivateConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-500" />
                Reactivate Archived Opportunity?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This opportunity is currently archived. Assigning it to <span className="font-medium text-foreground">{reactivateConfirm?.assignee}</span> will:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Reactivate the opportunity</li>
                  <li>Move it back to the pipeline</li>
                  <li>Assign it to {reactivateConfirm?.assignee}</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmReactivation}>
                Reactivate & Assign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default Opportunities;
