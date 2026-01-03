import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import { 
  Opportunity, 
  OpportunityStage, 
  STAGE_CONFIG, 
  TEAM_MEMBERS, 
  migrateStage, 
  getServiceType,
  EMAIL_TO_USER 
} from "@/types/opportunity";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  XCircle
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
import { SortableTableHead } from "@/components/SortableTableHead";

type SortField = 'name' | 'stage' | 'pipeline' | 'owner' | 'tasks' | 'progress' | 'created' | 'updated';
type SortDirection = 'asc' | 'desc';

const Opportunities = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { tasks } = useTasks();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

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
    let filtered = [...opportunities];

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(opp => 
        statusFilter === "active" ? opp.status !== 'dead' : opp.status === 'dead'
      );
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
  }, [opportunities, searchQuery, stageFilter, ownerFilter, pipelineFilter, statusFilter, sortField, sortDirection, tasks]);

  // Stats
  const stats = useMemo(() => {
    const active = opportunities.filter(o => o.status !== 'dead');
    const byStage: Record<string, number> = {};
    active.forEach(o => {
      byStage[o.stage] = (byStage[o.stage] || 0) + 1;
    });
    
    return {
      total: active.length,
      new: byStage['application_started'] || 0,
      inProgress: active.filter(o => !['application_started', 'live_activated', 'closed_won', 'closed_lost'].includes(o.stage)).length,
      won: (byStage['live_activated'] || 0) + (byStage['closed_won'] || 0),
      lost: opportunities.filter(o => o.status === 'dead').length,
    };
  }, [opportunities]);

  const navigateToOpportunity = (opp: Opportunity) => {
    navigate(`/opportunities/${opp.id}`);
  };

  return (
    <AppLayout
      onNewApplication={() => setShowNewModal(true)}
    >
      <div className="p-4 lg:p-6 space-y-6">
        {/* Page title */}
        <h1 className="text-lg font-semibold text-foreground">Opportunities</h1>
        {/* Stats - Compact header-style badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="h-6 px-2 text-xs font-medium gap-1">
              <TrendingUp className="h-3 w-3" />Active {stats.total}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-blue-500/30 text-blue-500">
              <Plus className="h-3 w-3" />New {stats.new}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-amber-500/30 text-amber-500">
              <AlertCircle className="h-3 w-3" />In Progress {stats.inProgress}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-emerald-500/30 text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />Won {stats.won}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-destructive/30 text-destructive">
              <XCircle className="h-3 w-3" />Closed {stats.lost}
            </Badge>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="dead">Archived</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Stages</SelectItem>
                    {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Owner" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Owners</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {TEAM_MEMBERS.map(member => (
                      <SelectItem key={member} value={member}>{member}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Pipeline" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Pipelines</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="gateway_only">Gateway</SelectItem>
                  </SelectContent>
                </Select>

              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {filteredOpportunities.length} Opportunities
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
                        <SortableTableHead field="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                        <SortableTableHead field="stage" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Stage</SortableTableHead>
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
                        
                        return (
                          <TableRow 
                            key={opp.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigateToOpportunity(opp)}
                          >
                            <TableCell className="text-muted-foreground text-sm">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{opp.account?.name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {opp.contact?.email || '-'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={cn("text-xs", stageConfig?.colorClass && `border-current`)}
                                style={{ color: stageConfig?.color }}
                              >
                                {stageConfig?.label || opp.stage}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {serviceType === 'gateway_only' ? (
                                  <>
                                    <Zap className="h-3 w-3 text-amber-500" />
                                    <span className="text-xs">Gateway</span>
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="h-3 w-3 text-blue-500" />
                                    <span className="text-xs">Processing</span>
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{opp.assigned_to || 'Unassigned'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {taskCount > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {taskCount} open
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      progress >= 100 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-primary"
                                    )}
                                    style={{ width: `${Math.min(progress, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">{progress}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(opp.created_at), 'MMM d, yyyy')}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true })}
                              </div>
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
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredOpportunities.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No opportunities found
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
                    
                    return (
                      <Card 
                        key={opp.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => navigateToOpportunity(opp)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-medium">{opp.account?.name || 'Unknown'}</h3>
                              <p className="text-xs text-muted-foreground">{opp.contact?.email}</p>
                            </div>
                            <Badge 
                              variant="outline"
                              style={{ borderColor: stageConfig?.color, color: stageConfig?.color }}
                            >
                              {stageConfig?.label}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Owner</span>
                              <span>{opp.assigned_to || 'Unassigned'}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Pipeline</span>
                              <div className="flex items-center gap-1">
                                {serviceType === 'gateway_only' ? (
                                  <><Zap className="h-3 w-3 text-amber-500" />Gateway</>
                                ) : (
                                  <><CreditCard className="h-3 w-3 text-blue-500" />Processing</>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Progress</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full",
                                  progress >= 100 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-primary"
                                )}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                          </div>
                          
                          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                            Updated {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true })}
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
    </AppLayout>
  );
};

export default Opportunities;
