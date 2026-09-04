import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { supabase } from "@/integrations/supabase/client";
import { syncAccountReferrerForOpportunity } from "@/lib/referrerAssignment";
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
  Archive,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const [persisted] = useState<PersistedFilters>(() => {
    // URL wins over sessionStorage: a link someone shares must open the view
    // they meant, not whatever this browser last had.
    const stored = readPersistedFilters();
    const p = new URLSearchParams(window.location.search);
    const pick = <T extends string>(key: string, fallback: T | undefined) =>
      (p.get(key) as T | null) ?? fallback;
    return {
      ...stored,
      searchQuery: pick('q', stored.searchQuery),
      stageFilter: pick('stage', stored.stageFilter),
      ownerFilter: pick('owner', stored.ownerFilter),
      pipelineFilter: pick('pipeline', stored.pipelineFilter),
      outcomeFilter: pick('outcome', stored.outcomeFilter),
      viewTab: pick('tab', stored.viewTab) as 'all' | 'archive' | undefined,
      viewMode: pick('view', stored.viewMode) as 'table' | 'cards' | undefined,
    };
  });

  const [searchQuery, setSearchQuery] = useState<string>(persisted.searchQuery ?? "");
  const [stageFilter, setStageFilter] = useState<string>(persisted.stageFilter ?? "all");
  const [ownerFilter, setOwnerFilter] = useState<string>(persisted.ownerFilter ?? "all");
  const [pipelineFilter, setPipelineFilter] = useState<string>(persisted.pipelineFilter ?? "all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>(persisted.outcomeFilter ?? "all");
  const [sortField, setSortField] = useState<SortField>(persisted.sortField ?? 'updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>(persisted.sortDirection ?? 'desc');
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(persisted.viewMode ?? 'table');
  const isMobile = useIsMobile();
  // #159: the table is fourteen columns with four inline Selects per row. On a
  // 360px phone that is unusable however much it scrolls, so cards are forced
  // below md. The stored preference is left untouched - widen the window and
  // the user's chosen view comes back.
  const effectiveViewMode: 'table' | 'cards' = isMobile ? 'cards' : viewMode;
  const [viewTab, setViewTab] = useState<'all' | 'archive'>(persisted.viewTab ?? 'all');
  const [reactivateConfirm, setReactivateConfirm] = useState<{ opp: Opportunity; assignee: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState<boolean>(persisted.showFilters ?? false);
  const [isTruncated, setIsTruncated] = useState(false);
  // Ids with an inline write in flight, so a row can show it is saving
  // instead of looking like nothing happened.
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // A duplicate warning that renders as an error toast but lets the change
  // through reads as a failure and behaves as a note. Ask instead.
  const [duplicateConfirm, setDuplicateConfirm] = useState<
    { opp: Opportunity; newStage: OpportunityStage; message: string } | null
  >(null);
  const [channelId] = useState(() => ++channelSeq);
  // formatDistanceToNow renders once; without a ticker "2 minutes ago" is
  // still on screen an hour later.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

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

  // #79 — toast fatigue. Every inline edit fired a toast, so the ones that
  // matter (failures) were buried in a stream of ones that didn't. Successes
  // now flash a brief inline confirmation on the row; toasts are reserved for
  // failures and for actions with no on-screen result.
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const confirmInline = useCallback((id: string) => {
    setConfirmedIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setConfirmedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1800);
  }, []);

  const markSaving = useCallback((id: string, saving: boolean) => {
    setSavingIds(prev => {
      const next = new Set(prev);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleRowSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mirror filters into the URL so a filtered view can be shared, bookmarked
  // and reopened in a second tab. sessionStorage alone couldn't do any of that.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, dflt: string) => {
      if (value && value !== dflt) next.set(key, value);
      else next.delete(key);
    };
    setOrDelete('q', searchQuery, '');
    setOrDelete('stage', stageFilter, 'all');
    setOrDelete('owner', ownerFilter, 'all');
    setOrDelete('pipeline', pipelineFilter, 'all');
    setOrDelete('outcome', outcomeFilter, 'all');
    setOrDelete('tab', viewTab, 'all');
    setOrDelete('view', viewMode, 'table');
    // `new` is consumed by the effect below; never re-add it here.
    next.delete('new');

    if (next.toString() !== new URLSearchParams(window.location.search).toString()) {
      // replace, not push: typing in the search box must not fill the history
      // stack with one entry per keystroke.
      setSearchParams(next, { replace: true });
    }
  }, [searchQuery, stageFilter, ownerFilter, pipelineFilter, outcomeFilter, viewTab, viewMode, setSearchParams]);

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
      // Reps search by whatever identifier is in front of them — a DBA on a
      // statement, a phone number from a voicemail, an MID from the processor,
      // or an id pasted from a link.
      filtered = filtered.filter(opp => {
        // NOTE: the audit also suggested DBA, MID and the Kurv/NMI references.
        // None of those are on the Account/Opportunity types the list query
        // selects, so searching them needs the query widened first — see
        // src/types/opportunity.ts.
        const haystack = [
          opp.account?.name,
          opp.account?.website,
          opp.contact?.email,
          opp.contact?.first_name,
          opp.contact?.last_name,
          opp.contact?.phone,
          opp.id,
          opp.portal_merchant_id,
          opp.username,
          opp.referral_source,
        ];
        return haystack.some(v => typeof v === 'string' && v.toLowerCase().includes(query));
      });
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

    if (isReactivation) {
      // Reactivation changes status and possibly stage — more than the row
      // shows — so it keeps a toast.
      toast({ title: `Reactivated and assigned to ${assigneeValue}` });
    } else {
      confirmInline(opp.id);
    }
    if (!logged) {
      toast({ title: 'Saved, but the activity log entry failed', variant: 'destructive' });
    }

    fetchOpportunities();
  };

  /**
   * Commit a stage change. Split out of the inline Select handler so the
   * duplicate-merchant dialog can resume the same code path after the user
   * confirms, rather than duplicating it.
   */
  const applyStageChange = useCallback(async (opp: Opportunity, newStage: OpportunityStage) => {
    const oldStage = opp.stage;
    markSaving(opp.id, true);
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ stage: newStage })
        .eq('id', opp.id);

      if (error) {
        toast({ title: "Failed to update stage", variant: "destructive" });
        return;
      }

      // Every other STAGE_CONFIG read in this file is optional-chained; this
      // one was not, so a legacy or unmapped stage threw here — after the
      // write had landed — losing the activity entry and the toast.
      const stageLabel = (stage: string) =>
        STAGE_CONFIG[stage as OpportunityStage]?.label ?? stage;

      // A deal that just went live hands its partner over to the account, so
      // the affiliate keeps earning on the merchant they introduced.
      if (newStage === 'closed_won') {
        await syncAccountReferrerForOpportunity(opp.id, newStage);
      }

      const logged = await logActivity({
        opportunity_id: opp.id,
        type: 'stage_change',
        description: `Moved from ${stageLabel(oldStage)} to ${stageLabel(newStage)}`,
        user_id: user?.id,
        user_email: user?.email,
      });

      // These are async and can fail after the success toast, so surface the
      // failure instead of only logging it.
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

      if (newStage === 'qualified') {
        sendQualifiedDocsRequest(opp.id, opp.account_id, opp.contact_id).catch(err => {
          console.error("Failed to send qualified docs email:", err);
          toast({ title: "Stage saved, but the docs request wasn't sent", variant: "destructive" });
        });
      }

      // Quiet success: the row already shows the new stage, so a toast just
      // adds noise. A failed audit-log write still warrants one.
      confirmInline(opp.id);
      if (!logged) {
        toast({
          title: 'Stage saved, but the activity log entry failed',
          variant: 'destructive',
        });
      }

      // Don't rely on realtime being enabled for this table.
      fetchOpportunities();
    } finally {
      markSaving(opp.id, false);
    }
  }, [toast, user, fetchOpportunities, markSaving, confirmInline]);

  /**
   * Run the pre-flight checks for a stage change, then either commit it or
   * stop and ask. The duplicate check now BLOCKS: it used to render a
   * destructive toast and apply the change anyway, which looks like an error
   * and behaves like a note.
   */
  const requestStageChange = useCallback(async (opp: Opportunity, newStage: OpportunityStage) => {
    if (newStage === opp.stage) return;

    // Gateway deals can't enter underwriting/processor approval.
    const GATEWAY_BLOCKED: OpportunityStage[] = ['underwriting_review', 'processor_approval'];
    if (getServiceType(opp) === 'gateway_only' && GATEWAY_BLOCKED.includes(newStage)) {
      toast({ title: "Gateway deals cannot enter Underwriting or Approved stages", variant: "destructive", duration: 4000 });
      return;
    }

    markSaving(opp.id, true);
    try {
      if (newStage === 'underwriting_review') {
        const gate = await checkUnderwritingGate(opp.id, opp.service_type);
        if (!gate.allowed) {
          toast({ title: "Cannot proceed to Underwriting", description: gate.reason, variant: "destructive", duration: 6000 });
          return;
        }
      }

      if (newStage !== 'discovery' && opp.stage === 'discovery') {
        const dupWarning = await checkDuplicateMerchant(opp.id);
        if (dupWarning) {
          setDuplicateConfirm({ opp, newStage, message: dupWarning });
          return;
        }
      }
    } finally {
      markSaving(opp.id, false);
    }

    await applyStageChange(opp, newStage);
  }, [toast, markSaving, applyStageChange]);

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

    confirmInline(opp.id);
    if (!logged) {
      toast({ title: 'Saved, but the activity log entry failed', variant: 'destructive' });
    }
    fetchOpportunities();
  }, [toast, user, fetchOpportunities, confirmInline]);

  const confirmReactivation = () => {
    if (reactivateConfirm) {
      performAssignmentUpdate(reactivateConfirm.opp, reactivateConfirm.assignee, true);
      setReactivateConfirm(null);
    }
  };

  /**
   * #66 — bulk actions.
   *
   * The list already had a select-all header, per-row checkboxes and an
   * "N items selected" counter, and did nothing with any of it. These are the
   * operations the selection UI was implicitly promising.
   *
   * Writes go one statement per action via `.in()` rather than a loop, so a
   * hundred rows is one round trip. The activity log is written per row
   * because that is what the audit trail records.
   */
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<
    { kind: 'archive' | 'stage' | 'owner'; value?: string; label: string } | null
  >(null);

  const selectedOpportunities = useMemo(
    () => filteredOpportunities.filter(o => selectedIds.has(o.id)),
    [filteredOpportunities, selectedIds],
  );

  const runBulk = useCallback(async (
    payload: Record<string, unknown>,
    activityType: string,
    describe: (opp: Opportunity) => string,
  ) => {
    const targets = selectedOpportunities;
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const ids = targets.map(o => o.id);
      const { error } = await supabase.from('opportunities').update(payload).in('id', ids);
      if (error) {
        toast({ title: `Couldn't update ${ids.length} opportunities`, description: error.message, variant: 'destructive' });
        return;
      }

      // One activity row per opportunity — the trail is per-record.
      const { error: logError } = await supabase.from('activities').insert(
        targets.map(opp => ({
          opportunity_id: opp.id,
          type: activityType,
          description: describe(opp),
          user_id: user?.id,
          user_email: user?.email,
        })) as ActivityInsert[],
      );

      toast({
        title: `Updated ${ids.length} opportunit${ids.length === 1 ? 'y' : 'ies'}`,
        description: logError ? 'Saved, but the activity log entries failed.' : undefined,
      });
      setSelectedIds(new Set());
      fetchOpportunities();
    } finally {
      setBulkBusy(false);
    }
  }, [selectedOpportunities, toast, user, fetchOpportunities]);

  /** Bulk export of the current selection as CSV — client-side, no round trip. */
  const exportSelection = useCallback(() => {
    const rows = selectedOpportunities;
    if (rows.length === 0) return;
    const cols: [string, (o: Opportunity) => string][] = [
      ['Account', o => o.account?.name ?? ''],
      ['Contact', o => o.contact?.first_name ? `${o.contact.first_name} ${o.contact.last_name ?? ''}`.trim() : (o.contact?.email ?? '')],
      ['Email', o => o.contact?.email ?? ''],
      ['Stage', o => STAGE_CONFIG[o.stage as OpportunityStage]?.label ?? o.stage],
      ['Pipeline', o => getServiceType(o) === 'gateway_only' ? 'Gateway' : 'Processing'],
      ['Owner', o => o.assigned_to ?? 'Unassigned'],
      ['Status', o => o.status ?? ''],
      ['Created', o => o.created_at],
      ['Updated', o => o.updated_at],
    ];
    // Quote every field and double embedded quotes — account names contain
    // commas often enough that unquoted output corrupts the file.
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      cols.map(c => esc(c[0])).join(','),
      ...rows.map(o => cols.map(c => esc(c[1](o))).join(',')),
    ].join('\r\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `opportunities-${rows.length}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${rows.length} opportunit${rows.length === 1 ? 'y' : 'ies'}` });
  }, [selectedOpportunities, toast]);

  // Counted rather than just flagged, so the mobile filter sheet can show how
  // many are applied without the user opening it (#161).
  const activeFilterCount =
    (stageFilter !== 'all' ? 1 : 0) +
    (ownerFilter !== 'all' ? 1 : 0) +
    (pipelineFilter !== 'all' ? 1 : 0) +
    (outcomeFilter !== 'all' ? 1 : 0) +
    (searchQuery !== '' ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = useCallback(() => {
    setStageFilter('all');
    setOwnerFilter('all');
    setPipelineFilter('all');
    setOutcomeFilter('all');
    setSearchQuery('');
  }, []);

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
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={fetchOpportunities}
        disabled={loading}
        title="Refresh list"
      >
        <RotateCcw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} /> Refresh
      </Button>
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

          {/* #66 — bulk action bar. Appears only with a selection, and every
              destructive or wide-reaching action confirms first. */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap rounded-md border border-info/30 bg-info/5 px-3 py-2">
              <span className="text-xs font-medium text-foreground">
                {selectedCount} selected
              </span>

              <Select
                value=""
                onValueChange={(v) =>
                  setBulkConfirm({ kind: 'owner', value: v, label: v === 'unassigned' ? 'Unassigned' : v })
                }
                disabled={bulkBusy}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map(m => (<SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>))}
                </SelectContent>
              </Select>

              <Select
                value=""
                onValueChange={(v) =>
                  setBulkConfirm({ kind: 'stage', value: v, label: STAGE_CONFIG[v as OpportunityStage]?.label ?? v })
                }
                disabled={bulkBusy}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Move to stage…" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {PROCESSING_PIPELINE_STAGES.map(st => (
                    <SelectItem key={st} value={st} className="text-xs">{STAGE_CONFIG[st].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={bulkBusy}
                onClick={() => setBulkConfirm({ kind: 'archive', label: 'Archive' })}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
              </Button>

              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={bulkBusy} onClick={exportSelection}>
                <Upload className="h-3.5 w-3.5 mr-1.5 rotate-180" /> Export CSV
              </Button>

              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear selection
              </button>

              {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
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
              hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear filters ×
                </button>
              )
            }
          />

          {/* #161: four Selects in a wrapping row is a desktop layout. On a
              phone they stack raggedly and each trigger is 32px tall, so on
              mobile the same controls open in a sheet with full-width, 44px
              targets and an applied count. Desktop keeps the inline row. */}
          {showFilters && !isMobile && (
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

          {isMobile && (
            <Drawer open={showFilters} onOpenChange={setShowFilters}>
              <DrawerContent className="max-h-[85dvh]">
                <DrawerHeader className="text-left">
                  <DrawerTitle className="flex items-center gap-2">
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-2 text-xs">{activeFilterCount}</Badge>
                    )}
                  </DrawerTitle>
                </DrawerHeader>
                <div className="px-4 pb-4 space-y-3 overflow-y-auto">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Stages</SelectItem>
                  {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key} >{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Owners</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map(member => (<SelectItem key={member} value={member} >{member}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
                <SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Pipeline" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Pipelines</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="gateway_only">Gateway</SelectItem>
                </SelectContent>
              </Select>
              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Outcome" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Outcomes</SelectItem>
                  {Object.entries(OUTCOME_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key} >{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
                </div>
                <DrawerFooter className="flex-row gap-2 pt-0">
                  <Button variant="outline" className="flex-1 h-11" onClick={clearFilters} disabled={activeFilterCount === 0}>
                    Clear
                  </Button>
                  <Button className="flex-1 h-11" onClick={() => setShowFilters(false)}>
                    Show {filteredOpportunities.length} result{filteredOpportunities.length === 1 ? '' : 's'}
                  </Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          )}

          {/* Results */}
          <Card className="border-border/60 overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {isMobile
                    ? "Tap a card to view details"
                    : "Click a row to view details · Stage & pipeline editable inline"}
                </span>
                {/* No point offering a fourteen-column table on a phone. */}
                {!isMobile && (
                  <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                    <button onClick={() => setViewMode('table')} className={cn("px-2 py-1 text-xs rounded transition-colors", viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Table</button>
                    <button onClick={() => setViewMode('cards')} className={cn("px-2 py-1 text-xs rounded transition-colors", viewMode === 'cards' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Cards</button>
                  </div>
                )}
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
              ) : effectiveViewMode === 'table' ? (
                <div className="rounded-md border overflow-x-auto max-h-[calc(100vh-22rem)] overflow-y-auto">
                  {/* overflow-x-auto: fourteen columns clip on a 1366px laptop
                      inside the Card's overflow-hidden. max-h + sticky header
                      keeps the column labels visible while scrolling. */}
                  <Table>
                    <TableHeader className="sticky top-0 z-20 bg-background">
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
                        const isSaving = savingIds.has(opp.id);
                        const justSaved = confirmedIds.has(opp.id);
                        return (
                          <TableRow
                            key={opp.id}
                            className={cn(
                              "cursor-pointer transition-colors border-b border-border/40",
                              isSelected ? "bg-info/5 hover:bg-info/10" : "hover:bg-muted/30",
                              isStale && "opacity-75",
                              // Inline edits write straight to the DB; without
                              // this the row looks inert while it saves.
                              isSaving && "opacity-60 pointer-events-none",
                              justSaved && "bg-emerald-500/5"
                            )}
                            aria-busy={isSaving}
                            onClick={() => navigateToOpportunity(opp)}
                            tabIndex={0}
                            role="link"
                            aria-label={`Open ${opp.account?.name || 'opportunity'}`}
                            onKeyDown={(e) => {
                              // A <tr onClick> is not focusable and ignores the
                              // keyboard. Enter/Space now match a real link.
                              if (e.key === 'Enter' || e.key === ' ') {
                                if (e.target !== e.currentTarget) return;
                                e.preventDefault();
                                navigateToOpportunity(opp);
                              }
                            }}
                          >
                            <TableCell className="text-right pr-2 text-[11px] text-muted-foreground tabular-nums py-2">
                              {isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin inline-block text-muted-foreground" />
                              ) : confirmedIds.has(opp.id) ? (
                                // #79: quiet success — replaces a toast per edit.
                                <Check className="h-3 w-3 inline-block text-emerald-500" />
                              ) : (
                                index + 1
                              )}
                            </TableCell>
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
                                onValueChange={(value) =>
                                  requestStageChange(opp, value as OpportunityStage)
                                }
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
                            {hasActiveFilters ? (
                              <EmptyState
                                icon={TrendingUp}
                                title="No matches"
                                description="No opportunities match the current search and filters."
                                actionLabel="Clear filters"
                                onAction={clearFilters}
                                size="sm"
                              />
                            ) : (
                              <EmptyState
                                icon={TrendingUp}
                                title={viewTab === 'archive' ? 'Nothing archived' : 'No opportunities yet'}
                                description={
                                  viewTab === 'archive'
                                    ? 'Archived opportunities will appear here.'
                                    : 'Create your first application to start tracking a deal.'
                                }
                                actionLabel={viewTab === 'archive' ? undefined : 'New Application'}
                                onAction={viewTab === 'archive' ? undefined : () => setShowNewModal(true)}
                                size="sm"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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
                                <span className="text-xs md:text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{stageConfig?.label}</span>
                                {isStale && <span className="text-xs md:text-[10px] text-muted-foreground/50">{daysIdle}d idle</span>}
                              </div>
                              <h3 className="font-semibold text-base md:text-sm leading-tight">{opp.account?.name || 'Unknown'}</h3>
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
                                <SelectTrigger
                                  aria-label="Assigned to"
                                  className="h-11 md:h-6 w-auto border-0 bg-transparent hover:bg-muted/50 px-2.5 md:px-1.5 text-xs md:text-[10px] gap-1"
                                >
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
                              <span className="text-xs md:text-[10px] text-muted-foreground">
                                {serviceType === 'gateway_only' ? '⚡ Gateway' : '💳 Processing'}
                              </span>
                              {taskCnt > 0 && (
                                <span className="text-xs md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{taskCnt} task{taskCnt !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                            <span className="text-xs md:text-[10px] text-muted-foreground/50">
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

        {/* Bulk action confirmation (#66). Every bulk write goes through here
            — a mis-click on a 200-row selection is not something to make
            silently recoverable-only. */}
        <AlertDialog open={!!bulkConfirm} onOpenChange={(open) => !open && setBulkConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {bulkConfirm?.kind === 'archive' && `Archive ${selectedCount} opportunit${selectedCount === 1 ? 'y' : 'ies'}?`}
                {bulkConfirm?.kind === 'stage' && `Move ${selectedCount} to ${bulkConfirm.label}?`}
                {bulkConfirm?.kind === 'owner' && `Reassign ${selectedCount} to ${bulkConfirm.label}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {bulkConfirm?.kind === 'archive'
                  ? 'They will move to the Archive tab and out of the active list. This can be undone by reassigning them.'
                  : 'This applies to every selected opportunity and is recorded in each one\u2019s activity log.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!bulkConfirm) return;
                  const c = bulkConfirm;
                  setBulkConfirm(null);
                  if (c.kind === 'archive') {
                    runBulk({ status: ARCHIVED_STATUS }, 'archived', () => 'Archived (bulk action)');
                  } else if (c.kind === 'stage') {
                    runBulk({ stage: c.value }, 'stage_change',
                      opp => `Moved from ${STAGE_CONFIG[opp.stage as OpportunityStage]?.label ?? opp.stage} to ${c.label} (bulk action)`);
                  } else {
                    const assignee = c.value === 'unassigned' ? null : c.value;
                    runBulk({ assigned_to: assignee }, 'assignment_change',
                      () => `Assigned to ${assignee ?? 'Unassigned'} (bulk action)`);
                  }
                }}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Possible-duplicate confirmation (#68). Blocks the stage change
            until the rep decides, instead of warning and proceeding anyway. */}
        <AlertDialog open={!!duplicateConfirm} onOpenChange={(open) => !open && setDuplicateConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-amber-500" />
                Possible duplicate merchant
              </AlertDialogTitle>
              <AlertDialogDescription>
                {duplicateConfirm?.message}
                <span className="block mt-2">
                  Moving <span className="font-medium text-foreground">{duplicateConfirm?.opp.account?.name || 'this opportunity'}</span>
                  {' '}out of Discovery anyway may create a second record for the same merchant.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!duplicateConfirm) return;
                  const { opp, newStage } = duplicateConfirm;
                  setDuplicateConfirm(null);
                  applyStageChange(opp, newStage);
                }}
              >
                Continue anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
