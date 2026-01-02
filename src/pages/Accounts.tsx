import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Account, Contact } from "@/types/opportunity";
import { AppLayout } from "@/components/AppLayout";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Search, Users, Trash } from "lucide-react";
import { toast } from "sonner";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { SortableTableHead } from "@/components/SortableTableHead";

type SortField = 'name' | 'contacts' | 'city' | 'state' | 'country' | 'website';
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
  const [accounts, setAccounts] = useState<AccountWithContacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<AccountWithContacts | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
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
          console.log('Real-time account update:', payload);
          
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
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, status, address1, address2, city, state, zip, country, website, created_at, contacts(id, first_name, last_name, email)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setAccounts(data as AccountWithContacts[]);
    }
    setLoading(false);
  };

  const openEditDialog = (account: AccountWithContacts) => {
    setEditingAccount(account);
    setSelectedContactId('');
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

  // Delete an account after confirmation. Removes the record from Supabase and updates local state
  const handleDeleteAccount = async (accountId: string) => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this account? This will remove any linked contacts.'
    );
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('accounts').delete().eq('id', accountId);
      if (error) {
        toast.error('Failed to delete account');
        return;
      }
      // Optimistically update the client state
      setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
      toast.success('Account deleted');
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
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
      <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <AppLayout
      pageTitle="Accounts"
      headerActions={
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 w-48 lg:w-64"
          />
        </div>
      }
    >
      <main className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <Card className="border-muted/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total accounts</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-semibold">{totalAccounts}</div>
                  <p className="text-xs text-muted-foreground mt-1">Merchant profiles captured</p>
                </CardContent>
              </Card>
              <Card className="border-muted/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">With contacts</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-semibold">{accountsWithContacts}</div>
                  <p className="text-xs text-muted-foreground mt-1">Linked to at least one contact</p>
                </CardContent>
              </Card>
              <Card className="border-muted/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">With websites</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-semibold">{accountsWithWebsites}</div>
                  <p className="text-xs text-muted-foreground mt-1">Ready for research</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Account directory</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <SortableTableHead field="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Name</SortableTableHead>
                      <SortableTableHead field="contacts" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Contacts</SortableTableHead>
                      <SortableTableHead field="city" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>City</SortableTableHead>
                      <SortableTableHead field="state" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>State</SortableTableHead>
                      <SortableTableHead field="country" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Country</SortableTableHead>
                      <SortableTableHead field="website" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Website</SortableTableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account, index) => (
                      <TableRow key={account.id} className="hover:bg-muted/50">
                        <TableCell className="text-muted-foreground text-sm">{index + 1}</TableCell>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell>
                          {account.contacts && account.contacts.length > 0 ? (
                            <Select value="placeholder" onValueChange={() => {}}>
                              <SelectTrigger className="w-48 bg-secondary">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span>{account.contacts.length} contact{account.contacts.length !== 1 ? 's' : ''}</span>
                                </div>
                              </SelectTrigger>
                              <SelectContent className="bg-popover">
                                {account.contacts.map((contact) => (
                                  <SelectItem key={contact.id} value={contact.id} disabled>
                                    <div className="flex flex-col">
                                      <span>{contact.first_name} {contact.last_name}</span>
                                      {contact.email && (
                                        <span className="text-xs text-muted-foreground">{contact.email}</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="bg-muted/40 text-muted-foreground">No contacts</Badge>
                          )}
                        </TableCell>
                        <TableCell>{account.city || '-'}</TableCell>
                        <TableCell>{account.state || '-'}</TableCell>
                        <TableCell>{account.country || '-'}</TableCell>
                        <TableCell>
                          {account.website ? (
                            <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                              {account.website}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
                              onClick={() => handleDeleteAccount(account.id)}
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
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
    </AppLayout>
  );
};

export default Accounts;