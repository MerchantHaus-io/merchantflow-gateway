import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Contact, Account, TEAM_MEMBERS, STAGE_CONFIG, OpportunityStage } from "@/types/opportunity";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
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
  UserPlus
} from "lucide-react";
import { toast } from "sonner";
import CommentsTab from "@/components/CommentsTab";
import { cn } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import ThemeToggle from "@/components/ThemeToggle";
import { SortableTableHead } from "@/components/SortableTableHead";
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
}

interface AccountOption {
  id: string;
  name: string;
}

type ContactQueryResult = ContactWithAccount & {
  opportunities?: { id: string; assigned_to: string | null; stage: string | null }[];
};

type SortField = 'first_name' | 'last_name' | 'email' | 'phone' | 'account' | 'assigned_to' | 'stage';
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
  const [editingContact, setEditingContact] = useState<ContactWithAccount | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
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
  }, []);

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select(`id, account_id, first_name, last_name, email, phone, fax, created_at, account:accounts(name), opportunities(id, assigned_to, stage)`)
      .order('created_at', { ascending: false });
    if (!error && data) {
      const contactsWithAssignment = (data as ContactQueryResult[]).map((contact) => ({
        ...contact,
        assigned_to: contact.opportunities?.[0]?.assigned_to || null,
        stage: contact.opportunities?.[0]?.stage || null,
        opportunity_id: contact.opportunities?.[0]?.id || null
      }));
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
    const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedIds.size} contact(s)?`);
    if (!confirmDelete) return;

    try {
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
      toast.success(`${selectedIds.size} contact(s) deleted`);
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
    const confirmDelete = window.confirm('Are you sure you want to delete this contact?');
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) {
        toast.error('Failed to delete contact');
        return;
      }
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen">
        {/* Header */}
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <SidebarTrigger />
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Contacts</h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
          {/* Stats - Compact header-style badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="h-6 px-2 text-xs font-medium gap-1">
              <Users className="h-3 w-3" />Total {stats.total}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-emerald-500/30 text-emerald-500">
              <UserCheck className="h-3 w-3" />Assigned {stats.assigned}
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-xs font-medium gap-1 border-blue-500/30 text-blue-500">
              <Link2 className="h-3 w-3" />Linked {stats.linked}
            </Badge>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, account..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Assignment" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Assignments</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    <DropdownMenuSeparator />
                    {TEAM_MEMBERS.map(member => (
                      <SelectItem key={member} value={member}>{member}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button onClick={openNewDialog} className="ml-auto">
                  <Plus className="h-4 w-4 mr-1" />
                  New Contact
                </Button>
              </div>
            </CardContent>
          </Card>

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
                    onClick={handleBulkDelete}
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
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {filteredContacts.length} Contacts
                  {totalPages > 1 && (
                    <span className="text-muted-foreground font-normal ml-2">
                      (Page {currentPage} of {totalPages})
                    </span>
                  )}
                </CardTitle>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'cards')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="table" className="text-xs px-3">Table</TabsTrigger>
                    <TabsTrigger value="cards" className="text-xs px-3">Cards</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        <TableHead className="w-12">
                          <Checkbox 
                            checked={allOnPageSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                            className={someOnPageSelected && !allOnPageSelected ? "data-[state=checked]:bg-primary/50" : ""}
                          />
                        </TableHead>
                        <TableHead className="w-12">#</TableHead>
                        <SortableTableHead field="first_name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>First Name</SortableTableHead>
                        <SortableTableHead field="last_name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Last Name</SortableTableHead>
                        <SortableTableHead field="email" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Email</SortableTableHead>
                        <SortableTableHead field="phone" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Phone</SortableTableHead>
                        <SortableTableHead field="account" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                        <SortableTableHead field="assigned_to" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Assigned To</SortableTableHead>
                        <SortableTableHead field="stage" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Stage</SortableTableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedContacts.length ? (
                        paginatedContacts.map((contact, index) => {
                          const stageConfig = contact.stage
                            ? STAGE_CONFIG[contact.stage as OpportunityStage]
                            : null;
                          const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;

                          return (
                            <TableRow
                              key={contact.id}
                              className={cn(
                                "cursor-pointer hover:bg-muted/50",
                                selectedIds.has(contact.id) && "bg-primary/10"
                              )}
                              onClick={() => setSelectedContact(contact)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox 
                                  checked={selectedIds.has(contact.id)}
                                  onCheckedChange={() => toggleSelect(contact.id)}
                                  aria-label={`Select ${contact.first_name || contact.last_name || 'contact'}`}
                                />
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{globalIndex}</TableCell>
                              <TableCell className="font-medium">{contact.first_name || '-'}</TableCell>
                              <TableCell>{contact.last_name || '-'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{contact.email || '-'}</TableCell>
                              <TableCell className="text-sm">{contact.phone || '-'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span>{contact.account?.name || '-'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {contact.assigned_to ? (
                                  <Badge variant="outline" className="bg-background/60 border-border/60">
                                    {contact.assigned_to}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">Unassigned</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {stageConfig ? (
                                  <Badge
                                    variant="outline"
                                    className={cn("text-xs", stageConfig?.colorClass && "border-current")}
                                    style={{ color: stageConfig?.color }}
                                  >
                                    {stageConfig.label}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover">
                                    <DropdownMenuItem onClick={() => setSelectedContact(contact)}>
                                      <Eye className="h-4 w-4 mr-2" />
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditDialog(contact)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    {!contact.opportunity_id && contact.account_id && (
                                      <DropdownMenuItem onClick={() => handleConvertToOpportunity(contact)}>
                                        <ArrowRightCircle className="h-4 w-4 mr-2" />
                                        Convert to Opportunity
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeleteContact(contact.id)}
                                      className="text-destructive"
                                    >
                                      <Trash className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            No contacts found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paginatedContacts.map(contact => {
                    const stageConfig = contact.stage
                      ? STAGE_CONFIG[contact.stage as OpportunityStage]
                      : null;

                    return (
                      <Card 
                        key={contact.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedContact(contact)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-medium">
                                {contact.first_name || contact.last_name 
                                  ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                                  : 'Unnamed Contact'}
                              </h3>
                              <p className="text-xs text-muted-foreground">{contact.email || '-'}</p>
                            </div>
                            {stageConfig && (
                              <Badge 
                                variant="outline"
                                style={{ borderColor: stageConfig?.color, color: stageConfig?.color }}
                              >
                                {stageConfig?.label}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Account</span>
                              <span>{contact.account?.name || '-'}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Phone</span>
                              <span>{contact.phone || '-'}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Owner</span>
                              <span>{contact.assigned_to || 'Unassigned'}</span>
                            </div>
                          </div>
                          
                          <div className="mt-3 pt-3 border-t flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(contact);
                              }}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            {!contact.opportunity_id && contact.account_id && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConvertToOpportunity(contact);
                                }}
                              >
                                <ArrowRightCircle className="h-3 w-3 mr-1" />
                                Convert
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
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
        </main>
      </SidebarInset>

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
    </SidebarProvider>
  );
};

export default Contacts;
