import { useState, useEffect } from "react";
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
import { Pencil, Plus, Search, ArrowRightCircle, Eye, Filter, Trash } from "lucide-react";
import { toast } from "sonner";
import CommentsTab from "@/components/CommentsTab";
import { cn } from "@/lib/utils";

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

const TEAM_BG_COLORS: Record<string, string> = {
  'Wesley': 'bg-team-wesley/20',
  'Jamie': 'bg-team-jamie/20',
  'Darryn': 'bg-team-darryn/20',
  'Taryn': 'bg-team-taryn/20',
  'Yaseen': 'bg-team-yaseen/20',
  'Sales': 'bg-team-sales/20',
};

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

/**
 * Contacts page
 *
 * This component extends the existing contacts management page with a
 * handful of user‑experience improvements.  Search and filter inputs
 * are wider by default, dialogs employ more generous spacing, and
 * autopopulation logic has been added to the new contact form to
 * reduce the number of clicks required when only one account is
 * available.  These enhancements build upon the project’s
 * established patterns without changing its core functionality.
 */
const Contacts = () => {
  const [contacts, setContacts] = useState<ContactWithAccount[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContact, setEditingContact] = useState<ContactWithAccount | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  // When opening the new contact dialog, preselect the first account if one exists and
  // the user isn’t creating a new account.  This reduces clicks when there is only
  // one account on file.
  useEffect(() => {
    if (isNewDialogOpen && !isNewAccount && accounts.length > 0 && !formData.account_id) {
      setFormData((data) => ({ ...data, account_id: accounts[0].id }));
    }
  }, [isNewDialogOpen, isNewAccount, accounts]);

  const filteredContacts = contacts
    .filter((contact) => {
      const query = searchQuery.toLowerCase();
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
    })
    .filter((contact) => {
      if (assignmentFilter === 'assigned') return !!contact.assigned_to;
      if (assignmentFilter === 'unassigned') return !contact.assigned_to;
      return true;
    });

  const totalContacts = contacts.length;
  const assignedContacts = contacts.filter((contact) => !!contact.assigned_to).length;
  const opportunityContacts = contacts.filter((contact) => !!contact.opportunity_id).length;

  useEffect(() => {
    fetchContacts();
    fetchAccounts();
  }, []);

  /**
   * Loads contacts along with their account name and the first linked
   * opportunity so assignment and stage data can be shown in the list without
   * additional queries.
   */
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

      // Delete a contact with confirmation and update state
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

  const handleSave = async () => {
    if (!editingContact) return;
    try {
      const { error: contactError } = await supabase
        .from('contacts')
        .update({
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          fax: formData.fax || null,
          // fallback to original account_id if none selected
          account_id: formData.account_id || editingContact.account_id,
        })
        .eq('id', editingContact.id);

      if (contactError) {
        toast.error('Failed to update contact');
        return;
      }

      if (editingContact.opportunity_id) {
        const { error: oppError } = await supabase
          .from('opportunities')
          .update({ assigned_to: formData.assigned_to || null })
          .eq('id', editingContact.opportunity_id);

        if (oppError) {
          toast.error('Failed to update assignment');
          return;
        }
      }

      toast.success('Contact updated');
      setEditingContact(null);
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    }
  };

  const handleCreateContact = async () => {
    try {
      let accountId = formData.account_id;

      // Create new account if needed
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
        fetchAccounts(); // Refresh accounts list
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-20 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Relationship Hub</p>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Contacts</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">Search, filter, and collaborate on every merchant contact in one view.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-72" // widen search field
                />
              </div>
              <Select value={assignmentFilter} onValueChange={(value: 'all' | 'assigned' | 'unassigned') => setAssignmentFilter(value)}>
                <SelectTrigger className="w-[160px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Filter" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignments</SelectItem>
                  <SelectItem value="assigned">Assigned only</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-1" />
                New Contact
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <Card className="border-muted/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total contacts</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-semibold">{totalContacts}</div>
                  <p className="text-xs text-muted-foreground mt-1">All saved contact records</p>
                </CardContent>
              </Card>
              <Card className="border-muted/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Assigned</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-semibold">{assignedContacts}</div>
                  <p className="text-xs text-muted-foreground mt-1">Contacts with an owner</p>
                </CardContent>
              </Card>
              <Card className="border-muted/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Linked to pipeline</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-semibold">{opportunityContacts}</div>
                  <p className="text-xs text-muted-foreground mt-1">Have an active opportunity</p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contact directory</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>First Name</TableHead>
                      <TableHead>Last Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.length ? (
                      filteredContacts.map((contact) => {
                        const stageConfig = contact.stage
                          ? STAGE_CONFIG[contact.stage as OpportunityStage]
                          : null;

                        return (
                          <TableRow
                            key={contact.id}
                            className={`hover:bg-muted/50 ${contact.assigned_to ? TEAM_BG_COLORS[contact.assigned_to] || '' : ''}`}
                          >
                            <TableCell className="font-medium">{contact.first_name || '-'}</TableCell>
                            <TableCell>{contact.last_name || '-'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{contact.email || '-'}</TableCell>
                            <TableCell className="text-sm">{contact.phone || '-'}</TableCell>
                            <TableCell>{contact.account?.name || '-'}</TableCell>
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
                                  className={cn(
                                    "text-[11px] font-medium border",
                                    stageConfig.badgeClass
                                  )}
                                >
                                  {stageConfig.label}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedContact(contact)}
                                  title="View Contact Details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(contact)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {!contact.opportunity_id && contact.account_id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleConvertToOpportunity(contact)}
                                    title="Convert to Opportunity"
                                  >
                                    <ArrowRightCircle className="h-4 w-4 text-primary" />
                                  </Button>
                                )}
                                {/* Delete contact button */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteContact(contact.id)}
                                  title="Delete Contact"
                                >
                                  <Trash className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                          No contacts match your filters yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
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
          // Only clear the editing contact when the dialog is closed
          if (!open) setEditingContact(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
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
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setEditingContact(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Changes
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