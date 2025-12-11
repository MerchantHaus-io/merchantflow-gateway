import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Contact, Account, TEAM_MEMBERS } from "@/types/opportunity";
import { AppSidebar } from "@/components/AppSidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

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

const TEAM_BG_COLORS: Record<string, string> = {
  Wesley: "bg-team-wesley/20",
  Leo: "bg-team-leo/20",
  Jamie: "bg-team-jamie/20",
  Darryn: "bg-team-darryn/20",
  Taryn: "bg-team-taryn/20",
  Yaseen: "bg-team-yaseen/20",
};

const STAGE_LABELS: Record<string, string> = {
  application_started: "New",
  discovery: "Discovery",
  qualified: "Qualified",
  underwriting_review: "Underwriting Review",
  processor_approval: "Processor Approval",
  integration_setup: "Integration Setup",
  gateway_submitted: "Gateway Submitted",
  live_activated: "Live / Activated",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const getStageBadge = (stage?: string | null) => {
  if (!stage) return "-";

  const label = STAGE_LABELS[stage] || stage;

  let colorClasses =
    "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-100";

  switch (stage) {
    case "application_started":
    case "discovery":
      colorClasses =
        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100";
      break;
    case "qualified":
    case "underwriting_review":
    case "processor_approval":
    case "integration_setup":
    case "gateway_submitted":
      colorClasses =
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100";
      break;
    case "live_activated":
    case "closed_won":
      colorClasses =
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100";
      break;
    case "closed_lost":
      colorClasses =
        "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100";
      break;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses}`}
    >
      {label}
    </span>
  );
};

const Contacts = () => {
  const [contacts, setContacts] = useState<ContactWithAccount[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingContact, setEditingContact] =
    useState<ContactWithAccount | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    fax: "",
    assigned_to: "",
    account_id: "",
  });

  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const firstName = (contact.first_name || "").toLowerCase();
    const lastName = (contact.last_name || "").toLowerCase();
    const email = (contact.email || "").toLowerCase();
    const accountName = (contact.account?.name || "").toLowerCase();

    return (
      firstName.includes(query) ||
      lastName.includes(query) ||
      email.includes(query) ||
      accountName.includes(query)
    );
  });

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchContacts(), fetchAccounts()]);
      setLoading(false);
    };

    init();
  }, []);

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select(`*, account:accounts(name), opportunities(id, assigned_to, stage)`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load contacts");
      return;
    }

    if (data) {
      const contactsWithAssignment = data.map((contact: any) => ({
        ...contact,
        assigned_to: contact.opportunities?.[0]?.assigned_to || null,
        stage: contact.opportunities?.[0]?.stage || null,
        opportunity_id: contact.opportunities?.[0]?.id || null,
      }));
      setContacts(contactsWithAssignment as ContactWithAccount[]);
    }
  };

  const fetchAccounts = async () => {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      toast.error("Failed to load accounts");
      return;
    }

    if (data) {
      setAccounts(data);
    }
  };

  const openEditDialog = (contact: ContactWithAccount) => {
    setEditingContact(contact);
    setFormData({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      fax: contact.fax || "",
      assigned_to: contact.assigned_to || "",
      account_id: contact.account_id || "",
    });
  };

  const openNewDialog = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      fax: "",
      assigned_to: "",
      account_id: "",
    });
    setIsNewAccount(false);
    setNewAccountName("");
    setIsNewDialogOpen(true);
  };

  const resetEditState = () => {
    setEditingContact(null);
  };

  const handleSave = async () => {
    if (!editingContact) return;

    const { error: contactError } = await supabase
      .from("contacts")
      .update({
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email || null,
        phone: formData.phone || null,
        fax: formData.fax || null,
        account_id: formData.account_id || editingContact.account_id,
      })
      .eq("id", editingContact.id);

    if (contactError) {
      console.error(contactError);
      toast.error("Failed to update contact");
      return;
    }

    if (editingContact.opportunity_id) {
      const { error: oppError } = await supabase
        .from("opportunities")
        .update({ assigned_to: formData.assigned_to || null })
        .eq("id", editingContact.opportunity_id);

      if (oppError) {
        console.error(oppError);
        toast.error("Failed to update assignment");
        return;
      }
    }

    toast.success("Contact updated");
    resetEditState();
    await fetchContacts();
  };

  const handleCreateContact = async () => {
    let accountId = formData.account_id;

    if (isNewAccount) {
      if (!newAccountName.trim()) {
        toast.error("Please enter a company name");
        return;
      }

      const { data: newAccount, error: accountError } = await supabase
        .from("accounts")
        .insert({ name: newAccountName.trim() })
        .select()
        .single();

      if (accountError || !newAccount) {
        console.error(accountError);
        toast.error("Failed to create account");
        return;
      }

      accountId = newAccount.id;
      fetchAccounts();
    } else if (!accountId) {
      toast.error("Please select an account");
      return;
    }

    if (!formData.first_name && !formData.last_name) {
      toast.error("Please enter a name");
      return;
    }

    const { error } = await supabase.from("contacts").insert({
      account_id: accountId,
      first_name: formData.first_name || null,
      last_name: formData.last_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      fax: formData.fax || null,
    });

    if (error) {
      console.error(error);
      toast.error("Failed to create contact");
      return;
    }

    toast.success("Contact created");
    setIsNewDialogOpen(false);
    setIsNewAccount(false);
    setNewAccountName("");
    await fetchContacts();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading contacts...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <div className="flex flex-col gap-0.5">
              <h1 className="text-lg font-semibold text-foreground">
                Contacts
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Manage your leads, customers and their assignments.
              </p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-xs text-muted-foreground md:inline-flex">
                {filteredContacts.length} of {contacts.length} contacts
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-52 md:w-64"
                />
              </div>
              <Button size="sm" onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-1" />
                New Contact
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="rounded-lg border bg-card shadow-sm">
              <div className="border-b px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  All Contacts
                </span>
                <span className="text-xs text-muted-foreground">
                  Click a row&apos;s edit icon to update details.
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-background/95 backdrop-blur z-10">
                      <TableHead>First Name</TableHead>
                      <TableHead>Last Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-16 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="h-28 text-center text-sm text-muted-foreground"
                        >
                          No contacts found. Try a different search or create a
                          new contact.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredContacts.map((contact) => (
                        <TableRow
                          key={contact.id}
                          className={`hover:bg-muted/50 transition-colors ${
                            contact.assigned_to
                              ? TEAM_BG_COLORS[contact.assigned_to] || ""
                              : ""
                          }`}
                        >
                          <TableCell>{contact.first_name || "-"}</TableCell>
                          <TableCell>{contact.last_name || "-"}</TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {contact.email || "-"}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate">
                            {contact.phone || "-"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {contact.account?.name || "-"}
                          </TableCell>
                          <TableCell>
                            {contact.assigned_to ? (
                              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs">
                                {contact.assigned_to}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{getStageBadge(contact.stage)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(contact)}
                              aria-label="Edit contact"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* Edit Contact Dialog */}
      {editingContact && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              resetEditState();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Edit Contact
                {editingContact.first_name || editingContact.last_name
                  ? ` – ${editingContact.first_name || ""} ${
                      editingContact.last_name || ""
                    }`
                  : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Account</Label>
                <Select
                  value={formData.account_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, account_id: value })
                  }
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        first_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        last_name: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fax</Label>
                  <Input
                    value={formData.fax}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fax: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select
                  value={formData.assigned_to}
                  onValueChange={(value) =>
                    setFormData({ ...formData, assigned_to: value })
                  }
                >
                  <SelectTrigger className="bg-secondary">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="">Unassigned</SelectItem>
                    {TEAM_MEMBERS.map((member) => (
                      <SelectItem key={member} value={member}>
                        {member}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={resetEditState}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New Contact Dialog */}
      <Dialog
        open={isNewDialogOpen}
        onOpenChange={(open) => {
          setIsNewDialogOpen(open);
          if (!open) {
            setIsNewAccount(false);
            setNewAccountName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Account <span className="text-rose-500">*</span>
                </Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setIsNewAccount(!isNewAccount);
                    setNewAccountName("");
                    setFormData({ ...formData, account_id: "" });
                  }}
                >
                  {isNewAccount ? "Select existing" : "+ New account"}
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
                  onValueChange={(value) =>
                    setFormData({ ...formData, account_id: value })
                  }
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      first_name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      last_name: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phone: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fax</Label>
                <Input
                  value={formData.fax}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fax: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsNewDialogOpen(false);
                  setIsNewAccount(false);
                  setNewAccountName("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateContact}>Create Contact</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default Contacts;
