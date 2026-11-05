import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveDisplayName } from "@/config/team";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Building2,
  Hand,
  UserMinus,
  Loader2,
  Send,
  Lock,
  CalendarDays,
  Phone,
  Archive,
  ArchiveRestore,
  Clock,
  ChevronsDownUp,
  ChevronsUpDown,
  ShieldBan,
  Undo2,
  Ban,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  categoryMeta,
  priorityMeta,
  statusMeta,
  SPAM_STATUS,
  emailDomain,
  spamReasonLabel,
} from "@/lib/support";
import { BlockDomainConfirm } from "@/components/support/BlockedDomainsDialog";
import { ThreadMessageCard, type ThreadMessage } from "@/components/support/ThreadMessageCard";
import type { SupportTicket, SupportTicketComment } from "@/types/db";

type TicketWithRelations = SupportTicket & {
  account: { id: string; name: string } | null;
  contact: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
} & { archived_at?: string | null };

const daysUntilArchive = (closedAt: string | null | undefined): number | null => {
  if (!closedAt) return null;
  const days = Math.ceil(
    (new Date(closedAt).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000),
  );
  return days;
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Created by staff",
  web_form: "Web form",
  email: "Support inbox",
};

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/gi;

/** Render plain text with clickable links; long link labels are truncated. */
const renderLinkedText = (text: string): React.ReactNode => {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const label = part.length > 60 ? part.slice(0, 57) + "…" : part;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80"
        >
          {label}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

const SupportTicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, teamMemberName } = useAuth();

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  const authorName = resolveDisplayName(user?.email) ?? teamMemberName ?? user?.email ?? "Agent";

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["support-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, account:accounts(id, name), contact:contacts(id, first_name, last_name, email, phone)")
        .eq("id", id!)
        .returns<TicketWithRelations[]>()
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: comments } = useQuery({
    queryKey: ["support-ticket-comments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_comments")
        .select("*")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportTicketComment[];
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`support-ticket-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_comments", filter: `ticket_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["support-ticket-comments", id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["support-ticket", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const logSystem = async (body: string) => {
    if (!id) return;
    await supabase.from("support_ticket_comments").insert({
      ticket_id: id,
      body,
      is_internal: true,
      author_type: "system",
      author_id: user?.id ?? null,
      author_name: authorName,
    });
  };

  const updateTicket = async (patch: Partial<SupportTicket>, field: string, systemNote?: string) => {
    if (!id) return;
    setSavingField(field);
    try {
      const { error } = await supabase.from("support_tickets").update(patch).eq("id", id);
      if (error) throw error;
      if (systemNote) await logSystem(systemNote);
      queryClient.invalidateQueries({ queryKey: ["support-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (err) {
      console.error("Failed to update ticket:", err);
      toast.error("Could not save the change.");
    } finally {
      setSavingField(null);
    }
  };

  const claim = async () => {
    if (!ticket) return;
    // Claiming an open ticket moves it into "in_progress" — the moment the
    // client should be told their request has been allocated to an agent.
    const startsWork = ticket.status === "open";
    setSavingField("assignee");
    let claimed = false;
    try {
      // `.is("assigned_to", null)` so a teammate who claimed it a moment ago
      // isn't silently overwritten.
      const { data, error } = await supabase
        .from("support_tickets")
        .update({
          assigned_to: user?.id ?? null,
          assigned_to_name: authorName,
          assigned_to_email: user?.email ?? null,
          status: startsWork ? "in_progress" : ticket.status,
        })
        .eq("id", ticket.id)
        .is("assigned_to", null)
        .select("id");
      if (error) throw error;
      claimed = (data ?? []).length > 0;
      if (claimed) await logSystem(`${authorName} claimed the ticket.`);
      else toast.error("A teammate claimed this ticket first.");
    } catch (err) {
      console.error("Failed to claim ticket:", err);
      toast.error("Could not save the change.");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["support-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setSavingField(null);
    }
    if (claimed && startsWork && ticket.requester_email) {
      try {
        const { error } = await supabase.functions.invoke("send-ticket-status-email", {
          body: {
            ticket_id: ticket.id,
            new_status: "in_progress",
            changed_by_name: authorName,
          },
        });
        if (error) throw error;
        toast.success(`Allocation email sent to ${ticket.requester_email}`);
      } catch (err) {
        console.error("Failed to send allocation email:", err);
        toast.error("Ticket claimed, but the client notification failed.");
      }
    }
  };

  const release = () =>
    updateTicket(
      { assigned_to: null, assigned_to_name: null, assigned_to_email: null },
      "assignee",
      `${authorName} released the ticket.`,
    );

  const archiveNow = () =>
    updateTicket(
      { archived_at: new Date().toISOString() } as Partial<SupportTicket>,
      "archive",
      `${authorName} archived the ticket.`,
    );

  const unarchive = () =>
    updateTicket(
      { archived_at: null } as Partial<SupportTicket>,
      "archive",
      `${authorName} restored the ticket from archive.`,
    );

  // Spam is a quiet move: no status email, which would confirm the address to
  // the sender. The DB stamps who/when and the reason ('manual').
  const markSpam = () =>
    updateTicket({ status: "spam" }, "spam", `${authorName} marked the ticket as spam.`);

  const restoreFromSpam = () =>
    updateTicket({ status: "open" }, "spam", `${authorName} restored the ticket from spam.`);

  const handleStatusChange = async (newStatus: string) => {
    if (!ticket) return;
    const prevStatus = ticket.status;
    await updateTicket(
      { status: newStatus },
      "status",
      `Status changed to "${statusMeta(newStatus).label}" by ${authorName}.`,
    );
    // Only email on actual lifecycle transitions and when we have a requester email.
    if (prevStatus !== newStatus && ticket.requester_email) {
      try {
        const { error } = await supabase.functions.invoke("send-ticket-status-email", {
          body: {
            ticket_id: ticket.id,
            new_status: newStatus,
            changed_by_name: authorName,
          },
        });
        if (error) throw error;
        toast.success(`Status email sent to ${ticket.requester_email}`);
      } catch (err) {
        console.error("Failed to send status email:", err);
        toast.error("Status updated, but the email notification failed.");
      }
    }
  };


  // A spam ticket takes internal notes only: a public reply would email the sender.
  const internalOnly = ticket?.status === "spam";

  const sendReply = async () => {
    if (!id || !reply.trim()) return;
    const message = reply.trim();
    const wasInternal = isInternal || internalOnly;
    setSending(true);
    try {
      const { error } = await supabase.from("support_ticket_comments").insert({
        ticket_id: id,
        body: message,
        is_internal: wasInternal,
        author_type: "agent",
        author_id: user?.id ?? null,
        author_name: authorName,
      });
      if (error) throw error;
      setReply("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["support-ticket-comments", id] });

      // A public reply is emailed to the requester; an internal note is not.
      if (!wasInternal && ticket?.requester_email) {
        const { error: emailErr } = await supabase.functions.invoke("send-ticket-reply", {
          body: { ticket_id: id, body: message, agent_name: authorName },
        });
        if (emailErr) {
          console.error("Failed to email reply:", emailErr);
          toast.warning("Reply saved, but the email to the customer failed to send.");
        } else {
          toast.success(`Reply emailed to ${ticket.requester_email}`);
        }
      } else {
        toast.success("Internal note added");
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      toast.error("Could not post your message.");
    } finally {
      setSending(false);
    }
  };

  // ── Thread: the opening message plus every comment, oldest first ──
  type TimelineItem =
    | { kind: "message"; message: ThreadMessage }
    | { kind: "system"; id: string; body: string; at: string };

  const timeline = React.useMemo<TimelineItem[]>(() => {
    if (!ticket) return [];
    const opening: TimelineItem = {
      kind: "message",
      message: {
        id: "opening",
        authorName: ticket.requester_name || ticket.requester_email,
        badge: "requester",
        tone: "customer",
        at: ticket.created_at,
        absoluteTime: true,
        body: ticket.description ?? "",
        linkify: true,
        emptyText: "No description provided.",
      },
    };
    const rest: TimelineItem[] = (comments ?? []).map((c) =>
      c.author_type === "system"
        ? { kind: "system", id: c.id, body: c.body, at: c.created_at }
        : {
            kind: "message",
            message: {
              id: c.id,
              authorName: c.author_name || "Unknown",
              badge: c.is_internal ? "internal" : c.author_type === "customer" ? "requester" : null,
              tone: c.is_internal ? "internal" : c.author_type === "customer" ? "customer" : "agent",
              at: c.created_at,
              absoluteTime: false,
              body: c.body,
              linkify: false,
            },
          },
    );
    return [opening, ...rest];
  }, [ticket, comments]);

  const thread = React.useMemo(
    () =>
      timeline.flatMap((i) => (i.kind === "message" ? [i.message] : [])),
    [timeline],
  );

  // Older messages start collapsed so the reply box stays in reach; the two
  // most recent stay open. Short threads (3 or fewer) start fully open. A
  // user's own toggle wins, and new messages arriving pick up the default.
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});
  const defaultOpen = React.useMemo(() => {
    const ids = thread.map((m) => m.id);
    return new Set(ids.length <= 3 ? ids : ids.slice(-2));
  }, [thread]);
  const isExpanded = (msgId: string) => expandOverrides[msgId] ?? defaultOpen.has(msgId);
  const toggleExpanded = (msgId: string) =>
    setExpandOverrides((prev) => ({ ...prev, [msgId]: !isExpanded(msgId) }));
  const allExpanded = thread.length > 0 && thread.every((m) => isExpanded(m.id));
  const setAllExpanded = (open: boolean) =>
    setExpandOverrides(Object.fromEntries(thread.map((m) => [m.id, open])));

  if (isLoading) {
    return (
      <AppLayout pageTitle="Ticket">
        <div className="p-4 lg:p-6 space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </AppLayout>
    );
  }

  if (!ticket) {
    return (
      <AppLayout pageTitle="Ticket">
        <div className="p-12 text-center space-y-3">
          <p className="text-muted-foreground">Ticket not found.</p>
          <Button variant="outline" onClick={() => navigate("/support")}>
            Back to Support Triage
          </Button>
        </div>
      </AppLayout>
    );
  }

  const cat = categoryMeta(ticket.category);
  const CatIcon = cat.icon;

  return (
    <AppLayout pageTitle={ticket.ticket_number}>
      <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <Card>
          <CardContent className="p-4 lg:p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("text-xs gap-1", cat.badgeClass)}>
                <CatIcon className="h-3 w-3" />
                {cat.label}
              </Badge>
              <Badge variant="outline" className={cn("text-xs", statusMeta(ticket.status).badgeClass)}>
                {statusMeta(ticket.status).label}
              </Badge>
              <Badge variant="outline" className={cn("text-xs", priorityMeta(ticket.priority).badgeClass)}>
                {priorityMeta(ticket.priority).label} priority
              </Badge>
              {ticket.archived_at && (
                <Badge variant="outline" className="text-xs gap-1 border-slate-400/40 text-slate-500 dark:text-slate-400 bg-slate-400/10">
                  <Archive className="h-3 w-3" />
                  Archived {format(new Date(ticket.archived_at), "MMM d, yyyy")}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {SOURCE_LABELS[ticket.source] ?? ticket.source}
              </span>
            </div>
            {ticket.status === "spam" && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldBan className="h-3.5 w-3.5" />
                {spamReasonLabel(ticket.spam_reason)}
                {ticket.spam_marked_by_email && ` by ${ticket.spam_marked_by_email}`}
                {ticket.spam_marked_at &&
                  ` · ${formatDistanceToNow(new Date(ticket.spam_marked_at), { addSuffix: true })}`}
                . Out of the queue and kept here; never auto-archived.
              </div>
            )}
            {!ticket.archived_at && ticket.status === "closed" && (() => {
              const d = daysUntilArchive(ticket.closed_at);
              if (d === null) return null;
              return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {d <= 0 ? "This ticket will be archived shortly." : `Auto-archives in ${d} day${d === 1 ? "" : "s"}.`}
                </div>
              );
            })()}
            <h1 className="text-lg lg:text-xl font-semibold text-foreground">{ticket.subject}</h1>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Conversation */}
          <div className="lg:col-span-2 space-y-4 min-w-0">
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">
                  Conversation
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {thread.length} message{thread.length === 1 ? "" : "s"}
                  </span>
                </CardTitle>
                {thread.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setAllExpanded(!allExpanded)}
                  >
                    {allExpanded ? (
                      <ChevronsDownUp className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
                    )}
                    {allExpanded ? "Collapse all" : "Expand all"}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {timeline.map((item) =>
                  item.kind === "system" ? (
                    <div key={item.id} className="flex items-center gap-2 py-1 px-1">
                      <Separator className="flex-1" />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {item.body} · {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                      </span>
                      <Separator className="flex-1" />
                    </div>
                  ) : (
                    <ThreadMessageCard
                      key={item.message.id}
                      message={item.message}
                      expanded={isExpanded(item.message.id)}
                      onToggle={() => toggleExpanded(item.message.id)}
                      render={renderLinkedText}
                    />
                  ),
                )}
              </CardContent>
            </Card>

            {/* Reply box — pinned to the bottom of the view on desktop so a long
                thread can't push it out of reach. Not on mobile, where the
                bottom tab bar would cover it; collapsing handles that case. */}
            <Card className="lg:sticky lg:bottom-0 lg:z-10 lg:shadow-[0_-8px_16px_-12px_hsl(var(--foreground)/0.25)]">
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    isInternal || internalOnly
                      ? "Add an internal note (not visible to the client)..."
                      : "Write a reply..."
                  }
                  rows={4}
                />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="internal-toggle"
                      checked={isInternal || internalOnly}
                      onCheckedChange={setIsInternal}
                      disabled={internalOnly}
                    />
                    <Label htmlFor="internal-toggle" className="text-sm cursor-pointer">
                      Internal note
                    </Label>
                    {internalOnly && (
                      <span className="text-[11px] text-muted-foreground">
                        Public replies are off while the ticket is spam.
                      </span>
                    )}
                  </div>
                  <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    {isInternal || internalOnly ? "Add Note" : "Send Reply"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Properties */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Properties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) =>
                      handleStatusChange(v)
                    }
                    disabled={savingField === "status" || ticket.status === "spam"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                      {ticket.status === "spam" && (
                        <SelectItem value={SPAM_STATUS.value}>{SPAM_STATUS.label}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => updateTicket({ priority: v }, "priority")}
                    disabled={savingField === "priority"}
                  >
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

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select
                    value={ticket.category}
                    onValueChange={(v) => updateTicket({ category: v }, "category")}
                    disabled={savingField === "category"}
                  >
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

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Assignee</Label>
                  {ticket.assigned_to ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-muted">
                            {initials(ticket.assigned_to_name || "A")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{ticket.assigned_to_name || "Assigned"}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={release}
                        disabled={savingField === "assignee"}
                      >
                        <UserMinus className="h-3.5 w-3.5 mr-1" />
                        Release
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={claim}
                      disabled={savingField === "assignee"}
                    >
                      {savingField === "assignee" ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Hand className="h-4 w-4 mr-1.5" />
                      )}
                      Claim this ticket
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Archive</Label>
                  {ticket.archived_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={unarchive}
                      disabled={savingField === "archive"}
                    >
                      {savingField === "archive" ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <ArchiveRestore className="h-4 w-4 mr-1.5" />
                      )}
                      Restore from archive
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-muted-foreground"
                      onClick={archiveNow}
                      disabled={savingField === "archive"}
                    >
                      {savingField === "archive" ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4 mr-1.5" />
                      )}
                      Archive now
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground/80">
                    Closed tickets archive automatically after 7 days.
                  </p>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Spam</Label>
                  {ticket.status === "spam" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={restoreFromSpam}
                      disabled={savingField === "spam"}
                    >
                      {savingField === "spam" ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4 mr-1.5" />
                      )}
                      Restore from spam
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-muted-foreground"
                      onClick={markSpam}
                      disabled={savingField === "spam"}
                    >
                      {savingField === "spam" ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <ShieldBan className="h-4 w-4 mr-1.5" />
                      )}
                      Mark as spam
                    </Button>
                  )}
                  {emailDomain(ticket.requester_email) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => setBlockOpen(true)}
                    >
                      <Ban className="h-4 w-4 mr-1.5" />
                      <span className="truncate">Block {emailDomain(ticket.requester_email)}</span>
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground/80">
                    No email is sent either way. Restoring moves the ticket back to Open.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Requester</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {ticket.requester_name && <p className="font-medium">{ticket.requester_name}</p>}
                <a
                  href={`mailto:${ticket.requester_email}`}
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{ticket.requester_email}</span>
                </a>
                {ticket.contact?.phone && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    {ticket.contact.phone}
                  </p>
                )}
                {ticket.account && (
                  <button
                    type="button"
                    onClick={() => navigate(`/live-billing/${ticket.account!.id}`)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary"
                  >
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{ticket.account.name}</span>
                  </button>
                )}
                <Separator />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  Opened {format(new Date(ticket.created_at), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <BlockDomainConfirm
        domain={emailDomain(ticket.requester_email) ?? ""}
        open={blockOpen}
        onOpenChange={setBlockOpen}
      />
    </AppLayout>
  );
};

export default SupportTicketDetail;
