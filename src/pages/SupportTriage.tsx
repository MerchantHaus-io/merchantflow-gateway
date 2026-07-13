import { useState, useMemo, useEffect } from "react";
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
import { Search, Plus, Inbox, Loader2, CheckCircle2, UserCheck, Building2, Hand, Archive, Clock } from "lucide-react";
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

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, account:accounts(id, name)")
        .order("updated_at", { ascending: false })
        .returns<TicketRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

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
    const list = tickets ?? [];
    const active = list.filter((t) => !t.archived_at);
    return {
      open: active.filter((t) => t.status === "open").length,
      inProgress: active.filter((t) => t.status === "in_progress").length,
      unassigned: active.filter((t) => !t.assigned_to && t.status !== "closed").length,
      closed: active.filter((t) => t.status === "closed").length,
      archived: list.filter((t) => !!t.archived_at).length,
    };
  }, [tickets]);

  const filtered = useMemo(() => {
    let list = tickets ?? [];
    if (view === "archived") {
      list = list.filter((t) => !!t.archived_at);
    } else {
      list = list.filter((t) => !t.archived_at);
      if (view === "unassigned") list = list.filter((t) => !t.assigned_to && t.status !== "closed");
      if (view === "mine") list = list.filter((t) => t.assigned_to === user?.id);
    }

    const q = search.trim().toLowerCase();
    return list.filter((t) => {
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
  }, [tickets, view, search, filterCategory, filterStatus, filterPriority, user?.id]);

  const handleClaim = async (ticket: TicketRow) => {
    if (!user) return;
    setClaimingId(ticket.id);
    // Claiming an open ticket starts work on it — notify the client it's been allocated.
    const startsWork = ticket.status === "open";
    const claimedBy = resolveDisplayName(user.email) ?? teamMemberName ?? user.email ?? "Agent";
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({
          assigned_to: user.id,
          assigned_to_name: claimedBy,
          assigned_to_email: user.email ?? null,
          status: startsWork ? "in_progress" : ticket.status,
        })
        .eq("id", ticket.id);
      if (error) throw error;
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
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (err) {
      console.error("Failed to claim ticket:", err);
      toast.error("Could not claim the ticket.");
    } finally {
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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
        </div>

        {/* Tabs */}
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="all">All Tickets</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="mine">My Tickets</TabsTrigger>
          </TabsList>
        </Tabs>

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
        </div>

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
                {view === "mine"
                  ? "You haven't claimed any tickets yet."
                  : "New tickets from staff, the web form and the support inbox land here."}
              </p>
            </CardContent>
          </Card>
        ) : isMobile ? (
          <div className="space-y-3">
            {filtered.map((t) => {
              const cat = categoryMeta(t.category);
              const st = statusMeta(t.status);
              const pr = priorityMeta(t.priority);
              return (
                <Card
                  key={t.id}
                  onClick={() => navigate(`/support/${t.id}`)}
                  className="cursor-pointer hover:shadow-md transition-all"
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{t.ticket_number}</span>
                      <Badge variant="outline" className={cn("text-xs", st.badgeClass)}>
                        {st.label}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm text-foreground">{t.subject}</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={t.category} />
                      <Badge variant="outline" className={cn("text-xs", pr.badgeClass)}>
                        {pr.label}
                      </Badge>
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
                      onClick={() => navigate(`/support/${t.id}`)}
                    >
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
                        <Badge variant="outline" className={cn("text-xs", st.badgeClass)}>
                          {st.label}
                        </Badge>
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

      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        onCreated={(id) => navigate(`/support/${id}`)}
      />
    </AppLayout>
  );
};

export default SupportTriage;
