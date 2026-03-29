import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Contact, Account, TEAM_MEMBERS, STAGE_CONFIG, OpportunityStage } from "@/types/opportunity";
import { AppLayout } from "@/components/AppLayout";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Pencil, 
  Plus, 
  Search, 
  ArrowRightCircle, 
  Eye, 
  Trash, 
  Users, 
  UserCheck, 
  Link2,
  Building2,
  Mail,
  Phone,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Check,
  X
} from "lucide-react";
import { toast } from "sonner";
import CommentsTab from "@/components/CommentsTab";
import { ClickToCall } from "@/components/ClickToCall";
import { cn } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { SortableTableHead } from "@/components/SortableTableHead";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ITEMS_PER_PAGE = 25;

interface ContactWithAccount extends Contact {
  account?: Account;
  assigned_to?: string | null;
  stage?: string | null;
  opportunity_id?: string | null;
  last_activity_at?: string | null;
}

interface AccountOption {
  id: string;
  name: string;
}

type ContactQueryResult = ContactWithAccount & {
  opportunities?: { id: string; assigned_to: string | null; stage: string | null }[];
};

type SortField = 'first_name' | 'last_name' | 'email' | 'phone' | 'account' | 'assigned_to' | 'stage' | 'last_activity' | 'created_at';
type SortDirection = 'asc' | 'desc';

const STAGE_LABELS: Record<string, string> = {
  'application_started': 'New',
  'discovery': 'Discovery',
  'qualified': 'Qualified',
  'underwriting_review': 'Underwriting Review',
  'processor_approval': 'Processor Approval',
  'integration_setup': 'Integration Setup',
  'gateway_submitted': 'Gateway Submitted',
  'live_activated': 'Live / Activated',
  'closed_won': 'Closed Won',
  'closed_lost': 'Closed Lost',
};

const Contacts = () => {
  const [contacts, setContacts] = useState<ContactWithAccount[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<ContactWithAccount | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  // Inline editing
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');

  const startInlineEdit = (id: string, field: string, value: string) => {
    setInlineEditId(id);
    setInlineEditField(field);
    setInlineEditValue(value || '');
  };
  const cancelInlineEdit = () => { setInlineEditId(null); setInlineEditField(null); setInlineEditValue(''); };
  const commitInlineEdit = async () => {
    if (!inlineEditId || !inlineEditField) return;
    const { error } = await supabase.from('contacts').update({ [inlineEditField]: inlineEditValue || null }).eq('id', inlineEditId);
    if (error) { toast.error('Failed to save'); } else {
      setContacts((prev: ContactWithAccount[]) => prev.map(c => c.id === inlineEditId ? { ...c, [inlineEditField!]: inlineEditValue } : c));
      toast.success('Saved');
    }
    cancelInlineEdit();
  };
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('first_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    fax: '',
    assigned_to: '',
    account_id: '',
  });
  const [selectedContact, setSelectedContact] = useState<ContactWithAccount | null>(null);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (isNewDialogOpen && !isNewAccount && accounts.length > 0 && !formData.account_id) {
      setFormData((data) => ({ ...data, account_id: accounts[0].id }));
    }
  }, [isNewDialogOpen, isNewAccount, accounts]);

  useEffect(() => {
    fetchContacts();
    fetchAccounts();

    // Subscribe to real-time changes on contacts table
    const channel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts'
        },
        (payload) => {
          
          // Refresh contacts when any change occurs
          fetchContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchContacts = async () => {
    setFetchError(null);
    const { data, error } = await supabase
      .from('contacts')
      .select(`id, account_id, first_name, last_name, email, phone, fax, created_at, account:accounts(name), opportunities(id, assigned_to, stage)`)
      .order('created_at', { ascending: false });
    if (error) {
      setFetchError('Failed to load contacts. Please try again.');
      setLoading(false);
      return;
    }
    if (data) {
      const contactsWithAssignment = (data as ContactQueryResult[]).map((contact) => ({
        ...contact,
        assigned_to: contact.opportunities?.[0]?.assigned_to || null,
        stage: contact.opportunities?.[0]?.stage || null,
        opportunity_id: contact.opportunities?.[0]?.id || null,
        last_activity_at: null as string | null,
      }));

      const oppIds = contactsWithAssignment
        .map(c => c.opportunity_id)
        .filter(Boolean) as string[];

      if (oppIds.length > 0) {
        const { data: activities } = await supabase
          .from('activities')
          .select('opportunity_id, created_at')
          .in('opportunity_id', oppIds)
          .order('created_at', { ascending: false });

        if (activities) {
          const lastActivityMap = new Map<string, string>();
          for (const a of activities) {
            if (!lastActivityMap.has(a.opportunity_id)) {
              lastActivityMap.set(a.opportunity_id, a.created_at);
            }
          }
          for (const contact of contactsWithAssignment) {
            if (contact.opportunity_id) {
              contact.last_activity_at = lastActivityMap.get(contact.opportunity_id) || null;
            }
          }
        }
      }

      setContacts(contactsWithAssignment as ContactWithAccount[]);
    }
    setLoading(false);
  };

  const fetchAccounts = async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name')
      .order('name', { ascending: true });
    if (!error && data) {
      setAccounts(data);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as SortField);
      setSortDirection('asc');
    }
  };

  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((contact) => {
        const firstName = (contact.first_name || '').toLowerCase();
        const lastName = (contact.last_name || '').toLowerCase();
        const email = (contact.email || '').toLowerCase();
        const accountName = (contact.account?.name || '').toLowerCase();
        return (
          firstName.includes(query) ||
          lastName.includes(query) ||
          email.includes(query) ||
          accountName.includes(query)
        );
      });
    }

    // Assignment filter
    if (assignmentFilter !== 'all') {
      if (assignmentFilter === 'assigned') {
        filtered = filtered.filter((contact) => !!contact.assigned_to);
      } else if (assignmentFilter === 'unassigned') {
        filtered = filtered.filter((contact) => !contact.assigned_to);
      } else {
        filtered = filtered.filter((contact) => contact.assigned_to === assignmentFilter);
      }
    }

    // Account filter
    if (accountFilter !== 'all') {
      filtered = filtered.filter((contact) => contact.account_id === accountFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'first_name':
          comparison = (a.first_name || '').localeCompare(b.first_name || '');
          break;
        case 'last_name':
          comparison = (a.last_name || '').localeCompare(b.last_name || '');
          break;
        case 'email':
          comparison = (a.email || '').localeCompare(b.email || '');
          break;
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'account':
          comparison = (a.account?.name || '').localeCompare(b.account?.name || '');
          break;
        case 'assigned_to':
          comparison = (a.assigned_to || 'zzz').localeCompare(b.assigned_to || 'zzz');
          break;
        case 'stage':
          comparison = (a.stage || 'zzz').localeCompare(b.stage || 'zzz');
          break;
        case 'last_activity':
          comparison = (a.last_activity_at || '').localeCompare(b.last_activity_at || '');
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [contacts, searchQuery, assignmentFilter, accountFilter, sortField, sortDirection]);

  // Stats
  const stats = useMemo(() => {
    const total = contacts.length;
    const assigned = contacts.filter((c) => !!c.assigned_to).length;
    const linked = contacts.filter((c) => !!c.opportunity_id).length;
    return { total, assigned, linked };
  }, [contacts]);

  // Pagination
  const totalPages = Math.ceil(filteredContacts.length / ITEMS_PER_PAGE);
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredContacts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredContacts, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, assignmentFilter, accountFilter]);

  // Clear selection when filters/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, searchQuery, assignmentFilter, accountFilter]);

  // Bulk selection helpers
  const allOnPageSelected = paginatedContacts.length > 0 && paginatedContacts.every(c => selectedIds.has(c.id));
  const someOnPageSelected = paginatedContacts.some(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedContacts.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const count = selectedIds.size;
      const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) {
        toast.error('Failed to delete contacts');
        return;
      }

      setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      toast.success(`${count} contact(s) deleted`);
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  // Bulk assign handler
  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignee) return;

    try {
      // Get opportunity IDs for selected contacts
      const selectedContacts = contacts.filter(c => selectedIds.has(c.id) && c.opportunity_id);
      const opportunityIds = selectedContacts.map(c => c.opportunity_id).filter(Boolean) as string[];

      if (opportunityIds.length === 0) {
        toast.error('No linked opportunities found for selected contacts');
        return;
      }

      const { error } = await supabase
        .from('opportunities')
        .update({ assigned_to: bulkAssignee === 'unassigned' ? null : bulkAssignee })
        .in('id', opportunityIds);

      if (error) {
        toast.error('Failed to assign contacts');
        return;
      }

      fetchContacts();
      setSelectedIds(new Set());
      setBulkAssignee('');
      toast.success(`${opportunityIds.length} contact(s) assigned to ${bulkAssignee === 'unassigned' ? 'nobody' : bulkAssignee}`);
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  const openEditDialog = (contact: ContactWithAccount) => {
    setEditingContact(contact);
    setFormData({
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      fax: contact.fax || '',
      assigned_to: contact.assigned_to || '',
      account_id: contact.account_id || '',
    });
  };

  const openNewDialog = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      fax: '',
      assigned_to: '',
      account_id: '',
    });
    setIsNewAccount(false);
    setNewAccountName('');
    setIsNewDialogOpen(true);
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) {
        toast.error('Failed to delete contact');
        return;
      }
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setDeleteConfirmId(null);
      toast.success('Contact deleted');
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  const handleAutoSave = useCallback(async (data: typeof formData) => {
    if (!editingContact) return;
    
    const { error: contactError } = await supabase
      .from('contacts')
      .update({
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        email: data.email || null,
        phone: data.phone || null,
        fax: data.fax || null,
        account_id: data.account_id || editingContact.account_id,
      })
      .eq('id', editingContact.id);

    if (contactError) {
      throw contactError;
    }

    if (editingContact.opportunity_id) {
      const { error: oppError } = await supabase
        .from('opportunities')
        .update({ assigned_to: data.assigned_to || null })
        .eq('id', editingContact.opportunity_id);

      if (oppError) {
        throw oppError;
      }
    }

    fetchContacts();
  }, [editingContact]);

  const { status: saveStatus, resetInitialData } = useAutoSave({
    data: formData,
    onSave: handleAutoSave,
    delay: 800,
    enabled: !!editingContact,
  });

  useEffect(() => {
    if (editingContact) {
      resetInitialData();
    }
  }, [editingContact, resetInitialData]);

  const handleCreateContact = async () => {
    try {
      let accountId = formData.account_id;

      if (isNewAccount) {
        if (!newAccountName.trim()) {
          toast.error('Please enter a company name');
          return;
        }
        const { data: newAccount, error: accountError } = await supabase
          .from('accounts')
          .insert({ name: newAccountName.trim() })
          .select('id')
          .single();

        if (accountError || !newAccount) {
          toast.error('Failed to create account');
          return;
        }
        accountId = newAccount.id;
        fetchAccounts();
      } else if (!accountId) {
        toast.error('Please select an account');
        return;
      }

      if (!formData.first_name && !formData.last_name) {
        toast.error('Please enter a name');
        return;
      }

      const { error } = await supabase
        .from('contacts')
        .insert({
          account_id: accountId,
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          fax: formData.fax || null,
        });

      if (error) {
        toast.error('Failed to create contact');
        return;
      }

      toast.success('Contact created');
      setIsNewDialogOpen(false);
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  const handleConvertToOpportunity = async (contact: ContactWithAccount) => {
    if (!contact.account_id) {
      toast.error('Contact must have an account to convert to opportunity');
      return;
    }

    try {
      const { error } = await supabase
        .from('opportunities')
        .insert({
          account_id: contact.account_id,
          contact_id: contact.id,
          stage: 'application_started',
          status: 'active',
        });

      if (error) {
        toast.error('Failed to create opportunity');
        return;
      }

      toast.success('Contact converted to opportunity');
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={Users}
          title="Contacts"
          actions={
            <Button onClick={openNewDialog}>
              <UserPlus className="h-4 w-4 mr-1" />
              New Contact
            </Button>
          }
        />
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
            <StatCard label="Total Contacts" value={stats.total} icon={Users} color="primary" />
            <StatCard label="Assigned" value={stats.assigned} icon={UserCheck} color="success" />
            <StatCard label="Linked to Deal" value={stats.linked} icon={Link2} color="teal" />
            <StatCard label="Unassigned" value={stats.total - stats.assigned} icon={UserPlus} color="warning" />
          </div>

          {/* Filters toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{filteredContacts.length} contacts</span>
              {(assignmentFilter !== 'all' || accountFilter !== 'all' || searchQuery) && (
                <button onClick={() => { setAssignmentFilter('all'); setAccountFilter('all'); setSearchQuery(''); }}
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
              <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Owners</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map(member => (<SelectItem key={member} value={member} className="text-xs">{member}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map(account => (<SelectItem key={account.id} value={account.id} className="text-xs">{account.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && viewMode === 'table' && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {TEAM_MEMBERS.map(member => (
                          <SelectItem key={member} value={member}>{member}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={handleBulkAssign}
                      disabled={!bulkAssignee}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign
                    </Button>
                  </div>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => setBulkDeleteConfirm(true)}
                  >
                    <Trash className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto"
                  >
                    Clear Selection
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{filteredContacts.length} contacts</span>
                  {totalPages > 1 && <span className="text-xs text-muted-foreground">p.{currentPage}/{totalPages}</span>}
                  {(assignmentFilter !== 'all' || accountFilter !== 'all' || searchQuery) && (
                    <button onClick={() => { setAssignmentFilter('all'); setAccountFilter('all'); setSearchQuery(''); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Clear ×
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                  <button onClick={() => setViewMode('table')} className={cn("px-2 py-1 text-xs rounded transition-colors", viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Table</button>
                  <button onClick={() => setViewMode('cards')} className={cn("px-2 py-1 text-xs rounded transition-colors", viewMode === 'cards' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Cards</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {fetchError ? (
                <QueryErrorCard message={fetchError} onRetry={() => { setLoading(true); fetchContacts(); }} />
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
                        <TableHead className="w-8">
                          <Checkbox 
                            checked={allOnPageSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                            className={someOnPageSelected && !allOnPageSelected ? "data-[state=checked]:bg-primary/50" : ""}
                          />
                        </TableHead>
                        <SortableTableHead field="first_name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Name</SortableTableHead>
                        <SortableTableHead field="email" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Email</SortableTableHead>
                        <SortableTableHead field="phone" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Phone</SortableTableHead>
                        <SortableTableHead field="account" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                        <SortableTableHead field="stage" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Deal Stage</SortableTableHead>
                        <SortableTableHead field="assigned_to" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Owner</SortableTableHead>
                        <SortableTableHead field="last_activity" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Activity</SortableTableHead>
                        <SortableTableHead field="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Created</SortableTableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedContacts.length ? (
                        paginatedContacts.map((contact) => {
                          const stageConfig = contact.stage
                            ? STAGE_CONFIG[contact.stage as OpportunityStage]
                            : null;

                          return (
                            <TableRow
                              key={contact.id}
                              className={cn(
                                "cursor-pointer hover:bg-muted/30 transition-colors",
                                selectedIds.has(contact.id) && "bg-primary/5"
                              )}
                              onClick={() => setSelectedContact(contact)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()} className="py-2">
                                <Checkbox 
                                  checked={selectedIds.has(contact.id)}
                                  onCheckedChange={() => toggleSelect(contact.id)}
                                  aria-label={`Select ${contact.first_name || contact.last_name || 'contact'}`}
                                />
                              </TableCell>
                              {/* Name merged */}
                              <TableCell className="py-2 font-medium">
                                <div className="flex items-center gap-2 group/cell">
                                  <span className="text-sm">
                                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || <span className="text-muted-foreground italic">Unnamed</span>}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 text-sm">
                                {inlineEditId === contact.id && inlineEditField === 'email' ? (
                                  <div className="flex items-center gap-1">
                                    <Input autoFocus type="email" value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }} className="h-7 text-sm py-0 px-2 w-40" />
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitInlineEdit}><Check className="h-3 w-3 text-success" /></Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}><X className="h-3 w-3 text-muted-foreground" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 group/cell">
                                    {contact.email
                                      ? <a href={`mailto:${contact.email}`} className="text-muted-foreground hover:text-primary transition-colors truncate max-w-[160px]" onClick={e => e.stopPropagation()} title={contact.email}>{contact.email}</a>
                                      : <span className="text-muted-foreground/40">—</span>}
                                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cell:opacity-60 cursor-pointer transition-opacity" onClick={(e) => { e.stopPropagation(); startInlineEdit(contact.id, 'email', contact.email || ''); }} />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {contact.phone || <span className="text-muted-foreground/40">—</span>}
                                  {contact.phone && (
                                    <ClickToCall 
                                      phoneNumber={contact.phone} 
                                      contactName={`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                                    />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-2 text-sm">
                                {contact.account?.name
                                  ? <span className="text-muted-foreground">{contact.account.name}</span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                              {/* Deal stage with color dot — much more scannable */}
                              <TableCell className="py-2">
                                {stageConfig ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageConfig.color }} />
                                    <span className="text-xs text-muted-foreground">{stageConfig.label}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2">
                                {contact.assigned_to
                                  ? <span className="text-xs text-muted-foreground">{contact.assigned_to}</span>
                                  : <span className="text-xs text-muted-foreground/40">Unassigned</span>}
                              </TableCell>
                              <TableCell className="py-2 text-xs text-muted-foreground">
                                {contact.last_activity_at
                                  ? formatDistanceToNow(new Date(contact.last_activity_at), { addSuffix: true }).replace('about ', '')
                                  : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                              <TableCell className="py-2 text-xs text-muted-foreground">
                                {contact.created_at
                                  ? formatDistanceToNow(new Date(contact.created_at), { addSuffix: true }).replace('about ', '')
                                  : '—'}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()} className="py-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover">
                                    <DropdownMenuItem onClick={() => setSelectedContact(contact)}>
                                      <Eye className="h-4 w-4 mr-2" />View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditDialog(contact)}>
                                      <Pencil className="h-4 w-4 mr-2" />Edit
                                    </DropdownMenuItem>
                                    {!contact.opportunity_id && contact.account_id && (
                                      <DropdownMenuItem onClick={() => handleConvertToOpportunity(contact)}>
                                        <ArrowRightCircle className="h-4 w-4 mr-2" />Convert to Opportunity
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setDeleteConfirmId(contact.id)} className="text-destructive">
                                      <Trash className="h-4 w-4 mr-2" />Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={11}>
                            <EmptyState
                              icon={Users}
                              title="No contacts found"
                              description="Try adjusting your filters or add a new contact."
                              actionLabel="New Contact"
                              onAction={openNewDialog}
                              size="sm"
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {paginatedContacts.map(contact => {
                    const stageConfig = contact.stage
                      ? STAGE_CONFIG[contact.stage as OpportunityStage]
                      : null;
                    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
                    const initials = [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';

                    return (
                      <div
                        key={contact.id}
                        className="rounded-xl border border-border bg-card hover:border-border/80 transition-all cursor-pointer group/card"
                        onClick={() => setSelectedContact(contact)}
                        style={stageConfig ? { borderLeft: `3px solid ${stageConfig.color}` } : {}}
                      >
                        <div className="p-4">
                          {/* Header row */}
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{fullName || <span className="italic text-muted-foreground">Unnamed</span>}</p>
                              <p className="text-xs text-muted-foreground truncate">{contact.account?.name || 'No account'}</p>
                            </div>
                            {stageConfig && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stageConfig.color }} />
                                <span className="text-[10px] text-muted-foreground">{stageConfig.label}</span>
                              </div>
                            )}
                          </div>
                          {/* Contact info */}
                          <div className="space-y-1.5 mb-3">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{contact.email}</span>
                              </a>
                            )}
                            {contact.phone && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
                                <Phone className="h-3 w-3 shrink-0" />
                                <span>{contact.phone}</span>
                                <ClickToCall phoneNumber={contact.phone} contactName={fullName} />
                              </div>
                            )}
                          </div>
                          {/* Footer */}
                          <div className="flex items-center justify-between pt-2.5 border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground/60">
                              {contact.assigned_to || 'Unassigned'}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <Mail className="h-3.5 w-3.5" />
                                </a>
                              )}
                              {!contact.opportunity_id && contact.account_id && (
                                <button onClick={() => handleConvertToOpportunity(contact)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Convert to opportunity">
                                  <ArrowRightCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button onClick={() => openEditDialog(contact)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredContacts.length)} of {filteredContacts.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "ghost"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      {/* Contact Details Dialog */}
      <Dialog
        open={!!selectedContact}
        onOpenChange={(open) => {
          if (!open) setSelectedContact(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedContact?.first_name || selectedContact?.last_name
                ? `${selectedContact?.first_name || ''} ${selectedContact?.last_name || ''}`.trim()
                : 'Contact Details'}
            </DialogTitle>
          </DialogHeader>

          {selectedContact && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Account</p>
                  <p className="font-medium">{selectedContact.account?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedContact.email || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedContact.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fax</p>
                  <p className="font-medium">{selectedContact.fax || '—'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Assigned To</p>
                  <p className="font-medium">{selectedContact.assigned_to || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stage</p>
                  <p className="font-medium">
                    {selectedContact.stage
                      ? STAGE_LABELS[selectedContact.stage] || selectedContact.stage
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {selectedContact.created_at
                      ? new Date(selectedContact.created_at).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Comments</p>
                  {!selectedContact.opportunity_id && (
                    <span className="text-xs text-muted-foreground">
                      Link the contact to an opportunity to enable comments.
                    </span>
                  )}
                </div>
                {selectedContact.opportunity_id ? (
                  <CommentsTab opportunityId={selectedContact.opportunity_id} />
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No opportunity linked to this contact.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog
        open={!!editingContact}
        onOpenChange={(open) => {
          if (!open) setEditingContact(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Edit Contact</DialogTitle>
              <AutoSaveIndicator status={saveStatus} />
            </div>
          </DialogHeader>
          <div className="space-y-5 py-5">
            <div className="space-y-3">
              <Label>Account</Label>
              <Select
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>First Name</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>Last Name</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>Fax</Label>
                <Input
                  value={formData.fax}
                  onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Assigned To</Label>
              <Select
                value={formData.assigned_to || "unassigned"}
                onValueChange={(value) => setFormData({ ...formData, assigned_to: value === "unassigned" ? "" : value })}
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map((member) => (
                    <SelectItem key={member} value={member}>
                      {member}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setEditingContact(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Contact Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Account *</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setIsNewAccount(!isNewAccount);
                    setNewAccountName('');
                    setFormData({ ...formData, account_id: '' });
                  }}
                >
                  {isNewAccount ? 'Select existing' : '+ New account'}
                </Button>
              </div>
              {isNewAccount ? (
                <Input
                  placeholder="Enter company name"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
              ) : (
                <Select
                  value={formData.account_id}
                  onValueChange={(value) => setFormData({ ...formData, account_id: value })}
                >
                  <SelectTrigger className="bg-secondary">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>First Name</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>Last Name</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>Fax</Label>
                <Input
                  value={formData.fax}
                  onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateContact}>
                Create Contact
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeleteContact(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Contact(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected contact(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Contacts;
