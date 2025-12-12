import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Account, Contact } from "@/types/opportunity";
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
import { Pencil, Search, Users } from "lucide-react";
import { toast } from "sonner";

interface AccountWithContacts extends Account {
  contacts?: Contact[];
}

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

  useEffect(() => {
    fetchAccounts();
  }, []);

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

  const handleSave = async () => {
    if (!editingAccount) return;
    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: formData.name,
          address1: formData.address1 || null,
          address2: formData.address2 || null,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          country: formData.country || null,
          website: formData.website || null
        })
        .eq('id', editingAccount.id);

      if (error) {
        toast.error('Failed to update account');
        return;
      }

      toast.success('Account updated');
      setEditingAccount(null);
      fetchAccounts();
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Filter accounts based on search query across several fields
  const filteredAccounts = accounts.filter((account) => {
    const query = searchQuery.toLowerCase();
    return (
      account.name.toLowerCase().includes(query) ||
      (account.city ?? '').toLowerCase().includes(query) ||
      (account.state ?? '').toLowerCase().includes(query) ||
      (account.country ?? '').toLowerCase().includes(query) ||
      (account.website ?? '').toLowerCase().includes(query)
    );
  });

  const totalAccounts = accounts.length;
  const accountsWithContacts = accounts.filter((account) => (account.contacts?.length || 0) > 0).length;
  const accountsWithWebsites = accounts.filter((account) => !!account.website).length;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-20 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Company records</p>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Accounts</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">Keep every merchant profile organized and ready for outreach.</p>
            </div>
            <div className="ml-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
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
                      <TableHead>Name</TableHead>
                      <TableHead>Contacts</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => (
                      <TableRow key={account.id} className="hover:bg-muted/50">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(account)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
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
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address1}
                onChange={(e) => setFormData({ ...formData, address1: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Address 2</Label>
              <Input
                value={formData.address2}
                onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Zip</Label>
                <Input
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingAccount(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default Accounts;