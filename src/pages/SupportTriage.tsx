import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveDisplayName } from "@/config/team";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Inbox, Loader2, CheckCircle2, UserCheck, Building2, Hand, Archive, ArchiveRestore, Clock, X, UserMinus, MessageSquareReply } from "lucide-react";
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
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { NewTicketDialog } from "@/components/support/NewTicketDialog";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  categoryMeta,
  priorityMeta,
  statusMeta,
} from "@/lib/support";
import type { SupportTicket } from "@/types/db";

type TicketRow = SupportTicket & {
  account: { id: string; name: string } | null;
  archived_at?: string | null;
};

const daysUntilArchive = (closedAt: string | null | undefined): number | null => {
  if (!closedAt) return null;
  const closed = new Date(closedAt).getTime();
  const archiveAt = closed + 7 * 24 * 60 * 60 * 1000;
  const days = Math.ceil((archiveAt - Date.now()) / (24 * 60 * 60 * 1000));
  return days;
};

// The Archived tab only loads the most recent archived tickets; the active
// queue is bounded by the 7-day auto-archive so it is always loaded in full.
const ARCHIVED_PAGE_SIZE = 500;
// PostgREST caps a response at 1000 rows; page through anything bigger.
const PAGE = 1000;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

type SortKey = "updated" | "priority" | "oldest" | "awaiting";

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const SupportTriage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { user, teamMemberName } = useAuth();

  const [view, setView] = useState<"all" | "unassigned" | "mine" | "archived">("all");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<
    "claim" | "archive" | "restore" | "release" | "close" | null
  >(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("updated");

  // Active (unarchived) tickets. Loaded in full, paging past the 1000-row cap,
  // so the queue and its counts are never silently truncated.
  const { data: activeTickets, isLoading: activeLoading } = useQuery({
    queryKey: ["support-tickets", "active"],
    queryFn: async () => {
      const rows: TicketRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("support_tickets")
          .select("*, account:accounts(id, name)")
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, from + PAGE - 1)
          .returns<TicketRow[]>();
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
  });

  // Archived tickets grow forever, so they are only fetched when the tab is open.
  const { data: archivedTickets, isLoading: archivedLoading } = useQuery({
    queryKey: ["support-tickets", "archived"],
    enabled: view === "archived",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, account:accounts(id, name)")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false })
        .limit(ARCHIVED_PAGE_SIZE)
        .returns<TicketRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: archivedCount = 0 } = useQuery({
    queryKey: ["support-tickets", "archived-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .not("archived_at", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Who spoke last on each active ticket's public thread. A ticket whose latest
  // public message is the customer's — or that has no agent reply at all — is
  // waiting on us.
  const activeIds = useMemo(
    () => (activeTickets ?? []).filter((t) => t.status !== "closed").map((t) => t.id),
    [activeTickets],
  );
  const { data: lastSpeaker } = useQuery({
    queryKey: ["support-tickets", "last-speaker", activeIds],
    enabled: activeIds.length > 0,
    queryFn: async () => {
      const latest = new Map<string, string>();
      // Small chunks keep the `in (...)` filter well inside URL length limits.
      for (const ids of chunk(activeIds, 50)) {
        const { data, error } = await supabase
          .from("support_ticket_comments")
          .select("ticket_id, author_type, created_at")
          .in("ticket_id", ids)
          .eq("is_internal", false)
          .neq("author_type", "system")
          .order("created_at", { ascending: false })
          .limit(PAGE);
        if (error) throw error;
        for (const c of data ?? []) {
          if (!latest.has(c.ticket_id)) latest.set(c.ticket_id, c.author_type);
        }
      }
      return latest;
    },
  });

  const isAwaitingReply = useCallback(
    (t: TicketRow) => {
      if (t.archived_at || t.status === "closed") return false;
      const who = lastSpeaker?.get(t.id);
      // No public thread yet: waiting if nobody has picked it up.
      return who === undefined ? !t.assigned_to || t.status === "open" : who === "customer";
    },
    [lastSpeaker],
  );

  const isLoading = view === "archived" ? archivedLoading : activeLoading;

  // Live updates — refresh the board whenever any ticket changes.
  useEffect(() => {
    const channel = supabase
      .channel("support-triage-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => queryClient.invalidateQueries({ queryKey: ["support-tickets"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const stats = useMemo(() => {
    const active = activeTickets ?? [];
    return {
      open: active.filter((t) => t.status === "open").length,
      inProgress: active.filter((t) => t.status === "in_progress").length,
      unassigned: active.filter((t) => !t.assigned_to && t.status !== "closed").length,
      closed: active.filter((t) => t.status === "closed").length,
      archived: archivedCount,
    };
  }, [activeTickets, archivedCount]);

  const filtered = useMemo(() => {
    let list = (view === "archived" ? archivedTickets : activeTickets) ?? [];
    if (view !== "archived") {
      if (view === "unassigned") list = list.filter((t) => !t.assigned_to && t.status !== "closed");
      if (view === "mine") list = list.filter((t) => t.assigned_to === user?.id);
    }

    const q = search.trim().toLowerCase();
    const matched = list.filter((t) => {
      const matchSearch =
        !q ||
        t.subject.toLowerCase().includes(q) ||
        t.ticket_number.toLowerCase().includes(q) ||
        t.requester_email.toLowerCase().includes(q) ||
        (t.requester_name ?? "").toLowerCase().includes(q) ||
        (t.account?.name ?? "").toLowerCase().includes(q);
      const matchCategory = filterCategory === "all" || t.category === filterCategory;
      const matchStatus = filterStatus === "all" || t.status === filterStatus;
      const matchPriority = filterPriority === "all" || t.priority === filterPriority;
      return matchSearch && matchCategory && matchStatus && matchPriority;
    });

    const age = (t: TicketRow) => new Date(t.created_at).getTime();
    const updated = (t: TicketRow) => new Date(t.updated_at).getTime();
    const rank = (t: TicketRow) => PRIORITY_RANK[t.priority] ?? 2;
    const awaiting = (t: TicketRow) => (isAwaitingReply(t) ? 0 : 1);
    const sorted = [...matched];
    if (sortBy === "priority") sorted.sort((a, b) => rank(a) - rank(b) || age(a) - age(b));
    else if (sortBy === "oldest") sorted.sort((a, b) => age(a) - age(b));
    else if (sortBy === "awaiting")
      sorted.sort((a, b) => awaiting(a) - awaiting(b) || rank(a) - rank(b) || age(a) - age(b));
    else sorted.sort((a, b) => updated(b) - updated(a));
    return sorted;
  }, [activeTickets, archivedTickets, view, search, filterCategory, filterStatus, filterPriority, sortBy, isAwaitingReply, user?.id]);

  // Drop selections that are no longer visible (tab/filter change, live update).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((t) => t.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const selected = useMemo(
    () => filtered.filter((t) => selectedIds.has(t.id)),
    [filtered, selectedIds],
  );
  const claimable = selected.filter((t) => !t.assigned_to && !t.archived_at);
  const archivable = selected.filter((t) => !t.archived_at);
  const restorable = selected.filter((t) => !!t.archived_at);
  const releasable = selected.filter((t) => !!t.assigned_to && !t.archived_at);
  const closable = selected.filter((t) => t.status !== "closed" && !t.archived_at);
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const someSelected = selected.length > 0 && !allSelected;

  const toggleSelected = (id: string, on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (on: boolean) =>
    setSelectedIds(on ? new Set(filtered.map((t) => t.id)) : new Set());

  const clearSelection = () => setSelectedIds(new Set());

  const agentName = () =>
    resolveDisplayName(user?.email) ?? teamMemberName ?? user?.email ?? "Agent";

  // Same internal system note the ticket detail page writes for each action.
  const logSystemNotes = async (ticketIds: string[], body: string) => {
    if (ticketIds.length === 0) return;
    const { error } = await supabase.from("support_ticket_comments").insert(
      ticketIds.map((ticket_id) => ({
        ticket_id,
        body,
        is_internal: true,
        author_type: "system",
        author_id: user?.id ?? null,
        author_name: agentName(),
      })),
    );
    if (error) console.error("Failed to log bulk activity:", error);
  };

  const handleBulkClaim = async () => {
    if (!user || claimable.length === 0) return;
    setBulkAction("claim");
    const claimedBy = agentName();
    const assignee = {
      assigned_to: user.id,
      assigned_to_name: claimedBy,
      assigned_to_email: user.email ?? null,
    };
    // Open tickets move to in_progress (and the client is told); others keep their status.
    const openIds = claimable.filter((t) => t.status === "open").map((t) => t.id);
    const otherIds = claimable.filter((t) => t.status !== "open").map((t) => t.id);
    try {
      const claimedIds: string[] = [];
      // `.is("assigned_to", null)` keeps us from overwriting a teammate who
      // claimed one of these in the meantime.
      if (openIds.length) {
        const { data, error } = await supabase
          .from("support_tickets")
          .update({ ...assignee, status: "in_progress" })
          .in("id", openIds)
          .is("assigned_to", null)
          .select("id");
        if (error) throw error;
        claimedIds.push(...(data ?? []).map((r) => r.id));
      }
      if (otherIds.length) {
        const { data, error } = await supabase
          .from("support_tickets")
          .update(assignee)
          .in("id", otherIds)
          .is("assigned_to", null)
          .select("id");
        if (error) throw error;
        claimedIds.push(...(data ?? []).map((r) => r.id));
      }

      await logSystemNotes(claimedIds, `${claimedBy} claimed the ticket.`);

      const claimedSet = new Set(claimedIds);
      const toNotify = claimable.filter(
        (t) => claimedSet.has(t.id) && t.status === "open" && t.requester_email,
      );
      const emailResults = await Promise.all(
        toNotify.map((t) =>
          supabase.functions.invoke("send-ticket-status-email", {
            body: { ticket_id: t.id, new_status: "in_progress", changed_by_name: claimedBy },
          }),
        ),
      );
      const emailFailures = emailResults.filter((r) => r.error);
      emailFailures.forEach((r) => console.error("Failed to send allocation email:", r.error));

      const skipped = claimable.length - claimedIds.length;
      toast.success(
        `You claimed ${claimedIds.length} ticket${claimedIds.length === 1 ? "" : "s"}` +
          (skipped > 0 ? ` · ${skipped} already taken` : ""),
      );
      if (emailFailures.length) {
        toast.error(`${emailFailures.length} client notification${emailFailures.length === 1 ? "" : "s"} failed.`);
      }
      clearSelection();
    } catch (err) {
      console.error("Failed to bulk claim tickets:", err);
      toast.error("Could not claim the selected tickets.");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setBulkAction(null);
    }
  };

  const handleBulkArchive = async (restore: boolean) => {
    const targets = restore ? restorable : archivable;
    if (targets.length === 0) return;
    setBulkAction(restore ? "restore" : "archive");
    const ids = targets.map((t) => t.id);
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ archived_at: restore ? null : new Date().toISOString() } as Partial<SupportTicket>)
        .in("id", ids);
      if (error) throw error;
      await logSystemNotes(
        ids,
        restore
          ? `${agentName()} restored the ticket from archive.`
          : `${agentName()} archived the ticket.`,
      );
      toast.success(
        `${restore ? "Restored" : "Archived"} ${ids.length} ticket${ids.length === 1 ? "" : "s"}`,
      );
      clearSelection();
    } catch (err) {
      console.error("Failed to bulk archive tickets:", err);
      toast.error(`Could not ${restore ? "restore" : "archive"} the selected tickets.`);
    } finally {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setBulkAction(null);
    }
  };

  const handleBulkRelease = async () => {
    if (releasable.length === 0) return;
    setBulkAction("release");
    const ids = releasable.map((t) => t.id);
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ assigned_to: null, assigned_to_name: null, assigned_to_email: null })
        .in("id", ids);
      if (error) throw error;
      await logSystemNotes(ids, `${agentName()} released the ticket.`);
      toast.success(`Released ${ids.length} ticket${ids.length === 1 ? "" : "s"}`);
      clearSelection();
    } catch (err) {
      console.error("Failed to bulk release tickets:", err);
      toast.error("Could not release the selected tickets.");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setBulkAction(null);
    }
  };

  // Mirrors a status change on the ticket page: the requester is emailed.
  const handleBulkClose = async () => {
    setConfirmClose(false);
    if (closable.length === 0) return;
    setBulkAction("close");
    const ids = closable.map((t) => t.id);
    const closedBy = agentName();
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed" })
        .in("id", ids);
      if (error) throw error;
      await logSystemNotes(ids, `Status changed to "${statusMeta("closed").label}" by ${closedBy}.`);
      const emailResults = await Promise.all(
        closable
          .filter((t) => t.requester_email)
          .map((t) =>
            supabase.functions.invoke("send-ticket-status-email", {
              body: { ticket_id: t.id, new_status: "closed", changed_by_name: closedBy },
            }),
          ),
      );
      const emailFailures = emailResults.filter((r) => r.error);
      emailFailures.forEach((r) => console.error("Failed to send status email:", r.error));
      toast.success(`Closed ${ids.length} ticket${ids.length === 1 ? "" : "s"}`);
      if (emailFailures.length) {
        toast.error(`${emailFailures.length} client notification${emailFailures.length === 1 ? "" : "s"} failed.`);
      }
      clearSelection();
    } catch (err) {
      console.error("Failed to bulk close tickets:", err);
      toast.error("Could not close the selected tickets.");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setBulkAction(null);
    }
  };

  const handleClaim = async (ticket: TicketRow) => {
    if (!user) return;
    setClaimingId(ticket.id);
    // Claiming an open ticket starts work on it — notify the client it's been allocated.
    const startsWork = ticket.status === "open";
    const claimedBy = resolveDisplayName(user.email) ?? teamMemberName ?? user.email ?? "Agent";
    try {
      // `.is("assigned_to", null)` so a teammate's claim a moment earlier wins.
      const { data, error } = await supabase
        .from("support_tickets")
        .update({
          assigned_to: user.id,
          assigned_to_name: claimedBy,
          assigned_to_email: user.email ?? null,
          status: startsWork ? "in_progress" : ticket.status,
        })
        .eq("id", ticket.id)
        .is("assigned_to", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error(`A teammate claimed ${ticket.ticket_number} first.`);
        return;
      }
      await logSystemNotes([ticket.id], `${claimedBy} claimed the ticket.`);
      toast.success(`You claimed ${ticket.ticket_number}`);
      if (startsWork && ticket.requester_email) {
        const { error: emailErr } = await supabase.functions.invoke("send-ticket-status-email", {
          body: {
            ticket_id: ticket.id,
            new_status: "in_progress",
            changed_by_name: claimedBy,
          },
        });
        if (emailErr) {
          console.error("Failed to send allocation email:", emailErr);
          toast.error("Ticket claimed, but the client notification failed.");
        }
      }
    } catch (err) {
      console.error("Failed to claim ticket:", err);
      toast.error("Could not claim the ticket.");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setClaimingId(null);
    }
  };

  const StatCard = ({
    icon,
    value,
    label,
    tone,
  }: {
    icon: React.ReactNode;
    value: number;
    label: string;
    tone: string;
  }) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", tone)}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  const CategoryBadge = ({ category }: { category: string }) => {
    const meta = categoryMeta(category);
    const Icon = meta.icon;
    return (
      <Badge variant="outline" className={cn("text-xs gap-1 w-fit", meta.badgeClass)}>
        <Icon className="h-3 w-3" />
        {meta.shortLabel}
      </Badge>
    );
  };

  return (
    <AppLayout
      pageTitle="Support Triage"
      headerActions={
        <Button size="sm" onClick={() => setNewTicketOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Ticket
        </Button>
      }
    >
      <div className="p-4 lg:p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          <StatCard
            icon={<Inbox className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
            value={stats.open}
            label="Open"
            tone="bg-emerald-500/10"
          />
          <StatCard
            icon={<Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            value={stats.inProgress}
            label="In Progress"
            tone="bg-amber-500/10"
          />
          <StatCard
            icon={<Hand className="h-5 w-5 text-sky-600 dark:text-sky-400" />}
            value={stats.unassigned}
            label="Unassigned"
            tone="bg-sky-500/10"
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" />}
            value={stats.closed}
            label="Closed"
            tone="bg-muted"
          />
          <StatCard
            icon={<Archive className="h-5 w-5 text-muted-foreground" />}
            value={stats.archived}
            label="Archived"
            tone="bg-muted"
          />
        </div>

        {/* Tabs */}
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="all">Active</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="mine">My Tickets</TabsTrigger>
            <TabsTrigger value="archived">
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archived
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <p className="text-[11px] text-muted-foreground -mt-3">
          Closed tickets are automatically archived 7 days after they're closed.
        </p>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ticket #, subject, requester or account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Sort tickets">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="awaiting">Awaiting reply first</SelectItem>
              <SelectItem value="priority">Priority, then oldest</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {view === "archived" && archivedCount > ARCHIVED_PAGE_SIZE && (
          <p className="text-[11px] text-muted-foreground -mt-3">
            Showing the {ARCHIVED_PAGE_SIZE} most recently archived of {archivedCount}.
          </p>
        )}

        {/* Bulk actions */}
        {selected.length > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
            <span className="text-sm font-medium mr-auto">
              {selected.length} selected
            </span>
            {view === "archived" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkAction !== null || restorable.length === 0}
                onClick={() => handleBulkArchive(true)}
              >
                {bulkAction === "restore" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                )}
                Restore ({restorable.length})
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkAction !== null || claimable.length === 0}
                  onClick={handleBulkClaim}
                  title={claimable.length === 0 ? "None of the selected tickets are unassigned" : undefined}
                >
                  {bulkAction === "claim" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Hand className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Claim ({claimable.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkAction !== null || archivable.length === 0}
                  onClick={() => handleBulkArchive(false)}
                >
                  {bulkAction === "archive" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Archive className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Archive ({archivable.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkAction !== null || releasable.length === 0}
                  onClick={handleBulkRelease}
                >
                  {bulkAction === "release" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <UserMinus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Release ({releasable.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkAction !== null || closable.length === 0}
                  onClick={() => setConfirmClose(true)}
                >
                  {bulkAction === "close" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Close ({closable.length})
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkAction !== null}
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Ticket list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-1">
              <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No tickets here</p>
              <p className="text-xs text-muted-foreground/70">
                {view === "archived"
                  ? "Closed tickets are archived here 7 days after closing."
                  : view === "mine"
                    ? "You haven't claimed any tickets yet."
                    : "New tickets from staff, the web form and the support inbox land here."}
              </p>
            </CardContent>
          </Card>
        ) : isMobile ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) => toggleAll(v === true)}
              />
              Select all ({filtered.length})
            </label>
            {filtered.map((t) => {
              const cat = categoryMeta(t.category);
              const st = statusMeta(t.status);
              const pr = priorityMeta(t.priority);
              return (
                <Card
                  key={t.id}
                  onClick={() => navigate(`/support/${t.id}`)}
                  className={cn(
                    "cursor-pointer hover:shadow-md transition-all",
                    selectedIds.has(t.id) && "ring-2 ring-primary/40",
                  )}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedIds.has(t.id)}
                          onCheckedChange={(v) => toggleSelected(t.id, v === true)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${t.ticket_number}`}
                        />
                        <span className="text-xs font-mono text-muted-foreground">{t.ticket_number}</span>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", st.badgeClass)}>
                        {t.archived_at ? "Archived" : st.label}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm text-foreground">{t.subject}</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={t.category} />
                      <Badge variant="outline" className={cn("text-xs", pr.badgeClass)}>
                        {pr.label}
                      </Badge>
                      {isAwaitingReply(t) && (
                        <Badge variant="outline" className="text-xs gap-1 border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10">
                          <MessageSquareReply className="h-3 w-3" />
                          Awaiting reply
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.requester_name || t.requester_email}
                      {t.account?.name && ` · ${t.account.name}`}
                    </p>
                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                      </span>
                      {t.assigned_to ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCheck className="h-3 w-3" />
                          {t.assigned_to_name || "Assigned"}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={claimingId === t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClaim(t);
                          }}
                        >
                          {claimingId === t.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Hand className="h-3 w-3 mr-1" />
                              Claim
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label="Select all tickets"
                    />
                  </TableHead>
                  <TableHead className="w-[90px]">Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const st = statusMeta(t.status);
                  const pr = priorityMeta(t.priority);
                  return (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer"
                      data-state={selectedIds.has(t.id) ? "selected" : undefined}
                      onClick={() => navigate(`/support/${t.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(t.id)}
                          onCheckedChange={(v) => toggleSelected(t.id, v === true)}
                          aria-label={`Select ${t.ticket_number}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.ticket_number}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-sm leading-tight">{t.subject}</p>
                          <CategoryBadge category={t.category} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{t.requester_name || "—"}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {t.account?.name ? (
                            <>
                              <Building2 className="h-3 w-3" />
                              {t.account.name}
                            </>
                          ) : (
                            t.requester_email
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", pr.badgeClass)}>
                          {pr.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant="outline" className={cn("text-xs", st.badgeClass)}>
                            {t.archived_at ? "Archived" : st.label}
                          </Badge>
                          {isAwaitingReply(t) && (
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 flex items-center gap-0.5">
                              <MessageSquareReply className="h-2.5 w-2.5" />
                              awaiting reply
                            </span>
                          )}
                          {!t.archived_at && t.status === "closed" && (() => {
                            const d = daysUntilArchive(t.closed_at);
                            if (d === null) return null;
                            return (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {d <= 0 ? "archiving soon" : `archives in ${d}d`}
                              </span>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {t.assigned_to ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[9px] bg-muted">
                                {getInitials(t.assigned_to_name || "A")}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{t.assigned_to_name || "Assigned"}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {!t.assigned_to && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={claimingId === t.id}
                            onClick={() => handleClaim(t)}
                          >
                            {claimingId === t.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Hand className="h-3.5 w-3.5 mr-1" />
                                Claim
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close {closable.length} ticket{closable.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each requester is emailed that their ticket was closed. Closed tickets archive
              automatically after 7 days; a customer reply reopens them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkClose}>Close tickets</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        onCreated={(id) => navigate(`/support/${id}`)}
      />
    </AppLayout>
  );
};

export default SupportTriage;
