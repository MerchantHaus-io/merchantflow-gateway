import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { supabase } from "@/integrations/supabase/client";
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
  Search, 
  Filter, 
  Building2, 
  User, 
  Calendar, 
  Clock, 
  ArrowUpDown, 
  Eye,
  Zap,
  CreditCard,
  MoreHorizontal,
  ChevronDown,
  Plus,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Archive
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import OpportunityDetailModal from "@/components/OpportunityDetailModal";
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

type SortField = 'name' | 'stage' | 'outcome' | 'pipeline' | 'owner' | 'tasks' | 'progress' | 'created' | 'updated';
type SortDirection = 'asc' | 'desc';

const Opportunities = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { tasks } = useTasks();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [viewTab, setViewTab] = useState<'all' | 'archive'>('all');
  const [reactivateConfirm, setReactivateConfirm] = useState<{ opp: Opportunity; assignee: string } | null>(null);

  // Handle ?new=true query param from sidebar navigation
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowNewModal(true);
      // Clear the query param
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          *,
          account:accounts(*),
          contact:contacts(*),
          wizard_state:onboarding_wizard_states(*)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((opp: any) => ({
        ...opp,
        stage: migrateStage(opp.stage),
        wizard_state: Array.isArray(opp.wizard_state) ? opp.wizard_state[0] : opp.wizard_state,
      }));

      setOpportunities(mapped);
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

    // Subscribe to realtime updates
    const channel = supabase
      .channel('opportunities-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, fetchOpportunities)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOpportunities]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as SortField);
      setSortDirection('asc');
    }
  };

  const getTaskCount = (opportunityId: string) => {
    return tasks.filter(t => t.relatedOpportunityId === opportunityId && t.status === 'open').length;
  };

  const filteredOpportunities = useMemo(() => {
    // Exclude auto-synced email leads — they belong on the Leads page only
    let filtered = opportunities.filter(opp => (opp.account?.status as string) !== 'lead');

    // Tab-level filter: archive tab shows only archived, all tab excludes archived
    if (viewTab === 'archive') {
      filtered = filtered.filter(opp => (opp.status as string) === 'archived');
    } else {
      filtered = filtered.filter(opp => (opp.status as string) !== 'archived');
      // Status filter (within non-archived)
      if (statusFilter !== "all") {
        filtered = filtered.filter(opp => 
          statusFilter === "active" ? opp.status !== 'dead' : opp.status === 'dead'
        );
      }
    }

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
  }, [opportunities, searchQuery, stageFilter, ownerFilter, pipelineFilter, statusFilter, viewTab, sortField, sortDirection, tasks]);

  // Stats
  const stats = useMemo(() => {
    const nonArchived = opportunities.filter(o => (o.status as string) !== 'archived');
    const active = nonArchived.filter(o => o.status !== 'dead');
    const byStage: Record<string, number> = {};
    active.forEach(o => {
      byStage[o.stage] = (byStage[o.stage] || 0) + 1;
    });
    
    return {
      total: active.length,
      new: byStage['application_started'] || 0,
      inProgress: active.filter(o => !['application_started', 'live_activated', 'closed_won', 'closed_lost'].includes(o.stage)).length,
      won: (byStage['live_activated'] || 0) + (byStage['closed_won'] || 0),
      lost: nonArchived.filter(o => o.status === 'dead').length,
      archived: opportunities.filter(o => (o.status as string) === 'archived').length,
    };
  }, [opportunities]);

  const navigateToOpportunity = (opp: Opportunity) => {
    navigate(`/opportunities/${opp.id}`);
  };

  const handleAssignmentChange = (opp: Opportunity, newAssignee: string) => {
    const wasArchived = opp.status === 'dead';
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
    
    await supabase.from('activities').insert({
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
        : `Assigned to ${assigneeValue || 'Unassigned'}` 
    });
  };

  const confirmReactivation = () => {
    if (reactivateConfirm) {
      performAssignmentUpdate(reactivateConfirm.opp, reactivateConfirm.assignee, true);
      setReactivateConfirm(null);
    }
  };

  return (
    <AppLayout
      onNewApplication={() => setShowNewModal(true)}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={TrendingUp}
          title="Opportunities"
          color="success"
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setViewTab('all')}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    viewTab === 'all' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                <button
                  onClick={() => setViewTab('archive')}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
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
              <Button size="sm" onClick={() => setShowNewModal(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Application
              </Button>
            </div>
          }
        />
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger-children">
            <StatCard label="Active Deals" value={stats.total} icon={TrendingUp} color="success" />
            <StatCard label="In Progress" value={stats.inProgress} icon={Clock} color="warning" />
            <StatCard label="Won" value={stats.won} icon={CheckCircle2} color="primary" />
            <StatCard label="Closed / Dead" value={stats.lost} icon={XCircle} color="destructive" />
            <StatCard label="Archived" value={stats.archived} icon={Archive} color="muted" />
          </div>

          {/* Filters toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{filteredOpportunities.length} {filteredOpportunities.length === 1 ? 'opportunity' : 'opportunities'}</span>
              {(stageFilter !== 'all' || ownerFilter !== 'all' || pipelineFilter !== 'all' || searchQuery) && (
                <button onClick={() => { setStageFilter('all'); setOwnerFilter('all'); setPipelineFilter('all'); setSearchQuery(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Clear filters ×
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 w-48 text-sm" />
              </div>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Stages</SelectItem>
                  {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key} className="text-xs">{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Owners</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map(member => (<SelectItem key={member} value={member} className="text-xs">{member}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Pipeline" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Pipelines</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="gateway_only">Gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
                      <TableRow>
                        <TableHead className="w-10 text-right pr-2 text-xs text-muted-foreground">#</TableHead>
                        <SortableTableHead field="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
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
                          const daysSinceUpdate = Math.floor((Date.now() - new Date(opp.updated_at).getTime()) / 86400000);
                          const isStale = daysSinceUpdate > 7 && !['live_activated', 'closed_won', 'closed_lost'].includes(opp.stage);
                        
                        return (
                          <TableRow 
                            key={opp.id} 
                            className={cn("cursor-pointer hover:bg-muted/30 transition-colors", isStale && "opacity-75")}
                            onClick={() => navigateToOpportunity(opp)}
                          >
                            <TableCell className="text-right pr-2 text-[11px] text-muted-foreground tabular-nums py-2.5">{index + 1}</TableCell>
                            <TableCell className="py-2.5">
                              <div>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <p className="font-medium text-sm leading-tight">{opp.account?.name || 'Unknown'}</p>
                                  {opp.status === 'dead' && (
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
                                   
                                   // Duplicate check when moving past discovery
                                   if (newStage !== 'discovery' && opp.stage === 'discovery') {
                                     const dupWarning = await checkDuplicateMerchant(opp.id);
                                     if (dupWarning) {
                                       toast({ title: "Duplicate Warning", description: dupWarning, variant: "destructive", duration: 8000 });
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
                                   
                                   // Log activity
                                   await supabase.from('activities').insert({
                                     opportunity_id: opp.id,
                                     type: 'stage_change',
                                     description: `Moved from ${STAGE_CONFIG[oldStage as OpportunityStage].label} to ${STAGE_CONFIG[newStage].label}`,
                                     user_id: user?.id,
                                     user_email: user?.email,
                                   });
                                   
                                   // Send email notification
                                   if (opp.assigned_to) {
                                     sendStageChangeEmail(
                                       opp.assigned_to,
                                       opp.account?.name || 'Unknown Account',
                                       oldStage,
                                       newStage,
                                       user?.email
                                     ).catch(err => console.error("Failed to send stage change email:", err));
                                    }
                                    
                                    // Trigger qualified docs request email
                                    if (newStage === 'qualified') {
                                      sendQualifiedDocsRequest(
                                        opp.id,
                                        opp.account_id,
                                        opp.contact_id
                                      ).catch(err => console.error("Failed to send qualified docs email:", err));
                                    }
                                    
                                    toast({ title: `Stage updated to ${STAGE_CONFIG[newStage].label}` });
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
                                onValueChange={async (value) => {
                                  if (value === serviceType) return;
                                  const newType = value as 'processing' | 'gateway_only';
                                  const GATEWAY_STAGES = ['discovery', 'qualified', 'gateway_submitted', 'integration_setup', 'testing', 'go_live_ready'];
                                  const stageReset = (newType === 'gateway_only' && !GATEWAY_STAGES.includes(opp.stage)) ? 'discovery' : undefined;
                                  
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
                                  await supabase.from('activities').insert({
                                    opportunity_id: opp.id,
                                    type: 'pipeline_change',
                                    description: `Switched from ${serviceType === 'gateway_only' ? 'Gateway' : 'Processing'} to ${newType === 'gateway_only' ? 'Gateway' : 'Processing'}${stageReset ? ' (stage reset to Discovery)' : ''}`,
                                    user_id: user?.id,
                                    user_email: user?.email,
                                  });
                                  toast({ title: `Switched to ${newType === 'gateway_only' ? 'Gateway' : 'Processing'} pipeline` });
                                  fetchOpportunities();
                                }}
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
                              {format(new Date(opp.created_at), 'MMM d')}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true }).replace('about ', '').replace('less than a minute ago', 'just now')}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-popover">
                                  <DropdownMenuItem onClick={() => navigateToOpportunity(opp)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={async () => {
                                    const currentType = getServiceType(opp);
                                    const newType = currentType === 'gateway_only' ? 'processing' : 'gateway_only';
                                    const newStage = opp.stage;
                                    // If switching to gateway_only and current stage is not in gateway pipeline, reset to discovery
                                    const GATEWAY_STAGES = ['discovery', 'qualified', 'gateway_submitted', 'integration_setup', 'testing', 'go_live_ready'];
                                    const stageUpdate = (newType === 'gateway_only' && !GATEWAY_STAGES.includes(newStage)) ? 'discovery' : undefined;
                                    
                                    const updatePayload: Record<string, unknown> = { service_type: newType };
                                    if (stageUpdate) updatePayload.stage = stageUpdate;
                                    
                                    const { error } = await supabase
                                      .from('opportunities')
                                      .update(updatePayload)
                                      .eq('id', opp.id);
                                    if (error) {
                                      toast({ title: "Failed to switch pipeline", variant: "destructive" });
                                      return;
                                    }
                                    await supabase.from('activities').insert({
                                      opportunity_id: opp.id,
                                      type: 'pipeline_change',
                                      description: `Switched from ${currentType === 'gateway_only' ? 'Gateway' : 'Processing'} to ${newType === 'gateway_only' ? 'Gateway' : 'Processing'}${stageUpdate ? ' (stage reset to Discovery)' : ''}`,
                                      user_id: user?.id,
                                      user_email: user?.email,
                                    });
                                    toast({ title: `Switched to ${newType === 'gateway_only' ? 'Gateway' : 'Processing'} pipeline` });
                                    fetchOpportunities();
                                  }}>
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
                          <TableCell colSpan={10}>
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
                    const daysSince = Math.floor((Date.now() - new Date(opp.updated_at).getTime()) / 86400000);
                    const isStale = daysSince > 7;
                    const taskCnt = tasks.filter(t => t.relatedOpportunityId === opp.id && t.status !== 'done').length;
                    
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
                                {isStale && <span className="text-[10px] text-muted-foreground/50">{daysSince}d idle</span>}
                              </div>
                              <h3 className="font-semibold text-sm leading-tight">{opp.account?.name || 'Unknown'}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {opp.contact?.first_name ? `${opp.contact.first_name} ${opp.contact.last_name || ''}`.trim() : opp.contact?.email || '—'}
                              </p>
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
