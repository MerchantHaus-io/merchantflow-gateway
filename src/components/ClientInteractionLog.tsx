import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Phone,
  Mail,
  Video,
  FileText,
  Plus,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  CalendarClock,
  AlertCircle,
  CheckCircle2,
  Circle,
  Pause,
  Tag,
  User,
  Hash,
  Filter,
  Download,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/* ── constants ───────────────────────────────────────────── */

const INTERACTION_TYPES = [
  { value: "call", label: "Phone Call", icon: Phone, color: "text-blue-500" },
  { value: "email", label: "Email", icon: Mail, color: "text-amber-500" },
  { value: "meeting", label: "Meeting", icon: Video, color: "text-purple-500" },
  { value: "note", label: "Internal Note", icon: FileText, color: "text-muted-foreground" },
  { value: "sms", label: "SMS / Text", icon: MessageSquare, color: "text-green-500" },
] as const;

const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-muted text-muted-foreground border-border" },
  { value: "medium", label: "Medium", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  { value: "high", label: "High", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "urgent", label: "Urgent", color: "bg-destructive/10 text-destructive border-destructive/30" },
] as const;

const STATUSES = [
  { value: "open", label: "Open", icon: Circle, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  { value: "pending", label: "Pending", icon: Pause, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "resolved", label: "Resolved", icon: CheckCircle2, color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30" },
  { value: "closed", label: "Closed", icon: AlertCircle, color: "bg-muted text-muted-foreground border-border" },
] as const;

const OUTCOMES = [
  "Successful",
  "Follow-up Required",
  "No Answer",
  "Left Voicemail",
  "Escalated",
  "Information Provided",
  "Issue Resolved",
  "Callback Requested",
] as const;

const TAG_PRESETS = [
  "billing", "technical", "onboarding", "compliance", "support",
  "escalation", "feedback", "training", "documentation", "urgent",
];

const getTypeConfig = (type: string) =>
  INTERACTION_TYPES.find((t) => t.value === type) || INTERACTION_TYPES[3];
const getPriorityConfig = (p: string) =>
  PRIORITIES.find((pr) => pr.value === p) || PRIORITIES[1];
const getStatusConfig = (s: string) =>
  STATUSES.find((st) => st.value === s) || STATUSES[0];

interface InteractionRow {
  id: string;
  account_id: string;
  interaction_type: string;
  subject: string;
  notes: string | null;
  status: string;
  priority: string;
  channel: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  duration_minutes: number | null;
  follow_up_at: string | null;
  outcome: string | null;
  resolution: string | null;
  tags: string[];
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  accountId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

const ClientInteractionLog = ({ accountId, contactName, contactEmail, contactPhone }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const emptyForm = {
    type: "call",
    subject: "",
    notes: "",
    priority: "medium",
    channel: "",
    contact_name: contactName || "",
    contact_email: contactEmail || "",
    contact_phone: contactPhone || "",
    duration_minutes: "",
    follow_up_at: "",
    outcome: "",
    resolution: "",
    tags: [] as string[],
  };
  const [form, setForm] = useState(emptyForm);
  const [tagInput, setTagInput] = useState("");

  /* ── queries ─────────────────────────────────────────── */

  const { data: interactions, isLoading } = useQuery({
    queryKey: ["client-interactions", accountId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_interactions")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as InteractionRow[];
    },
    enabled: !!accountId,
  });

  const { data: profileMap } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("email, full_name, avatar_url");
      const map: Record<string, { name: string; avatar: string | null }> = {};
      data?.forEach((p) => {
        if (p.email) map[p.email] = { name: p.full_name || p.email, avatar: p.avatar_url };
      });
      return map;
    },
  });

  /* ── mutations ───────────────────────────────────────── */

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("client_interactions").insert({
        account_id: accountId,
        interaction_type: form.type,
        subject: form.subject.trim(),
        notes: form.notes.trim() || null,
        priority: form.priority,
        channel: form.channel.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        follow_up_at: form.follow_up_at || null,
        outcome: form.outcome || null,
        resolution: form.resolution.trim() || null,
        tags: form.tags,
        created_by: user?.id,
        created_by_email: user?.email,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-interactions", accountId] });
      setForm(emptyForm);
      setIsAdding(false);
      toast.success("Interaction logged");
    },
    onError: () => toast.error("Failed to log interaction"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("client_interactions")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-interactions", accountId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_interactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-interactions", accountId] });
      toast.success("Interaction removed");
    },
  });

  /* ── helpers ─────────────────────────────────────────── */

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

  const filtered = interactions?.filter((i) => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterType !== "all" && i.interaction_type !== filterType) return false;
    return true;
  });

  const counts = {
    open: interactions?.filter((i) => i.status === "open").length || 0,
    pending: interactions?.filter((i) => i.status === "pending").length || 0,
    resolved: interactions?.filter((i) => i.status === "resolved").length || 0,
  };

  const exportCsv = () => {
    if (!filtered || filtered.length === 0) return;
    const esc = (v: string | null | undefined) => {
      if (!v) return "";
      const s = v.replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };
    const headers = [
      "Date", "Type", "Status", "Priority", "Subject", "Contact Name",
      "Contact Email", "Contact Phone", "Duration (min)", "Outcome",
      "Channel/Ref", "Follow-up Date", "Notes", "Resolution", "Tags",
      "Created By", "Last Updated",
    ];
    const rows = filtered.map((i) => [
      format(new Date(i.created_at), "yyyy-MM-dd HH:mm"),
      getTypeConfig(i.interaction_type).label,
      i.status,
      i.priority,
      esc(i.subject),
      esc(i.contact_name),
      esc(i.contact_email),
      esc(i.contact_phone),
      i.duration_minutes ?? "",
      esc(i.outcome),
      esc(i.channel),
      i.follow_up_at ? format(new Date(i.follow_up_at), "yyyy-MM-dd HH:mm") : "",
      esc(i.notes),
      esc(i.resolution),
      esc(i.tags.join("; ")),
      esc(i.created_by_email),
      format(new Date(i.updated_at), "yyyy-MM-dd HH:mm"),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interaction-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  /* ── render ──────────────────────────────────────────── */

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Client Interaction Log
          {interactions && interactions.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">{interactions.length}</Badge>
          )}
          {/* Mini status counters */}
          {counts.open > 0 && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
              {counts.open} open
            </Badge>
          )}
          {counts.pending > 0 && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              {counts.pending} pending
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {interactions && interactions.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" />CSV
              </Button>
            )}
            {!isAdding && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsAdding(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Log Interaction
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* ── ADD FORM ─────────────────────────────── */}
          {isAdding && (
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Interaction</p>

              {/* Row 1: Type, Priority, Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_130px_1fr] gap-2">
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        <span className="flex items-center gap-1.5"><t.icon className={cn("h-3.5 w-3.5", t.color)} />{t.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Subject / summary *" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="h-8 text-sm" />
              </div>

              {/* Row 2: Contact details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="relative">
                  <User className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Contact name" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} className="h-8 text-xs pl-8" />
                </div>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Contact email" type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} className="h-8 text-xs pl-8" />
                </div>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Contact phone" value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} className="h-8 text-xs pl-8" />
                </div>
              </div>

              {/* Row 3: Duration, Follow-up, Outcome, Channel */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="relative">
                  <Clock className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Duration (min)" type="number" min="0" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} className="h-8 text-xs pl-8" />
                </div>
                <div className="relative">
                  <CalendarClock className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="datetime-local" value={form.follow_up_at} onChange={(e) => setForm((f) => ({ ...f, follow_up_at: e.target.value }))} className="h-8 text-xs pl-8" />
                </div>
                <Select value={form.outcome} onValueChange={(v) => setForm((f) => ({ ...f, outcome: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Channel / ref #" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} className="h-8 text-xs pl-8" />
                </div>
              </div>

              {/* Notes */}
              <Textarea placeholder="Detailed notes..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[70px] resize-none" rows={3} />

              {/* Resolution */}
              <Input placeholder="Resolution / action taken" value={form.resolution} onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))} className="h-8 text-xs" />

              {/* Tags */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1"><Tag className="h-3 w-3" />Tags</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] gap-1 pr-1">
                      {t}
                      <button onClick={() => removeTag(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Input
                    placeholder="Add tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                    className="h-7 text-xs w-32"
                  />
                  {TAG_PRESETS.filter((t) => !form.tags.includes(t)).slice(0, 6).map((t) => (
                    <Button key={t} variant="ghost" size="sm" className="h-7 text-[10px] px-2 text-muted-foreground" onClick={() => addTag(t)}>{t}</Button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setIsAdding(false); setForm(emptyForm); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" disabled={!form.subject.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{addMutation.isPending ? "Saving..." : "Log Interaction"}
                </Button>
              </div>
            </div>
          )}

          {/* ── FILTERS ──────────────────────────────── */}
          {interactions && interactions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 w-[110px] text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Status</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-7 w-[120px] text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Types</SelectItem>
                  {INTERACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterStatus !== "all" || filterType !== "all") && (
                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={() => { setFilterStatus("all"); setFilterType("all"); }}>
                  Clear
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {filtered?.length} of {interactions.length} interactions
              </span>
            </div>
          )}

          {/* ── LIST ──────────────────────────────────── */}
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{interactions?.length ? "No matching interactions" : "No interactions logged yet"}</p>
              <p className="text-xs mt-1">Log calls, emails, meetings and notes with full detail</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const cfg = getTypeConfig(item.interaction_type);
                const Icon = cfg.icon;
                const priCfg = getPriorityConfig(item.priority);
                const staCfg = getStatusConfig(item.status);
                const StaIcon = staCfg.icon;
                const profile = profileMap?.[item.created_by_email || ""];
                const isExpanded = expandedRow === item.id;

                return (
                  <div key={item.id} className="border border-border/50 rounded-lg hover:border-border transition-colors">
                    {/* Summary row */}
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left"
                      onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                    >
                      <div className={cn("shrink-0 rounded-full p-1.5 bg-muted/60")}>
                        <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", staCfg.color)}>
                            <StaIcon className="h-3 w-3 mr-0.5" />{staCfg.label}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", priCfg.color)}>
                            {priCfg.label}
                          </Badge>
                          <span className="text-sm font-medium text-foreground truncate">{item.subject}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                          <span>{cfg.label}</span>
                          {item.contact_name && <span>· {item.contact_name}</span>}
                          {item.duration_minutes && <span>· {item.duration_minutes}m</span>}
                          {item.outcome && <span>· {item.outcome}</span>}
                          {item.tags.length > 0 && (
                            <span className="flex items-center gap-1">
                              · <Tag className="h-3 w-3" />{item.tags.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {profile && (
                          <Avatar className="h-5 w-5">
                            {profile.avatar && <AvatarImage src={profile.avatar} />}
                            <AvatarFallback className="text-[7px] bg-muted">{getInitials(profile.name)}</AvatarFallback>
                          </Avatar>
                        )}
                        <span className="text-[11px] text-muted-foreground hidden sm:inline" title={format(new Date(item.created_at), "PPpp")}>
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0">
                        <Separator className="mb-3" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                          <DetailField label="Type" value={cfg.label} />
                          <DetailField label="Priority" value={priCfg.label} />
                          <DetailField label="Status" value={staCfg.label} />
                          <DetailField label="Contact" value={item.contact_name} />
                          <DetailField label="Email" value={item.contact_email} href={item.contact_email ? `mailto:${item.contact_email}` : undefined} />
                          <DetailField label="Phone" value={item.contact_phone} href={item.contact_phone ? `tel:${item.contact_phone}` : undefined} />
                          <DetailField label="Duration" value={item.duration_minutes ? `${item.duration_minutes} minutes` : null} />
                          <DetailField label="Outcome" value={item.outcome} />
                          <DetailField label="Channel / Ref" value={item.channel} />
                          <DetailField label="Follow-up" value={item.follow_up_at ? format(new Date(item.follow_up_at), "MMM dd, yyyy h:mm a") : null} />
                          <DetailField label="Created" value={format(new Date(item.created_at), "MMM dd, yyyy h:mm a")} />
                          <DetailField label="Last Updated" value={format(new Date(item.updated_at), "MMM dd, yyyy h:mm a")} />
                        </div>

                        {item.notes && (
                          <div className="mt-3">
                            <p className="text-[10px] text-muted-foreground mb-1">Notes</p>
                            <p className="text-xs text-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-2.5">{item.notes}</p>
                          </div>
                        )}

                        {item.resolution && (
                          <div className="mt-3">
                            <p className="text-[10px] text-muted-foreground mb-1">Resolution / Action Taken</p>
                            <p className="text-xs text-foreground bg-green-500/5 border border-green-500/20 rounded-md p-2.5">{item.resolution}</p>
                          </div>
                        )}

                        {item.tags.length > 0 && (
                          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            {item.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                            ))}
                          </div>
                        )}

                        {/* Quick actions */}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground mr-1">Set status:</span>
                          {STATUSES.map((s) => (
                            <Button
                              key={s.value}
                              variant={item.status === s.value ? "default" : "outline"}
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              disabled={item.status === s.value}
                              onClick={() => updateStatusMutation.mutate({ id: item.id, status: s.value })}
                            >
                              <s.icon className="h-3 w-3 mr-0.5" />{s.label}
                            </Button>
                          ))}
                          <div className="ml-auto">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                              onClick={() => deleteMutation.mutate(item.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

/* Small helper for detail fields */
const DetailField = ({ label, value, href }: { label: string; value?: string | null; href?: string }) => {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {href ? (
        <a href={href} className="text-xs font-medium text-primary hover:underline">{value}</a>
      ) : (
        <p className="text-xs font-medium text-foreground">{value}</p>
      )}
    </div>
  );
};

export default ClientInteractionLog;
