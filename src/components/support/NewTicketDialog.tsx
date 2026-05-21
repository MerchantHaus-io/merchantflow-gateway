import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "@/lib/support";

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: string) => void;
}

const blankForm = {
  subject: "",
  category: "support" as TicketCategory,
  priority: "normal" as TicketPriority,
  description: "",
  accountId: "",
  contactId: "",
  requesterName: "",
  requesterEmail: "",
};

export function NewTicketDialog({ open, onOpenChange, onCreated }: NewTicketDialogProps) {
  const { user } = useAuth();
  const [form, setForm] = useState(blankForm);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["support-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["support-account-contacts", form.accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email")
        .eq("account_id", form.accountId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!form.accountId,
  });

  const selectedAccount = accounts.find((a) => a.id === form.accountId);

  const update = (patch: Partial<typeof blankForm>) => setForm((f) => ({ ...f, ...patch }));

  const pickContact = (contactId: string) => {
    const c = contacts.find((x) => x.id === contactId);
    update({
      contactId,
      requesterName: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : form.requesterName,
      requesterEmail: c?.email ?? form.requesterEmail,
    });
  };

  const reset = () => {
    setForm(blankForm);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!form.subject.trim()) {
      toast.error("A subject is required.");
      return;
    }
    if (!form.requesterEmail.trim()) {
      toast.error("A requester email is required.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          subject: form.subject.trim(),
          description: form.description.trim() || null,
          category: form.category,
          priority: form.priority,
          status: "open",
          source: "manual",
          requester_name: form.requesterName.trim() || null,
          requester_email: form.requesterEmail.trim().toLowerCase(),
          account_id: form.accountId || null,
          contact_id: form.contactId || null,
          created_by: user?.id ?? null,
        })
        .select("id, ticket_number")
        .single();

      if (error) throw error;

      toast.success(`Ticket ${data.ticket_number} created`);
      onCreated(data.id);
      onOpenChange(false);
      reset();
    } catch (err) {
      console.error("Failed to create ticket:", err);
      toast.error("Could not create the ticket. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Support Ticket</DialogTitle>
          <DialogDescription>
            Log a ticket for a live or billing client. It lands in triage for anyone to pick up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject *</Label>
            <Input
              id="ticket-subject"
              value={form.subject}
              onChange={(e) => update({ subject: e.target.value })}
              placeholder="Short summary of the issue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => update({ category: v as TicketCategory })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => update({ priority: v as TicketPriority })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea
              id="ticket-description"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What does the client need help with?"
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Linked account (optional)</Label>
            <Popover open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {selectedAccount ? selectedAccount.name : "No account linked"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search accounts..." />
                  <CommandList>
                    <CommandEmpty>No accounts found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          update({ accountId: "", contactId: "" });
                          setAccountPickerOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !form.accountId ? "opacity-100" : "opacity-0")} />
                        No account linked
                      </CommandItem>
                      {accounts.map((a) => (
                        <CommandItem
                          key={a.id}
                          value={a.name}
                          onSelect={() => {
                            update({ accountId: a.id, contactId: "" });
                            setAccountPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", form.accountId === a.id ? "opacity-100" : "opacity-0")}
                          />
                          {a.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {form.accountId && contacts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Contact (optional)</Label>
              <Select value={form.contactId} onValueChange={pickContact}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "Unnamed contact"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-requester-name">Requester name</Label>
              <Input
                id="ticket-requester-name"
                value={form.requesterName}
                onChange={(e) => update({ requesterName: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-requester-email">Support email *</Label>
              <Input
                id="ticket-requester-email"
                type="email"
                value={form.requesterEmail}
                onChange={(e) => update({ requesterEmail: e.target.value })}
                placeholder="jane@client.com"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
