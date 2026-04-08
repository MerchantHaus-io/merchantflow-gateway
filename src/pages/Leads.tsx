import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Search, Users, Mail, Phone, Building2, MapPin, Globe,
  Clock, ChevronRight, MessageSquare, FileText, X,
  ArrowRightCircle, Send, PhoneIncoming, PhoneOutgoing,
  UserPlus, ChevronLeft, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ClickToCall } from "@/components/ClickToCall";

/* ─── Types ─── */
interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  created_at: string;
  account_id: string;
  account?: {
    id: string;
    name: string;
    status: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    website: string | null;
  };
}

interface Interaction {
  id: string;
  subject: string;
  interaction_type: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  contact_name: string | null;
  contact_email: string | null;
  channel: string | null;
  created_at: string;
  created_by_email: string | null;
}

type FilterTab = "all" | "active" | "lead";

const ITEMS_PER_PAGE = 50;

/* ─── Interaction type config ─── */
const TYPE_CFG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  email: { icon: Mail, color: "text-sky-500", label: "Email" },
  call: { icon: PhoneIncoming, color: "text-emerald-500", label: "Call" },
  meeting: { icon: Clock, color: "text-violet-500", label: "Meeting" },
  note: { icon: FileText, color: "text-amber-500", label: "Note" },
  sms: { icon: MessageSquare, color: "text-indigo-500", label: "SMS" },
};

export default function Leads() {
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(0);
  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [expandedInteraction, setExpandedInteraction] = useState<string | null>(null);

  /* ─── Fetch all contacts with accounts ─── */
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["all-contacts-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, fax, created_at, account_id, accounts(id, name, status, address1, city, state, zip, country, website)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        account: c.accounts,
      })) as ContactRow[];
    },
  });

  /* ─── Fetch interactions for selected contact ─── */
  const { data: interactions = [], isLoading: loadingInteractions } = useQuery({
    queryKey: ["contact-interactions", selectedContact?.account_id],
    enabled: !!selectedContact?.account_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_interactions")
        .select("*")
        .eq("account_id", selectedContact!.account_id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Interaction[];
    },
  });

  /* ─── Filter + search ─── */
  const filtered = useMemo(() => {
    let list = contacts;
    if (filterTab === "active") list = list.filter(c => c.account?.status === "active");
    if (filterTab === "lead") list = list.filter(c => c.account?.status === "lead");
    if (search) {
      const term = search.toLowerCase();
      list = list.filter(c =>
        (c.first_name || "").toLowerCase().includes(term) ||
        (c.last_name || "").toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term) ||
        (c.phone || "").includes(term) ||
        (c.account?.name || "").toLowerCase().includes(term)
      );
    }
    return list;
  }, [contacts, filterTab, search]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  /* ─── Stats ─── */
  const totalActive = contacts.filter(c => c.account?.status === "active").length;
  const totalLeadStatus = contacts.filter(c => c.account?.status === "lead").length;
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.phone).length;

  const getName = (c: ContactRow) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";

  const getAddress = (a?: ContactRow["account"]) => {
    if (!a) return null;
    const parts = [a.address1, a.city, a.state, a.zip, a.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={Users}
          title="Leads & Contacts"
          description="All-time contact directory with full interaction history"
        />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
            <StatCard label="Total Contacts" value={contacts.length} icon={Users} color="muted" />
            <StatCard label="Active Accounts" value={totalActive} icon={Building2} color="primary" />
            <StatCard label="Leads" value={totalLeadStatus} icon={UserPlus} color="warning" />
            <StatCard label="With Email" value={withEmail} icon={Mail} color="teal" />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={filterTab} onValueChange={v => { setFilterTab(v as FilterTab); setPage(0); }}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3 h-6">All ({contacts.length})</TabsTrigger>
                <TabsTrigger value="active" className="text-xs px-3 h-6">Active ({totalActive})</TabsTrigger>
                <TabsTrigger value="lead" className="text-xs px-3 h-6">Leads ({totalLeadStatus})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name, email, phone, company…" className="pl-8 h-8 text-sm" />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts found"
              description="No contacts match your current search or filter."
            />
          ) : (
            <>
              <Card className="border-border/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map(contact => (
                        <TableRow
                          key={contact.id}
                          className="border-border/40 cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelectedContact(contact); setExpandedInteraction(null); }}
                        >
                          <TableCell className="font-medium text-foreground">{getName(contact)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{contact.email || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{contact.phone || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{contact.account?.name || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]",
                                contact.account?.status === "active" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                                contact.account?.status === "lead" && "border-amber-500/30 text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {contact.account?.status || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {[contact.account?.city, contact.account?.state].filter(Boolean).join(", ") || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(contact.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs px-2">{page + 1} / {totalPages}</span>
                    <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Contact Detail Sheet ─── */}
      <Sheet open={!!selectedContact} onOpenChange={open => { if (!open) setSelectedContact(null); }}>
        <SheetContent className="w-full sm:max-w-lg p-0 overflow-hidden flex flex-col">
          {selectedContact && (
            <>
              {/* Header */}
              <div className="p-4 border-b space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{getName(selectedContact)}</h2>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedContact(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedContact.account?.name && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Building2 className="h-3 w-3" />{selectedContact.account.name}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn("text-xs",
                      selectedContact.account?.status === "active" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                      selectedContact.account?.status === "lead" && "border-amber-500/30 text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {selectedContact.account?.status || "unknown"}
                  </Badge>
                </div>
              </div>

              {/* Contact details */}
              <div className="p-4 border-b space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Details</h3>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {selectedContact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a href={`mailto:${selectedContact.email}`} className="text-primary hover:underline truncate">{selectedContact.email}</a>
                    </div>
                  )}
                  {selectedContact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{selectedContact.phone}</span>
                      <ClickToCall phoneNumber={selectedContact.phone} contactName={getName(selectedContact)} size="sm" />
                    </div>
                  )}
                  {selectedContact.fax && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Fax: {selectedContact.fax}</span>
                    </div>
                  )}
                  {getAddress(selectedContact.account) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{getAddress(selectedContact.account)}</span>
                    </div>
                  )}
                  {selectedContact.account?.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a href={selectedContact.account.website.startsWith("http") ? selectedContact.account.website : `https://${selectedContact.account.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{selectedContact.account.website}</a>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Added {format(new Date(selectedContact.created_at), "PPpp")}
                </p>
              </div>

              {/* Interaction log */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-4 pb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Interaction History
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {interactions.length} records
                  </Badge>
                </div>

                <ScrollArea className="flex-1 px-4 pb-4">
                  {loadingInteractions ? (
                    <div className="space-y-2">
                      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : interactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No interactions logged</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {interactions.map(item => {
                        const cfg = TYPE_CFG[item.interaction_type] || TYPE_CFG.note;
                        const Icon = cfg.icon;
                        const isExpanded = expandedInteraction === item.id;

                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "border rounded-lg transition-colors cursor-pointer",
                              isExpanded ? "bg-muted/50" : "hover:bg-muted/30"
                            )}
                            onClick={() => setExpandedInteraction(isExpanded ? null : item.id)}
                          >
                            <div className="p-2.5 flex items-start gap-2">
                              <div className="shrink-0 rounded p-1 bg-muted/60 mt-0.5">
                                <Icon className={cn("h-3 w-3", cfg.color)} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium truncate flex-1">{item.subject}</span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                                    {cfg.label}
                                  </Badge>
                                  {item.outcome && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                                      {item.outcome}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                                  {item.created_by_email && ` · ${item.created_by_email.split("@")[0]}`}
                                </p>
                              </div>
                              {(item.notes || item.channel) && (
                                isExpanded
                                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                              )}
                            </div>

                            {isExpanded && (
                              <div className="px-2.5 pb-2.5 border-t pt-2 space-y-2">
                                {item.contact_email && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Recipient</p>
                                    <p className="text-xs">{item.contact_name ? `${item.contact_name} <${item.contact_email}>` : item.contact_email}</p>
                                  </div>
                                )}
                                {item.notes && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Content</p>
                                    <p className="text-xs whitespace-pre-wrap bg-muted/30 rounded p-2">{item.notes}</p>
                                  </div>
                                )}
                                {item.channel && (
                                  <p className="text-[10px] text-muted-foreground">Channel: {item.channel}</p>
                                )}
                                <p className="text-[10px] text-muted-foreground">
                                  {format(new Date(item.created_at), "PPpp")}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
