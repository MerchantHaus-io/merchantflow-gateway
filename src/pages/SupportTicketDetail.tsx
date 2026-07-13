import { useState, useEffect } from "react";
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
} from "@/lib/support";
import type { SupportTicket, SupportTicketComment } from "@/types/db";

type TicketWithRelations = SupportTicket & {
  account: { id: string; name: string } | null;
  contact: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Created by staff",
  web_form: "Web form",
  email: "Support inbox",
};

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

const SupportTicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, teamMemberName } = useAuth();

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

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
    await updateTicket(
      {
        assigned_to: user?.id ?? null,
        assigned_to_name: authorName,
        assigned_to_email: user?.email ?? null,
        status: startsWork ? "in_progress" : ticket.status,
      },
      "assignee",
      `${authorName} claimed the ticket.`,
    );
    if (startsWork && ticket.requester_email) {
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


  const sendReply = async () => {
    if (!id || !reply.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_ticket_comments").insert({
        ticket_id: id,
        body: reply.trim(),
        is_internal: isInternal,
        author_type: "agent",
        author_id: user?.id ?? null,
        author_name: authorName,
      });
      if (error) throw error;
      setReply("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["support-ticket-comments", id] });
      toast.success(isInternal ? "Internal note added" : "Reply added");
    } catch (err) {
      console.error("Failed to add comment:", err);
      toast.error("Could not post your message.");
    } finally {
      setSending(false);
    }
  };

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
  const requesterDisplay = ticket.requester_name || ticket.requester_email;

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
              <span className="text-xs text-muted-foreground ml-auto">
                {SOURCE_LABELS[ticket.source] ?? ticket.source}
              </span>
            </div>
            <h1 className="text-lg lg:text-xl font-semibold text-foreground">{ticket.subject}</h1>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Conversation */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Conversation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Opening message */}
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                        {initials(requesterDisplay)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{requesterDisplay}</span>
                    <Badge variant="outline" className="text-[10px]">
                      Requester
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(ticket.created_at), "MMM d, yyyy · h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {ticket.description || <span className="text-muted-foreground italic">No description provided.</span>}
                  </p>
                </div>

                {(comments ?? []).map((c) => {
                  const isCustomer = c.author_type === "customer";
                  const isSystem = c.author_type === "system";
                  if (isSystem) {
                    return (
                      <div key={c.id} className="flex items-center gap-2 py-1 px-1">
                        <Separator className="flex-1" />
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {c.body} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                        <Separator className="flex-1" />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-lg border p-3",
                        c.is_internal
                          ? "border-amber-500/40 bg-amber-500/5"
                          : isCustomer
                            ? "border-border bg-muted/40"
                            : "border-primary/30 bg-primary/5",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[9px] bg-muted">
                            {initials(c.author_name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{c.author_name || "Unknown"}</span>
                        {c.is_internal && (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5 border-amber-500/40 text-amber-600 dark:text-amber-400"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            Internal
                          </Badge>
                        )}
                        {isCustomer && (
                          <Badge variant="outline" className="text-[10px]">
                            Requester
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Reply box */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={isInternal ? "Add an internal note (not visible to the client)..." : "Write a reply..."}
                  rows={4}
                />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch id="internal-toggle" checked={isInternal} onCheckedChange={setIsInternal} />
                    <Label htmlFor="internal-toggle" className="text-sm cursor-pointer">
                      Internal note
                    </Label>
                  </div>
                  <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    {isInternal ? "Add Note" : "Send Reply"}
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
                    disabled={savingField === "status"}
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
    </AppLayout>
  );
};

export default SupportTicketDetail;
