import { useState, useEffect, useCallback, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Account, Contact, STAGE_CONFIG } from "@/types/opportunity";
import { AppLayout } from "@/components/AppLayout";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Search, Users, Trash, Mail, Phone, ExternalLink, Check, X, Plus, TrendingUp, Globe, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { SortableTableHead } from "@/components/SortableTableHead";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Building2 as Building2Icon } from "lucide-react";

type SortField = 'name' | 'contacts' | 'city' | 'state' | 'country' | 'website' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface AccountWithContacts extends Account {
  contacts?: Contact[];
}

/**
 * Accounts page
 *
 * In addition to the existing functionality for viewing and editing
 * merchant accounts, this version introduces modest spacing tweaks
 * throughout the page.  Search inputs are wider, form fields have
 * larger vertical spacing between them, and grid gaps within the
 * edit dialog have been increased.  These adjustments help reduce
 * visual clutter and improve overall readability without altering the
 * underlying data model or behaviour.
 */
const Accounts = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountWithContacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountWithContacts | null>(null);
  
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    website: ''
  });
  // Search query for filtering accounts
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // Inline editing state
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  const [accountOpportunities, setAccountOpportunities] = useState<Record<string, { stage: string; label: string; color: string; assigned_to?: string }>>({});

  const startInlineEdit = (accountId: string, field: string, currentValue: string) => {
    setInlineEditId(accountId);
    setInlineEditField(field);
    setInlineEditValue(currentValue || '');
  };

  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineEditField(null);
    setInlineEditValue('');
  };

  const commitInlineEdit = async () => {
    if (!inlineEditId || !inlineEditField) return;
    const { error } = await supabase
      .from('accounts')
      .update({ [inlineEditField]: inlineEditValue || null })
      .eq('id', inlineEditId);
    if (error) {
      toast.error('Failed to save');
    } else {
      setAccounts(prev => prev.map(a =>
        a.id === inlineEditId ? { ...a, [inlineEditField]: inlineEditValue } : a
      ));
      toast.success('Saved');
    }
    cancelInlineEdit();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as SortField);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    fetchAccounts();

    // Subscribe to real-time changes on accounts table
    const channel = supabase
      .channel('accounts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts'
        },
        (payload) => {
          
          
          if (payload.eventType === 'INSERT') {
            fetchSingleAccount(payload.new.id);
          } else if (payload.eventType === 'UPDATE') {
            setAccounts(prev => prev.map(acc => {
              if (acc.id === payload.new.id) {
                return {
                  ...acc,
                  name: payload.new.name,
                  status: payload.new.status,
                  address1: payload.new.address1,
                  address2: payload.new.address2,
                  city: payload.new.city,
                  state: payload.new.state,
                  zip: payload.new.zip,
                  country: payload.new.country,
                  website: payload.new.website,
                };
              }
              return acc;
            }));
          } else if (payload.eventType === 'DELETE') {
            setAccounts(prev => prev.filter(acc => acc.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch a single account with contacts for real-time inserts
  const fetchSingleAccount = async (accountId: string) => {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, status, address1, address2, city, state, zip, country, website, created_at, contacts(id, first_name, last_name, email)')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      console.error('Error fetching single account:', error);
      return;
    }

    setAccounts(prev => {
      if (prev.some(acc => acc.id === accountId)) {
        return prev;
      }
      return [data as AccountWithContacts, ...prev];
    });
  };

  const fetchAccounts = async () => {
    setFetchError(null);
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, status, address1, address2, city, state, zip, country, website, created_at, contacts(id, first_name, last_name, email)')
      .order('created_at', { ascending: false });
    if (error) {
      setFetchError('Failed to load accounts. Please try again.');
    } else if (data) {
      setAccounts(data as AccountWithContacts[]);
    }
    // Also fetch latest opportunity per account
    const { data: oppData } = await supabase
      .from('opportunities')
      .select('account_id, stage, assigned_to, status, updated_at')
      .neq('status', 'dead')
      .order('updated_at', { ascending: false });
    if (oppData) {
      const map: Record<string, { stage: string; label: string; color: string; assigned_to?: string }> = {};
      oppData.forEach((opp: any) => {
        if (!map[opp.account_id]) {
          const cfg = STAGE_CONFIG[opp.stage as keyof typeof STAGE_CONFIG];
          if (cfg) map[opp.account_id] = { stage: opp.stage, label: cfg.label, color: cfg.color, assigned_to: opp.assigned_to };
        }
      });
      setAccountOpportunities(map);
    }
    setLoading(false);
  };

  const openEditDialog = (account: AccountWithContacts) => {
    setEditingAccount(account);
    setFormData({
      name: account.name || '',
      address1: account.address1 || '',
      address2: account.address2 || '',
      city: account.city || '',
      state: account.state || '',
      zip: account.zip || '',
      country: account.country || '',
      website: account.website || ''
    });
  };

  // Delete an account after confirmation
  const handleDeleteAccount = async (accountId: string) => {
    try {
      const { error } = await supabase.from('accounts').delete().eq('id', accountId);
      if (error) {
        toast.error('Failed to delete account');
        return;
      }
      setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
      toast.success('Account deleted');
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Auto-save callback for accounts
  const handleAutoSave = useCallback(async (data: typeof formData) => {
    if (!editingAccount) return;
    const { error } = await supabase
      .from('accounts')
      .update({
        name: data.name,
        address1: data.address1 || null,
        address2: data.address2 || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        country: data.country || null,
        website: data.website || null
      })
      .eq('id', editingAccount.id);

    if (error) {
      throw error;
    }
    // Silently refresh accounts list
    fetchAccounts();
  }, [editingAccount]);

  const { status: saveStatus, resetInitialData } = useAutoSave({
    data: formData,
    onSave: handleAutoSave,
    delay: 800,
    enabled: !!editingAccount,
  });

  // Reset auto-save state when opening edit dialog
  useEffect(() => {
    if (editingAccount) {
      resetInitialData();
    }
  }, [editingAccount, resetInitialData]);


  // Filter and sort accounts based on search query and sort settings
  const filteredAccounts = useMemo(() => {
    let result = accounts.filter((account) => {
      const query = searchQuery.toLowerCase();
      return (
        account.name.toLowerCase().includes(query) ||
        (account.city ?? '').toLowerCase().includes(query) ||
        (account.state ?? '').toLowerCase().includes(query) ||
        (account.country ?? '').toLowerCase().includes(query) ||
        (account.website ?? '').toLowerCase().includes(query)
      );
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'contacts':
          comparison = (a.contacts?.length || 0) - (b.contacts?.length || 0);
          break;
        case 'city':
          comparison = (a.city || '').localeCompare(b.city || '');
          break;
        case 'state':
          comparison = (a.state || '').localeCompare(b.state || '');
          break;
        case 'country':
          comparison = (a.country || '').localeCompare(b.country || '');
          break;
        case 'website':
          comparison = (a.website || '').localeCompare(b.website || '');
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [accounts, searchQuery, sortField, sortDirection]);

  const totalAccounts = accounts.length;
  const accountsWithContacts = accounts.filter((account) => (account.contacts?.length || 0) > 0).length;
  const accountsWithWebsites = accounts.filter((account) => !!account.website).length;

  if (loading) {
    return (
      <AppLayout>
        <PageHeader icon={Building2Icon} title="Accounts" color="teal" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading accounts…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (fetchError) {
    return (
      <AppLayout>
        <PageHeader icon={Building2Icon} title="Accounts" color="teal" />
        <div className="p-6">
          <QueryErrorCard message={fetchError} onRetry={() => { setLoading(true); fetchAccounts(); }} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        icon={Building2Icon}
        title="Accounts"
        description={`${totalAccounts} accounts · ${accountsWithContacts} with contacts · ${Object.keys(accountOpportunities).length} active deals`}
        color="teal"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-48 lg:w-64"
              />
            </div>
            <Button size="sm" onClick={() => toast.info('Use New Application on the Pipeline to create accounts')}>
              <Plus className="h-4 w-4 mr-1" /> Add Account
            </Button>
          </div>
        }
      />
      <div className="p-4 lg:p-6 space-y-4">

            <Card>
              <CardHeader className="pb-0 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Click any cell to edit inline · Deal stage shown from latest active opportunity</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead field="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Account</SortableTableHead>
                      <TableHead>Active Deal</TableHead>
                      <SortableTableHead field="contacts" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Contacts</SortableTableHead>
                      <TableHead>Location</TableHead>
                      <SortableTableHead field="website" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Website</SortableTableHead>
                      <SortableTableHead field="created_at" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Created</SortableTableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => {
                      const activeDeal = accountOpportunities[account.id];
                      return (
                      <TableRow key={account.id} className={cn("hover:bg-muted/30 group/row", account.status === 'dead' && "opacity-50")}>
                        <TableCell className="font-medium py-2.5">
                          {inlineEditId === account.id && inlineEditField === 'name' ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                value={inlineEditValue}
                                onChange={e => setInlineEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                                className="h-7 text-sm py-0 px-2 w-40"
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitInlineEdit}><Check className="h-3 w-3 text-success" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}><X className="h-3 w-3 text-muted-foreground" /></Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/cell">
                              <span
                                className="cursor-pointer hover:text-primary transition-colors"
                                onClick={() => startInlineEdit(account.id, 'name', account.name)}
                                title="Click to edit"
                              >
                                {account.name}
                              </span>
                              {account.status === 'dead' && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Dead</Badge>
                              )}
                              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cell:opacity-60 transition-opacity" />
                            </div>
                          )}
                        </TableCell>
                        {/* Active deal */}
                        <TableCell className="py-2.5">
                          {activeDeal ? (
                            <button
                              onClick={() => navigate('/opportunities')}
                              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeDeal.color }} />
                              <span className="text-xs font-medium">{activeDeal.label}</span>
                              {activeDeal.assigned_to && (
                                <span className="text-xs text-muted-foreground hidden lg:inline">· {activeDeal.assigned_to}</span>
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate('/opportunities?new=true')}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-teal transition-colors opacity-0 group-hover/row:opacity-100"
                            >
                              <Plus className="h-3 w-3" /> New deal
                            </button>
                          )}
                        </TableCell>
                        {/* Contacts */}
                        <TableCell className="py-2.5">
                          {account.contacts && account.contacts.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 gap-1.5 px-2 text-xs hover:bg-muted">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  {account.contacts.length}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-0" align="start">
                                <div className="p-2 border-b border-border">
                                  <p className="text-xs font-medium text-muted-foreground">{account.name}</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {account.contacts.map((contact) => (
                                    <button key={contact.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 flex flex-col gap-0.5 border-b border-border/40 last:border-0"
                                      onClick={() => navigate(`/contacts?highlight=${contact.id}`)}>
                                      <span className="text-xs font-medium">{contact.first_name} {contact.last_name}</span>
                                      {contact.email && <span className="text-[10px] text-muted-foreground">{contact.email}</span>}
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {/* Location combined */}
                        <TableCell className="py-2.5">
                          <span className="text-xs text-muted-foreground">
                            {[account.city, account.state, account.country].filter(Boolean).join(', ') || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {inlineEditId === account.id && inlineEditField === 'website' ? (
                            <div className="flex items-center gap-1">
                              <Input autoFocus value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }} className="h-7 text-sm py-0 px-2 w-36" placeholder="https://" />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitInlineEdit}><Check className="h-3 w-3 text-success" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}><X className="h-3 w-3 text-muted-foreground" /></Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group/cell">
                              {account.website ? (
                                <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm truncate max-w-[140px]" title={account.website}>
                                  {account.website.replace(/^https?:\/\//, '')}
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-sm cursor-pointer hover:text-primary" onClick={() => startInlineEdit(account.id, 'website', account.website || '')}>—</span>
                              )}
                              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cell:opacity-60 transition-opacity cursor-pointer" onClick={() => startInlineEdit(account.id, 'website', account.website || '')} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {account.created_at ? formatDistanceToNow(new Date(account.created_at), { addSuffix: true }).replace('about ', '') : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirm(account.id)}
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                    {filteredAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <EmptyState
                            icon={Building2Icon}
                            title="No accounts found"
                            description="Try adjusting your search or create a new application."
                            size="sm"
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
      <Dialog
        open={!!editingAccount}
        onOpenChange={(open) => {
          // Only clear editingAccount state when the dialog is closed
          if (!open) setEditingAccount(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Edit Account</DialogTitle>
              <AutoSaveIndicator status={saveStatus} />
            </div>
          </DialogHeader>
          {/* Increase vertical spacing and padding in the edit dialog */}
          <div className="space-y-5 py-5">
            <div className="space-y-3">
              <Label>Company Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-3">
              <Label>Address</Label>
              <Input
                value={formData.address1}
                onChange={(e) => setFormData({ ...formData, address1: e.target.value })}
              />
            </div>
            <div className="space-y-3">
              <Label>Address 2</Label>
              <Input
                value={formData.address2}
                onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>State</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Zip</Label>
                <Input
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Website</Label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setEditingAccount(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this account? This will remove any linked contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDeleteAccount(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Accounts;