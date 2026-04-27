import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  X,
  LayoutGrid,
  List,
  Clock,
  TrendingUp,
  AlertCircle,
  XCircle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import CommentsTab from "@/components/CommentsTab";
import { ClickToCall } from "@/components/ClickToCall";
import { cn } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { SortableTableHead } from "@/components/SortableTableHead";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
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

const ITEMS_PER_PAGE = 50;

// ─── Types ───────────────────────────────────────────────────────────────────
// Extends the existing Contact type from @/types/opportunity — no new DB columns added
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

type SortField = 'first_name' | 'last_name' | 'email' | 'phone' | 'account' | 'assigned_to' | 'stage' | 'last_activity';
type SortDirection = 'asc' | 'desc';

// ─── Constants ───────────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive a human-readable contact type label from deal stage */
function getContactType(stage: string | null | undefined): { label: string; color: string } {
  if (!stage) return { label: 'Lead', color: 'hsl(var(--muted-foreground))' };
  if (['live_activated', 'closed_won'].includes(stage))
    return { label: 'Live Client', color: 'hsl(142 71% 45%)' };
  if (['underwriting_review', 'processor_approval', 'integration_setup', 'gateway_submitted'].includes(stage))
    return { label: 'In Progress', color: 'hsl(38 92% 50%)' };
  if (['qualified', 'discovery'].includes(stage))
    return { label: 'Prospect', color: 'hsl(180 50% 40%)' };
  return { label: 'Lead', color: 'hsl(var(--muted-foreground))' };
}

/** Hash a string to a stable Tailwind bg color for avatars */
function avatarColor(str: string): string {
  const colors = [
    'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── DetailRow ───────────────────────────────────────────────────────────────
function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-4 h-5 flex items-center justify-center text-muted-foreground/50 shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <div className="truncate">{children}</div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
const Contacts = () => {
  const [contacts, setContacts] = useState<ContactWithAccount[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<ContactWithAccount | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  // Inline editing — same as original
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');

  const startInlineEdit = (id: string, field: string, value: string) => {
    setInlineEditId(id);
    setInlineEditField(field);
    setInlineEditValue(value || '');
  };
  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineEditField(null);
    setInlineEditValue('');
  };
  const commitInlineEdit = async () => {
    if (!inlineEditId || !inlineEditField) return;
    const { error } = await supabase
      .from('contacts')
      .update({ [inlineEditField]: inlineEditValue || null })
      .eq('id', inlineEditId);
    if (error) {
      toast.error('Failed to save');
    } else {
      setContacts((prev: ContactWithAccount[]) =>
        prev.map(c => c.id === inlineEditId ? { ...c, [inlineEditField!]: inlineEditValue } : c)
      );
      toast.success('Saved');
    }
    cancelInlineEdit();
  };

  const [isNewAccount, setIsNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('first_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // formData — identical fields to original
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    fax: '',
    assigned_to: '',
    account_id: '',
  });

  // Detail side panel (replaces detail Dialog)
  const [selectedContact, setSelectedContact] = useState<ContactWithAccount | null>(null);
  const [detailTab, setDetailTab] = useState('overview');

  // Bulk selection — identical to original
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" shortcut to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isNewDialogOpen && !isNewAccount && accounts.length > 0 && !formData.account_id) {
      setFormData((data) => ({ ...data, account_id: accounts[0].id }));
    }
  }, [isNewDialogOpen, isNewAccount, accounts]);

  useEffect(() => {
    fetchContacts();
    fetchAccounts();

    // Real-time subscription — identical to original
    const channel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts' },
        (payload) => {
          console.log('Real-time contact update:', payload);
          fetchContacts();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  // Select query is identical to the original — no new columns
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
    if (!error && data) setAccounts(data);
  };

  // ─── Sorting ────────────────────────────────────────────────────────────────
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as SortField);
      setSortDirection('asc');
    }
  };

  // ─── Filtering + sorting — all original logic preserved ─────────────────────
  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((contact) => {
        const firstName = (contact.first_name || '').toLowerCase();
        const lastName = (contact.last_name || '').toLowerCase();
        const email = (contact.email || '').toLowerCase();
        const phone = (contact.phone || '').toLowerCase();
        const accountName = (contact.account?.name || '').toLowerCase();
        return (
          firstName.includes(query) ||
          lastName.includes(query) ||
          email.includes(query) ||
          phone.includes(query) ||
          accountName.includes(query)
        );
      });
    }

    // Quick filter pills
    if (quickFilter === 'unassigned') {
      filtered = filtered.filter(c => !c.assigned_to);
    } else if (quickFilter === 'no_deal') {
      filtered = filtered.filter(c => !c.opportunity_id);
    }

    // Assignment dropdown — identical to original
    if (assignmentFilter !== 'all') {
      if (assignmentFilter === 'assigned') {
        filtered = filtered.filter((contact) => !!contact.assigned_to);
      } else if (assignmentFilter === 'unassigned') {
        filtered = filtered.filter((contact) => !contact.assigned_to);
      } else {
        filtered = filtered.filter((contact) => contact.assigned_to === assignmentFilter);
      }
    }

    // Account filter — identical to original
    if (accountFilter !== 'all') {
      filtered = filtered.filter((contact) => contact.account_id === accountFilter);
    }

    // Stage filter (new)
    if (stageFilter !== 'all') {
      if (stageFilter === 'no_deal') {
        filtered = filtered.filter(c => !c.opportunity_id);
      } else {
        filtered = filtered.filter(c => c.stage === stageFilter);
      }
    }

    // Sort — identical to original
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'first_name':    comparison = (a.first_name || '').localeCompare(b.first_name || ''); break;
        case 'last_name':     comparison = (a.last_name || '').localeCompare(b.last_name || ''); break;
        case 'email':         comparison = (a.email || '').localeCompare(b.email || ''); break;
        case 'phone':         comparison = (a.phone || '').localeCompare(b.phone || ''); break;
        case 'account':       comparison = (a.account?.name || '').localeCompare(b.account?.name || ''); break;
        case 'assigned_to':   comparison = (a.assigned_to || 'zzz').localeCompare(b.assigned_to || 'zzz'); break;
        case 'stage':         comparison = (a.stage || 'zzz').localeCompare(b.stage || 'zzz'); break;
        case 'last_activity': comparison = (a.last_activity_at || '').localeCompare(b.last_activity_at || ''); break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [contacts, searchQuery, quickFilter, assignmentFilter, accountFilter, stageFilter, sortField, sortDirection]);

  // ─── Stats — original fields, plus liveClients ───────────────────────────────
  const stats = useMemo(() => {
    const total = contacts.length;
    const assigned = contacts.filter((c) => !!c.assigned_to).length;
    const linked = contacts.filter((c) => !!c.opportunity_id).length;
    const liveClients = contacts.filter(c => ['live_activated', 'closed_won'].includes(c.stage || '')).length;
    return { total, assigned, linked, liveClients, unassigned: total - assigned, noDeal: total - linked };
  }, [contacts]);

  // ─── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredContacts.length / ITEMS_PER_PAGE);
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredContacts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredContacts, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, quickFilter, assignmentFilter, accountFilter, stageFilter]);
  useEffect(() => { setSelectedIds(new Set()); }, [currentPage, searchQuery, quickFilter, assignmentFilter, accountFilter, stageFilter]);

  // ─── Bulk selection ─────────────────────────────────────────────────────────
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
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedIds(newSet);
  };

  // ─── Bulk handlers — identical to original ──────────────────────────────────
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const count = selectedIds.size;
      const { error } = await supabase.from('contacts').delete().in('id', Array.from(selectedIds));
      if (error) { toast.error('Failed to delete contacts'); return; }
      setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      toast.success(`${count} contact(s) deleted`);
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignee) return;
    try {
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
      if (error) { toast.error('Failed to assign contacts'); return; }
      fetchContacts();
      setSelectedIds(new Set());
      setBulkAssignee('');
      toast.success(`${opportunityIds.length} contact(s) assigned to ${bulkAssignee === 'unassigned' ? 'nobody' : bulkAssignee}`);
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  // ─── Dialog handlers — identical to original ────────────────────────────────
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
      account_id: accounts[0]?.id || '',
    });
    setIsNewAccount(false);
    setNewAccountName('');
    setIsNewDialogOpen(true);
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) { toast.error('Failed to delete contact'); return; }
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setDeleteConfirmId(null);
      toast.success('Contact deleted');
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  // ─── Auto-save — identical to original ──────────────────────────────────────
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
    if (contactError) throw contactError;

    if (editingContact.opportunity_id) {
      const { error: oppError } = await supabase
        .from('opportunities')
        .update({ assigned_to: data.assigned_to || null })
        .eq('id', editingContact.opportunity_id);
      if (oppError) throw oppError;
    }
    fetchContacts();
  }, [editingContact]);

  const { status: saveStatus, resetInitialData } = useAutoSave({
    data: formData,
    onSave: handleAutoSave,
    delay: 800,
    enabled: !!editingContact,
  });

  useEffect(() => { if (editingContact) resetInitialData(); }, [editingContact, resetInitialData]);

  // ─── Create contact — identical to original ──────────────────────────────────
  const handleCreateContact = async () => {
    try {
      let accountId = formData.account_id;
      if (isNewAccount) {
        if (!newAccountName.trim()) { toast.error('Please enter a company name'); return; }
        const { data: newAccount, error: accountError } = await supabase
          .from('accounts')
          .insert({ name: newAccountName.trim() })
          .select('id')
          .single();
        if (accountError || !newAccount) { toast.error('Failed to create account'); return; }
        accountId = newAccount.id;
        fetchAccounts();
      } else if (!accountId) {
        toast.error('Please select an account');
        return;
      }
      if (!formData.first_name && !formData.last_name) { toast.error('Please enter a name'); return; }
      const { error } = await supabase.from('contacts').insert({
        account_id: accountId,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email || null,
        phone: formData.phone || null,
        fax: formData.fax || null,
      });
      if (error) { toast.error('Failed to create contact'); return; }
      toast.success('Contact created');
      setIsNewDialogOpen(false);
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  // ─── Convert to opportunity — identical to original ──────────────────────────
  const handleConvertToOpportunity = async (contact: ContactWithAccount) => {
    if (!contact.account_id) {
      toast.error('Contact must have an account to convert to opportunity');
      return;
    }
    try {
      const { error } = await supabase.from('opportunities').insert({
        account_id: contact.account_id,
        contact_id: contact.id,
        stage: 'application_started',
        status: 'active',
      });
      if (error) { toast.error('Failed to create opportunity'); return; }
      toast.success('Contact converted to opportunity');
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  // ─── Filter helpers ──────────────────────────────────────────────────────────
  const hasActiveFilters =
    assignmentFilter !== 'all' || accountFilter !== 'all' || stageFilter !== 'all' ||
    quickFilter !== 'all' || !!searchQuery;

  const clearAllFilters = () => {
    setSearchQuery('');
    setAssignmentFilter('all');
    setAccountFilter('all');
    setStageFilter('all');
    setQuickFilter('all');
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={Users}
          title="Contacts"
          color="primary"
          actions={
            <Button size="sm" onClick={openNewDialog} className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              New Contact
            </Button>
          }
        />

        {/* KPI Cards — click to quick-filter */}
        <div className="px-4 lg:px-6 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
            <StatCard
              label="Total Contacts"
              value={loading ? "—" : stats.total}
              icon={Users}
              color="primary"
              onClick={() => setQuickFilter('all')}
            />
            <StatCard
              label="Unassigned"
              value={loading ? "—" : stats.unassigned}
              icon={AlertCircle}
              color="warning"
              onClick={() => setQuickFilter(quickFilter === 'unassigned' ? 'all' : 'unassigned')}
            />
            <StatCard
              label="No Deal"
              value={loading ? "—" : stats.noDeal}
              icon={Link2}
              color="muted"
              onClick={() => setQuickFilter(quickFilter === 'no_deal' ? 'all' : 'no_deal')}
            />
            <StatCard
              label="Live Clients"
              value={loading ? "—" : stats.liveClients}
              icon={TrendingUp}
              color="success"
            />
          </div>
        </div>

        {/* ══ Sticky Toolbar ═══════════════════════════════════════════════════ */}
        <div className="px-4 lg:px-6 pt-3 pb-3 mt-3 border-b border-border/60 bg-background/80 backdrop-blur-sm sticky top-0 z-10 space-y-3">

          {/* Row 1: search + filter dropdowns + view toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search contacts… (/)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
              <SelectTrigger className={cn("h-8 w-[130px] text-xs", assignmentFilter !== 'all' && "border-primary/60 bg-primary/5")}>
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Owners</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {TEAM_MEMBERS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className={cn("h-8 w-[140px] text-xs", accountFilter !== 'all' && "border-primary/60 bg-primary/5")}>
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className={cn("h-8 w-[150px] text-xs", stageFilter !== 'all' && "border-primary/60 bg-primary/5")}>
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="no_deal">No Deal</SelectItem>
                {Object.entries(STAGE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    <div className="flex items-center gap-2">
                      {STAGE_CONFIG[key as OpportunityStage] && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAGE_CONFIG[key as OpportunityStage].color }} />
                      )}
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1 px-2" onClick={clearAllFilters}>
                <XCircle className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}

            {/* View mode toggle */}
            <div className="ml-auto flex items-center gap-0.5 bg-muted rounded-md p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={cn("p-1.5 rounded transition-colors", viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Table view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={cn("p-1.5 rounded transition-colors", viewMode === 'cards' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Card view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: active quick-filter chip + result count */}
          {(quickFilter !== 'all' || hasActiveFilters) && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              {quickFilter === 'unassigned' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30">
                  <AlertCircle className="h-3 w-3" /> Showing unassigned
                  <button onClick={() => setQuickFilter('all')} className="ml-1 hover:text-foreground" aria-label="Clear">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {quickFilter === 'no_deal' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
                  <Link2 className="h-3 w-3" /> Showing contacts without deals
                  <button onClick={() => setQuickFilter('all')} className="ml-1 hover:text-foreground" aria-label="Clear">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <span className="ml-auto">
                {filteredContacts.length} result{filteredContacts.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* ══ Bulk Actions Bar ══════════════════════════════════════════════════ */}
        {selectedIds.size > 0 && (
          <div className="px-4 lg:px-6 py-2 bg-primary/5 border-b border-primary/20 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                <SelectTrigger className="h-7 w-[150px] text-xs bg-background">
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" className="h-7 text-xs gap-1.5" onClick={handleBulkAssign} disabled={!bulkAssignee}>
                <UserCheck className="h-3.5 w-3.5" />Assign
              </Button>
            </div>
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5" onClick={() => setBulkDeleteConfirm(true)}>
              <Trash className="h-3.5 w-3.5" />Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        {/* ══ Main Content ══════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          {fetchError ? (
            <QueryErrorCard message={fetchError} onRetry={() => { setLoading(true); fetchContacts(); }} />
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : viewMode === 'table' ? (

            /* ── Table View ─────────────────────────────────────────────────── */
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8 pl-3">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        className={someOnPageSelected && !allOnPageSelected ? "data-[state=checked]:bg-primary/50" : ""}
                      />
                    </TableHead>
                    <SortableTableHead field="first_name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Name</SortableTableHead>
                    <TableHead className="text-xs text-muted-foreground font-medium">Type</TableHead>
                    <SortableTableHead field="email" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Email</SortableTableHead>
                    <SortableTableHead field="phone" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Phone</SortableTableHead>
                    <SortableTableHead field="account" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                    <SortableTableHead field="stage" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Deal Stage</SortableTableHead>
                    <SortableTableHead field="assigned_to" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Owner</SortableTableHead>
                    <SortableTableHead field="last_activity" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Last Activity</SortableTableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedContacts.length ? (
                    paginatedContacts.map((contact) => {
                      const stageConfig = contact.stage ? STAGE_CONFIG[contact.stage as OpportunityStage] : null;
                      const contactType = getContactType(contact.stage);
                      const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
                      const initials = [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
                      const avatarBg = avatarColor(fullName || contact.id);

                      return (
                        <TableRow
                          key={contact.id}
                          className={cn(
                            "group/row cursor-pointer transition-colors",
                            selectedIds.has(contact.id) ? "bg-primary/5" : "hover:bg-muted/30"
                          )}
                          onClick={() => { setSelectedContact(contact); setDetailTab('overview'); }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()} className="py-0 pl-3 w-8">
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              onCheckedChange={() => toggleSelect(contact.id)}
                              aria-label={`Select ${fullName || 'contact'}`}
                            />
                          </TableCell>

                          {/* Name + colored avatar */}
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0", avatarBg)}>
                                {initials}
                              </div>
                              <span className="text-sm font-medium truncate">
                                {fullName || <span className="italic text-muted-foreground">Unnamed</span>}
                              </span>
                            </div>
                          </TableCell>

                          {/* Contact type badge */}
                          <TableCell className="py-2">
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap"
                              style={{
                                color: contactType.color,
                                borderColor: `${contactType.color}40`,
                                backgroundColor: `${contactType.color}10`,
                              }}
                            >
                              {contactType.label}
                            </span>
                          </TableCell>

                          {/* Email — inline editable */}
                          <TableCell className="py-2 max-w-[180px]">
                            {inlineEditId === contact.id && inlineEditField === 'email' ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <Input
                                  autoFocus
                                  type="email"
                                  value={inlineEditValue}
                                  onChange={e => setInlineEditValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') commitInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                                  className="h-7 text-xs py-0 px-2 w-36"
                                />
                                <button onClick={commitInlineEdit} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={cancelInlineEdit} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 group/email">
                                {contact.email
                                  ? <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()} className="text-xs text-muted-foreground hover:text-primary transition-colors truncate" title={contact.email}>{contact.email}</a>
                                  : <span className="text-muted-foreground/30 text-xs">—</span>}
                                <button
                                  onClick={(e) => { e.stopPropagation(); startInlineEdit(contact.id, 'email', contact.email || ''); }}
                                  className="opacity-0 group-hover/email:opacity-60 hover:opacity-100 transition-opacity"
                                >
                                  <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                                </button>
                              </div>
                            )}
                          </TableCell>

                          {/* Phone + click-to-call */}
                          <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              {contact.phone ? (
                                <>
                                  <span className="text-xs text-muted-foreground">{contact.phone}</span>
                                  <ClickToCall phoneNumber={contact.phone} contactName={fullName} />
                                </>
                              ) : (
                                <span className="text-muted-foreground/30 text-xs">—</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Account */}
                          <TableCell className="py-2">
                            {contact.account?.name ? (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{contact.account.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/30 text-xs">—</span>
                            )}
                          </TableCell>

                          {/* Deal stage */}
                          <TableCell className="py-2">
                            {stageConfig ? (
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageConfig.color }} />
                                <span className="text-xs text-muted-foreground truncate">{stageConfig.label}</span>
                              </div>
                            ) : contact.opportunity_id ? (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">No deal</span>
                            )}
                          </TableCell>

                          {/* Owner */}
                          <TableCell className="py-2">
                            {contact.assigned_to ? (
                              <div className="flex items-center gap-1.5">
                                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", avatarColor(contact.assigned_to))}>
                                  {contact.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-xs text-muted-foreground truncate">{contact.assigned_to}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-500/80">Unassigned</span>
                            )}
                          </TableCell>

                          {/* Last activity */}
                          <TableCell className="py-2">
                            {contact.last_activity_at ? (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(contact.last_activity_at), { addSuffix: true }).replace('about ', '')}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/30">—</span>
                            )}
                          </TableCell>

                          {/* Row quick actions + overflow menu */}
                          <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity justify-end pr-1">
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="p-1.5 rounded hover:bg-muted transition-colors" title={`Email ${fullName}`}>
                                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                </a>
                              )}
                              <button onClick={() => openEditDialog(contact)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Edit">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1.5 rounded hover:bg-muted transition-colors">
                                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-popover w-48">
                                  <DropdownMenuItem onClick={() => { setSelectedContact(contact); setDetailTab('overview'); }}>
                                    <Eye className="h-4 w-4 mr-2" />View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setSelectedContact(contact); setDetailTab('comments'); }}>
                                    <MessageSquare className="h-4 w-4 mr-2" />View Comments
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openEditDialog(contact)}>
                                    <Pencil className="h-4 w-4 mr-2" />Edit
                                  </DropdownMenuItem>
                                  {!contact.opportunity_id && contact.account_id && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => handleConvertToOpportunity(contact)}>
                                        <ArrowRightCircle className="h-4 w-4 mr-2" />Convert to Opportunity
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeleteConfirmId(contact.id)} className="text-destructive focus:text-destructive">
                                    <Trash className="h-4 w-4 mr-2" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10}>
                        <EmptyState
                          icon={Users}
                          title="No contacts found"
                          description={hasActiveFilters ? "Adjust your filters or create a new contact." : "Create a contact to get started."}
                          actionLabel="New Contact"
                          onAction={openNewDialog}
                          secondaryLabel={hasActiveFilters ? "Clear filters" : undefined}
                          onSecondary={hasActiveFilters ? clearAllFilters : undefined}
                          size="sm"
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

          ) : (

            /* ── Card View ──────────────────────────────────────────────────── */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedContacts.length ? paginatedContacts.map(contact => {
                const stageConfig = contact.stage ? STAGE_CONFIG[contact.stage as OpportunityStage] : null;
                const contactType = getContactType(contact.stage);
                const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
                const initials = [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
                const avatarBg = avatarColor(fullName || contact.id);

                return (
                  <div
                    key={contact.id}
                    className={cn(
                      "group/card rounded-xl border bg-card hover:shadow-sm transition-all cursor-pointer relative overflow-hidden",
                      selectedIds.has(contact.id) && "ring-2 ring-primary border-primary/50"
                    )}
                    style={stageConfig ? { borderLeft: `3px solid ${stageConfig.color}` } : {}}
                    onClick={() => { setSelectedContact(contact); setDetailTab('overview'); }}
                  >
                    <div
                      className="absolute top-2.5 right-2.5 opacity-0 group-hover/card:opacity-100 transition-opacity z-10"
                      onClick={e => { e.stopPropagation(); toggleSelect(contact.id); }}
                    >
                      <Checkbox checked={selectedIds.has(contact.id)} />
                    </div>

                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0", avatarBg)}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <p className="font-semibold text-sm truncate leading-tight">
                            {fullName || <span className="italic text-muted-foreground text-xs">Unnamed</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                            {contact.account?.name || 'No account'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                          style={{
                            color: contactType.color,
                            borderColor: `${contactType.color}40`,
                            backgroundColor: `${contactType.color}10`,
                          }}
                        >
                          {contactType.label}
                        </span>
                        {stageConfig && (
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stageConfig.color }} />
                            <span className="text-[10px] text-muted-foreground">{stageConfig.label}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 mb-3">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </a>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground/30">
                            <Mail className="h-3 w-3" /><span>No email</span>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{contact.phone}</span>
                            <ClickToCall phoneNumber={contact.phone} contactName={fullName} />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-border/50">
                        <div className="flex items-center gap-1.5">
                          {contact.assigned_to ? (
                            <>
                              <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white", avatarColor(contact.assigned_to))}>
                                {contact.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-[10px] text-muted-foreground truncate">{contact.assigned_to.split(' ')[0]}</span>
                            </>
                          ) : (
                            <span className="text-[10px] text-amber-500">Unassigned</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
                          <button onClick={() => setDeleteConfirmId(contact.id)}
                            className="p-1 rounded hover:bg-muted text-destructive/60 hover:text-destructive transition-colors">
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="col-span-full">
                  <EmptyState
                    icon={Users}
                    title="No contacts found"
                    description={hasActiveFilters ? "Adjust your filters or create a new contact." : "Create a contact to get started."}
                    actionLabel="New Contact"
                    onAction={openNewDialog}
                    secondaryLabel={hasActiveFilters ? "Clear filters" : undefined}
                    onSecondary={hasActiveFilters ? clearAllFilters : undefined}
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/60">
              <p className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredContacts.length)} of {filteredContacts.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />Prev
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "ghost"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Next<ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Contact Detail Side Panel ═════════════════════════════════════════ */}
      <Sheet open={!!selectedContact} onOpenChange={(open) => { if (!open) setSelectedContact(null); }}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden" side="right">
          {selectedContact && (() => {
            const fullName = [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ');
            const initials = [selectedContact.first_name?.[0], selectedContact.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
            const avatarBg = avatarColor(fullName || selectedContact.id);
            const stageConfig = selectedContact.stage ? STAGE_CONFIG[selectedContact.stage as OpportunityStage] : null;
            const contactType = getContactType(selectedContact.stage);

            return (
              <>
                {/* Panel header */}
                <div className="p-6 border-b border-border/60 bg-muted/20 shrink-0">
                  <div className="flex items-start gap-4">
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0", avatarBg)}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold leading-tight truncate">
                        {fullName || <span className="italic text-muted-foreground">Unnamed</span>}
                      </h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ color: contactType.color, borderColor: `${contactType.color}40`, backgroundColor: `${contactType.color}10` }}
                        >
                          {contactType.label}
                        </span>
                        {stageConfig && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stageConfig.color }} />
                            <span className="text-xs text-muted-foreground">{stageConfig.label}</span>
                          </div>
                        )}
                        {selectedContact.account?.name && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {selectedContact.account.name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick action buttons */}
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {selectedContact.email && (
                      <a href={`mailto:${selectedContact.email}`}>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                          <Mail className="h-3.5 w-3.5" />Email
                        </Button>
                      </a>
                    )}
                    {selectedContact.phone && (
                      <div onClick={e => e.stopPropagation()}>
                        <ClickToCall phoneNumber={selectedContact.phone} contactName={fullName} />
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => { setSelectedContact(null); openEditDialog(selectedContact); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />Edit
                    </Button>
                    {!selectedContact.opportunity_id && selectedContact.account_id && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleConvertToOpportunity(selectedContact)}>
                        <ArrowRightCircle className="h-3.5 w-3.5" />Convert
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabs: Overview | Comments */}
                <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col min-h-0">
                  <TabsList className="w-full rounded-none border-b h-9 bg-transparent px-6 justify-start gap-4 shrink-0">
                    <TabsTrigger value="overview" className="text-xs h-9 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none px-0 bg-transparent">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="comments" className="text-xs h-9 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none px-0 bg-transparent">
                      Comments
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-5 m-0">
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact Info</h3>
                      <div className="space-y-3">
                        <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email">
                          {selectedContact.email
                            ? <a href={`mailto:${selectedContact.email}`} className="text-sm text-primary hover:underline">{selectedContact.email}</a>
                            : <span className="text-sm text-muted-foreground/50">—</span>}
                        </DetailRow>
                        <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
                          {selectedContact.phone
                            ? <span className="text-sm">{selectedContact.phone}</span>
                            : <span className="text-sm text-muted-foreground/50">—</span>}
                        </DetailRow>
                        {selectedContact.fax && (
                          <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Fax">
                            <span className="text-sm">{selectedContact.fax}</span>
                          </DetailRow>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border/60 pt-5">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">CRM Info</h3>
                      <div className="space-y-3">
                        <DetailRow icon={<Building2 className="h-3.5 w-3.5" />} label="Account">
                          <span className="text-sm">{selectedContact.account?.name || '—'}</span>
                        </DetailRow>
                        <DetailRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Owner">
                          {selectedContact.assigned_to ? (
                            <div className="flex items-center gap-1.5">
                              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", avatarColor(selectedContact.assigned_to))}>
                                {selectedContact.assigned_to.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-sm">{selectedContact.assigned_to}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-amber-500">Unassigned</span>
                          )}
                        </DetailRow>
                        <DetailRow icon={<TrendingUp className="h-3.5 w-3.5" />} label="Deal Stage">
                          {stageConfig ? (
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stageConfig.color }} />
                              <span className="text-sm">{stageConfig.label}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground/50">
                              {selectedContact.opportunity_id ? '—' : 'No deal linked'}
                            </span>
                          )}
                        </DetailRow>
                        <DetailRow icon={<Clock className="h-3.5 w-3.5" />} label="Last Activity">
                          <span className="text-sm">
                            {selectedContact.last_activity_at
                              ? formatDistanceToNow(new Date(selectedContact.last_activity_at), { addSuffix: true })
                              : '—'}
                          </span>
                        </DetailRow>
                        <DetailRow icon={<Clock className="h-3.5 w-3.5" />} label="Created">
                          <span className="text-sm">
                            {selectedContact.created_at
                              ? format(new Date(selectedContact.created_at), 'MMM d, yyyy')
                              : '—'}
                          </span>
                        </DetailRow>
                      </div>
                    </div>

                    <div className="border-t border-border/60 pt-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                        onClick={() => { setSelectedContact(null); setDeleteConfirmId(selectedContact.id); }}
                      >
                        <Trash className="h-3.5 w-3.5" />Delete Contact
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="comments" className="flex-1 overflow-y-auto p-6 m-0">
                    {selectedContact.opportunity_id ? (
                      <CommentsTab opportunityId={selectedContact.opportunity_id} />
                    ) : (
                      <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
                        <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No opportunity linked</p>
                        <p className="text-xs text-muted-foreground/60">
                          Convert this contact to an opportunity to enable comments.
                        </p>
                        {selectedContact.account_id && (
                          <Button size="sm" variant="outline" className="mt-2 gap-1.5 text-xs" onClick={() => handleConvertToOpportunity(selectedContact)}>
                            <ArrowRightCircle className="h-3.5 w-3.5" />Convert to Opportunity
                          </Button>
                        )}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ══ Edit Contact Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={!!editingContact} onOpenChange={(open) => { if (!open) setEditingContact(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Edit Contact</DialogTitle>
              <AutoSaveIndicator status={saveStatus} />
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Account</Label>
              <Select value={formData.account_id} onValueChange={(value) => setFormData({ ...formData, account_id: value })}>
                <SelectTrigger className="bg-secondary"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fax</Label>
                <Input value={formData.fax} onChange={(e) => setFormData({ ...formData, fax: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned To</Label>
              <Select value={formData.assigned_to || "unassigned"} onValueChange={(v) => setFormData({ ...formData, assigned_to: v === "unassigned" ? "" : v })}>
                <SelectTrigger className="bg-secondary"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {TEAM_MEMBERS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setEditingContact(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ New Contact Dialog ════════════════════════════════════════════════ */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Account *</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => { setIsNewAccount(!isNewAccount); setNewAccountName(''); setFormData({ ...formData, account_id: '' }); }}
                >
                  {isNewAccount ? 'Select existing' : '+ New account'}
                </Button>
              </div>
              {isNewAccount ? (
                <Input placeholder="Enter company name" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
              ) : (
                <Select value={formData.account_id} onValueChange={(v) => setFormData({ ...formData, account_id: v })}>
                  <SelectTrigger className="bg-secondary"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fax</Label>
                <Input value={formData.fax} onChange={(e) => setFormData({ ...formData, fax: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateContact}>Create Contact</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Delete Confirmations ══════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this contact? This action cannot be undone.</AlertDialogDescription>
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
