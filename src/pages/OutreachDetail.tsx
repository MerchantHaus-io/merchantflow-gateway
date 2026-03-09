import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardAccentBar } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GmailEditor } from "@/components/GmailEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Upload, Send, Mail, AlertTriangle, MessageSquare, TrendingUp,
  Clock, CheckCircle2, XCircle, ArrowRightCircle, Eye, Loader2, Plus, Layers,
  Reply, Phone, Filter, Download, Search, Users, Zap, MoreHorizontal,
  GripVertical, Trash2, Edit3, ChevronDown, ChevronRight, AlertCircle,
  PlayCircle, SkipForward, UserCheck, Ban,
} from "lucide-react";
import { format, formatDistanceToNow, addDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAD_STATUSES = ["all", "pending", "sent", "bounced", "replied", "converted", "opted_out"] as const;
type LeadStatus = typeof LEAD_STATUSES[number];

const STATUS_CFG: Record<string, { icon: React.ReactNode; label: string; pill: string }> = {
  pending:    { icon: <Clock className="h-3 w-3 text-muted-foreground" />,          label: "Pending",    pill: "bg-muted text-muted-foreground border-transparent" },
  sent:       { icon: <Mail className="h-3 w-3 text-blue-500" />,                   label: "Sent",       pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  bounced:    { icon: <XCircle className="h-3 w-3 text-destructive" />,             label: "Bounced",    pill: "bg-destructive/10 text-destructive border-destructive/20" },
  replied:    { icon: <MessageSquare className="h-3 w-3 text-emerald-500" />,       label: "Replied",    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  converted:  { icon: <ArrowRightCircle className="h-3 w-3 text-amber-500" />,      label: "Converted",  pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  opted_out:  { icon: <Ban className="h-3 w-3 text-muted-foreground" />,            label: "Opted Out",  pill: "bg-muted text-muted-foreground border-transparent" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", c.pill)}>
      {c.icon}{c.label}
    </span>
  );
}

function mergeTags(html: string, contact: any) {
  return html
    .replace(/\{\{first_name\}\}/g, contact.first_name || "")
    .replace(/\{\{last_name\}\}/g,  contact.last_name  || "")
    .replace(/\{\{company\}\}/g,    contact.company    || "")
    .replace(/\{\{email\}\}/g,      contact.email      || "")
    .replace(/\{\{phone\}\}/g,      contact.phone      || "");
}

// ─── Cadence step pill in the builder ─────────────────────────────────────────
function CadenceStepCard({
  stepNumber, subject, dayLabel, isInitial, onSend, onDelete, sending,
}: {
  stepNumber: number; subject: string; dayLabel: string;
  isInitial?: boolean; onSend?: () => void; onDelete?: () => void; sending?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-0">
      {/* Connector line */}
      <div className="flex flex-col items-center mr-4">
        <div className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 z-10",
          isInitial ? "bg-primary text-primary-foreground" : "bg-muted text-foreground border border-border"
        )}>{stepNumber}</div>
        {!isInitial && <div className="w-px flex-1 bg-border/60 mt-1" />}
      </div>
      <Card className={cn("flex-1 mb-3", isInitial && "border-primary/30 bg-primary/5")}>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-foreground truncate">{isInitial ? "Initial Email" : `Follow-up #${stepNumber - 1}`}</p>
              <Badge variant="outline" className="text-[10px] shrink-0">{dayLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{subject}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSend && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={sending} onClick={onSend}>
                <Send className="h-3 w-3" />{sending ? "Sending…" : "Send"}
              </Button>
            )}
            {onDelete && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OutreachDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sending, setSending]             = useState(false);
  const [previewOpen, setPreviewOpen]     = useState(false);
  const [previewStep, setPreviewStep]     = useState<number>(1);
  const [replyDialog, setReplyDialog]     = useState<any | null>(null);
  const [replySnippet, setReplySnippet]   = useState("");
  const [convertingId, setConvertingId]   = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<LeadStatus>("all");

  // New step form
  const [stepSubject, setStepSubject] = useState("");
  const [stepBody, setStepBody]       = useState("");
  const [stepDelay, setStepDelay]     = useState(3);

  // ── Queries ──
  const { data: campaign } = useQuery({
    queryKey: ["outreach-campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_campaigns").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["outreach-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_contacts").select("*").eq("campaign_id", id!).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: cadenceSteps = [] } = useQuery({
    queryKey: ["cadence-steps", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cadence_steps").select("*").eq("campaign_id", id!).order("step_number", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // ── Mutations ──
  const addStep = useMutation({
    mutationFn: async () => {
      const nextStep = cadenceSteps.length + 2;
      const { error } = await supabase.from("cadence_steps").insert({
        campaign_id: id!, step_number: nextStep, delay_days: stepDelay, subject: stepSubject, body_html: stepBody,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cadence-steps", id] });
      setStepSubject(""); setStepBody(""); setStepDelay(3);
      toast.success("Step added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStep = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.from("cadence_steps").delete().eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cadence-steps", id] }); toast.success("Step removed"); },
  });

  const markStatus = useMutation({
    mutationFn: async ({ contactId, status }: { contactId: string; status: string }) => {
      const updates: Record<string, any> = { status };
      if (status === "bounced")   updates.bounced_at   = new Date().toISOString();
      if (status === "replied")   updates.replied_at   = new Date().toISOString();
      if (status === "converted") updates.converted_at = new Date().toISOString();
      const { error } = await supabase.from("outreach_contacts").update(updates).eq("id", contactId);
      if (error) throw error;
      await recalcCounts();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
    },
  });

  // ── CSV upload ──
  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) { toast.error("CSV must have a header row and data"); return; }

    const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/['"]/g, "").toLowerCase());

    // Flexible header matching for: Last, First Name, Email, Phone Number
    const findIdx = (...keys: string[]) => rawHeaders.findIndex(h => keys.some(k => h.includes(k)));
    const emailIdx   = findIdx("email");
    const firstIdx   = findIdx("first");
    const lastIdx    = findIdx("last");
    const phoneIdx   = findIdx("phone");
    const companyIdx = findIdx("company", "business", "dba");

    if (emailIdx === -1) { toast.error("CSV must have an 'email' column"); return; }

    const rows = lines.slice(1)
      .map(line => {
        // Handle quoted CSV values
        const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,))/g)?.map(c => c.replace(/^"|"$/g, "").trim()) || line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        return {
          campaign_id: id,
          email:      cols[emailIdx] || "",
          first_name: firstIdx  >= 0 ? (cols[firstIdx]  || null) : null,
          last_name:  lastIdx   >= 0 ? (cols[lastIdx]   || null) : null,
          phone:      phoneIdx  >= 0 ? (cols[phoneIdx]  || null) : null,
          company:    companyIdx >= 0 ? (cols[companyIdx] || null) : null,
        };
      })
      .filter(r => r.email && r.email.includes("@"));

    if (rows.length === 0) { toast.error("No valid email addresses found"); return; }

    const { error } = await supabase.from("outreach_contacts").insert(rows);
    if (error) { toast.error(error.message); return; }

    await supabase.from("outreach_campaigns")
      .update({ total_contacts: (campaign?.total_contacts || 0) + rows.length })
      .eq("id", id);

    queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
    queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
    queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
    toast.success(`${rows.length} leads imported to list`);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Send ──
  const sendStep = async (stepNumber: number) => {
    if (!id || !campaign) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-outreach-emails", {
        body: { campaign_id: id, step_number: stepNumber },
      });
      if (error) throw error;
      toast.success(`Step ${stepNumber} emails queued`);
      queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setSending(false);
    }
  };

  // ── Recalc campaign counts ──
  const recalcCounts = async () => {
    const { data: all } = await supabase.from("outreach_contacts").select("status").eq("campaign_id", id!);
    if (all) {
      await supabase.from("outreach_campaigns").update({
        sent_count:      all.filter(c => ["sent","bounced","replied","converted"].includes(c.status)).length,
        bounced_count:   all.filter(c => c.status === "bounced").length,
        replied_count:   all.filter(c => ["replied","converted"].includes(c.status)).length,
        converted_count: all.filter(c => c.status === "converted").length,
      }).eq("id", id!);
    }
  };

  // ── Save reply ──
  const saveReply = async () => {
    if (!replyDialog) return;
    await supabase.from("outreach_contacts").update({
      status: "replied", replied_at: new Date().toISOString(),
      reply_snippet: replySnippet || null,
    }).eq("id", replyDialog.id);
    await recalcCounts();
    queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
    queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
    setReplyDialog(null); setReplySnippet("");
    toast.success("Reply logged");
  };

  // ── Convert to pipeline ──
  const convertToPipeline = async (contact: any) => {
    if (!campaign) return;
    setConvertingId(contact.id);
    try {
      const accountName = contact.company || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email;
      const { data: account, error: aErr } = await supabase.from("accounts").insert({ name: accountName }).select().single();
      if (aErr) throw aErr;
      const { data: cont, error: cErr } = await supabase.from("contacts").insert({
        account_id: account.id, first_name: contact.first_name || null,
        last_name: contact.last_name || null, email: contact.email, phone: contact.phone || null,
      }).select().single();
      if (cErr) throw cErr;
      const { data: opp, error: oErr } = await supabase.from("opportunities").insert({
        account_id: account.id, contact_id: cont.id,
        stage: "discovery", referral_source: `Cadence: ${campaign.name}`,
      }).select().single();
      if (oErr) throw oErr;
      await supabase.from("outreach_contacts").update({
        status: "converted", converted_at: new Date().toISOString(), opportunity_id: opp.id,
      }).eq("id", contact.id);
      await recalcCounts();
      queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
      toast.success(`${accountName} added to pipeline ✓`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConvertingId(null);
    }
  };

  if (!campaign) return <AppLayout><div className="p-6 text-muted-foreground text-sm">Loading cadence…</div></AppLayout>;

  // ── Derived stats ──
  const total      = Math.max(contacts.length, 1);
  const pending    = contacts.filter(c => c.status === "pending").length;
  const sent       = contacts.filter(c => ["sent","bounced","replied","converted"].includes(c.status)).length;
  const bounced    = contacts.filter(c => c.status === "bounced").length;
  const replied    = contacts.filter(c => ["replied","converted"].includes(c.status)).length;
  const converted  = contacts.filter(c => c.status === "converted").length;
  const replyRate  = sent > 0 ? Math.round((replied / sent) * 100) : 0;

  // Filtered lead list
  const filteredContacts = contacts.filter(c => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const term = search.toLowerCase();
    const matchSearch = !term || [c.first_name, c.last_name, c.email, c.company]
      .filter(Boolean).some(v => v!.toLowerCase().includes(term));
    return matchStatus && matchSearch;
  });

  // Preview HTML
  const sampleContact = contacts[0] || { first_name: "Jane", last_name: "Smith", company: "Acme Corp", email: "jane@example.com", phone: "" };
  const previewStepData = previewStep === 1
    ? { subject: campaign.subject, body_html: campaign.body_html }
    : cadenceSteps.find(s => s.step_number === previewStep) || { subject: campaign.subject, body_html: campaign.body_html };
  const previewHtml = mergeTags(previewStepData.body_html, sampleContact);

  // Timeline
  const timeline = contacts.flatMap(c => {
    const ev: any[] = [];
    if (c.sent_at)      ev.push({ type: "sent",      date: c.sent_at,      contact: c });
    if (c.bounced_at)   ev.push({ type: "bounced",   date: c.bounced_at,   contact: c });
    if (c.replied_at)   ev.push({ type: "replied",   date: c.replied_at,   contact: c, detail: c.reply_snippet });
    if (c.converted_at) ev.push({ type: "converted", date: c.converted_at, contact: c });
    return ev;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 100);

  // Cumulative cadence days for display
  let cumulDays = 0;
  const stepsWithDays = cadenceSteps.map(s => { cumulDays += s.delay_days; return { ...s, cumulDays }; });

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border/60 px-6 py-4 bg-background">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate("/outreach")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h1 className="text-lg font-bold text-foreground truncate">{campaign.name}</h1>
                  <Badge variant={campaign.status === "draft" ? "secondary" : "default"} className="text-[10px] shrink-0">{campaign.status}</Badge>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    <Layers className="h-2.5 w-2.5 mr-1" />{cadenceSteps.length + 1} steps
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Step 1: {campaign.subject}</p>
                {campaign.scheduled_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />Scheduled {format(new Date(campaign.scheduled_at), "MMM d, yyyy · HH:mm")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleCsv} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />Import Lead List
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" />Preview
              </Button>
              <Button size="sm" onClick={() => sendStep(1)} disabled={sending || pending === 0} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                {sending ? "Sending…" : `Send to ${pending} Pending`}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Funnel KPIs ── */}
          <div className="px-6 pt-5 pb-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Leads", value: contacts.length, icon: Users,        color: "text-foreground",  bg: "bg-muted/60",        pct: null },
                { label: "Pending",     value: pending,          icon: Clock,        color: "text-muted-foreground", bg: "bg-muted/40",   pct: Math.round((pending/total)*100) },
                { label: "Sent",        value: sent,             icon: Mail,         color: "text-blue-500",    bg: "bg-blue-500/10",     pct: Math.round((sent/total)*100) },
                { label: "Bounced",     value: bounced,          icon: XCircle,      color: "text-destructive", bg: "bg-destructive/10",  pct: Math.round((bounced/total)*100) },
                { label: "Replied",     value: replied,          icon: MessageSquare,color: "text-emerald-500", bg: "bg-emerald-500/10",  pct: Math.round((replied/total)*100) },
                { label: "Converted",   value: converted,        icon: TrendingUp,   color: "text-amber-500",   bg: "bg-amber-500/10",    pct: Math.round((converted/total)*100) },
              ].map(k => (
                <Card key={k.label} className="border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", k.bg)}>
                        <k.icon className={cn("h-3.5 w-3.5", k.color)} />
                      </div>
                      <div>
                        <p className={cn("text-lg font-bold leading-none", k.color)}>{k.value}</p>
                        <p className="text-[10px] text-muted-foreground">{k.label}</p>
                      </div>
                    </div>
                    {k.pct !== null && <Progress value={k.pct} className="h-1" />}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Reply rate bar */}
            {sent > 0 && (
              <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Reply rate</span>
                    <span className={cn("font-semibold", replyRate > 20 ? "text-emerald-500" : replyRate > 10 ? "text-amber-500" : "text-muted-foreground")}>{replyRate}%</span>
                  </div>
                  <Progress value={replyRate} className="h-1.5" />
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {replied}/{sent} replied · {converted} converted
                </div>
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div className="px-6 pt-5 pb-6">
            <Tabs defaultValue="leads" className="space-y-4">
              <TabsList className="h-9">
                <TabsTrigger value="leads" className="text-xs gap-1.5">
                  <Users className="h-3.5 w-3.5" />Lead List <span className="ml-1 opacity-60">({contacts.length})</span>
                </TabsTrigger>
                <TabsTrigger value="cadence" className="text-xs gap-1.5">
                  <Layers className="h-3.5 w-3.5" />Cadence Builder <span className="ml-1 opacity-60">({cadenceSteps.length + 1} steps)</span>
                </TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs gap-1.5">
                  <Clock className="h-3.5 w-3.5" />Activity Timeline
                </TabsTrigger>
              </TabsList>

              {/* ══ LEADS TAB ══ */}
              <TabsContent value="leads" className="space-y-3 mt-0">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search leads by name, email, phone…" className="pl-8 h-8 text-sm" />
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {LEAD_STATUSES.map(s => (
                      <button key={s} onClick={() => setStatusFilter(s)}
                        className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                          statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                        )}>
                        {s === "all" ? `All (${contacts.length})` : `${STATUS_CFG[s]?.label || s} (${contacts.filter(c => c.status === s).length})`}
                      </button>
                    ))}
                  </div>
                </div>

                {contactsLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
                ) : filteredContacts.length === 0 ? (
                  <EmptyState
                    icon={Upload}
                    title="No leads in list"
                    description="Import a CSV with columns: Last Name, First Name, Email, Phone Number"
                    actionLabel="Import Lead List"
                    onAction={() => fileRef.current?.click()}
                    size="sm"
                  />
                ) : (
                  <Card className="border-border/60">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead className="text-xs">Lead</TableHead>
                            <TableHead className="text-xs">Email</TableHead>
                            <TableHead className="text-xs">Phone</TableHead>
                            <TableHead className="text-xs">Company</TableHead>
                            <TableHead className="text-xs">Step</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Last Contact</TableHead>
                            <TableHead className="text-xs">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredContacts.map(c => (
                            <TableRow key={c.id} className="border-border/40 hover:bg-muted/20">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                                    {((c.first_name?.[0] || "") + (c.last_name?.[0] || "")).toUpperCase() || c.email[0].toUpperCase()}
                                  </div>
                                  <span className="font-medium text-sm text-foreground whitespace-nowrap">
                                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">—</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{c.company || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] font-mono">S{(c as any).current_step || 1}</Badge>
                              </TableCell>
                              <TableCell><StatusBadge status={c.status} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {c.sent_at ? formatDistanceToNow(new Date(c.sent_at), { addSuffix: true }) : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {c.status === "sent" && (
                                    <>
                                      <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive px-2"
                                        onClick={() => markStatus.mutate({ contactId: c.id, status: "bounced" })}>
                                        Bounced
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-6 text-[11px] text-emerald-500 px-2"
                                        onClick={() => { setReplyDialog(c); setReplySnippet(c.reply_snippet || ""); }}>
                                        <Reply className="h-3 w-3 mr-0.5" />Replied
                                      </Button>
                                    </>
                                  )}
                                  {c.status === "replied" && (
                                    <Button size="sm" variant="ghost" className="h-6 text-[11px] text-amber-500 px-2"
                                      disabled={convertingId === c.id} onClick={() => convertToPipeline(c)}>
                                      {convertingId === c.id ? <Loader2 className="h-3 w-3 animate-spin mr-0.5" /> : <TrendingUp className="h-3 w-3 mr-0.5" />}
                                      Convert
                                    </Button>
                                  )}
                                  {c.status === "converted" && c.opportunity_id && (
                                    <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                                      onClick={() => navigate(`/opportunities/${c.opportunity_id}`)}>
                                      View Opp →
                                    </Button>
                                  )}
                                  {c.status === "pending" && (
                                    <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground px-2"
                                      onClick={() => markStatus.mutate({ contactId: c.id, status: "opted_out" })}>
                                      Opt Out
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="px-4 py-2 border-t border-border/40 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{filteredContacts.length} leads shown</p>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => {
                        const csv = ["Last Name,First Name,Email,Company,Status,Step,Sent At",
                          ...filteredContacts.map(c =>
                            [c.last_name, c.first_name, c.email, c.company, c.status, (c as any).current_step, c.sent_at]
                              .map(v => `"${v || ""}"`).join(",")
                          )].join("\n");
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                        a.download = `lead-list-${campaign.name}.csv`;
                        a.click();
                        toast.success("Lead list exported");
                      }}>
                        <Download className="h-3 w-3" />Export CSV
                      </Button>
                    </div>
                  </Card>
                )}
              </TabsContent>

              {/* ══ CADENCE BUILDER ══ */}
              <TabsContent value="cadence" className="space-y-0 mt-0">
                <div className="grid lg:grid-cols-5 gap-5">
                  {/* Left: visual step timeline */}
                  <div className="lg:col-span-3 space-y-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Cadence Flow</p>

                    {/* Step 1 */}
                    <CadenceStepCard
                      stepNumber={1} subject={campaign.subject} dayLabel="Day 0" isInitial
                      onSend={() => sendStep(1)} sending={sending}
                    />

                    {/* Follow-up steps */}
                    {stepsWithDays.map(step => (
                      <CadenceStepCard
                        key={step.id}
                        stepNumber={step.step_number}
                        subject={step.subject}
                        dayLabel={`Day +${step.cumulDays}`}
                        onSend={() => sendStep(step.step_number)}
                        onDelete={() => deleteStep.mutate(step.id)}
                        sending={sending}
                      />
                    ))}

                    {/* Add more placeholder */}
                    {cadenceSteps.length < 9 && (
                      <div className="flex items-stretch gap-0">
                        <div className="flex flex-col items-center mr-4">
                          <div className="h-9 w-9 rounded-full border-2 border-dashed border-border/60 flex items-center justify-center">
                            <Plus className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        </div>
                        <div className="flex-1 py-2">
                          <p className="text-xs text-muted-foreground italic">Add a follow-up step →</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: add step form */}
                  <div className="lg:col-span-2">
                    <Card className="border-border/60 sticky top-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Plus className="h-4 w-4 text-primary" />Add Follow-up Step
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Step {cadenceSteps.length + 2} · {cadenceSteps.length < 9 ? `Up to ${9 - cadenceSteps.length} more steps available` : "Max 10 steps reached"}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {cadenceSteps.length >= 9 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary/40" />
                            Maximum 10 steps reached
                          </div>
                        ) : (
                          <>
                            <div>
                              <Label className="text-xs">Delay after previous step</Label>
                              <div className="flex items-center gap-2 mt-2">
                                <input type="range" min={1} max={30} value={stepDelay}
                                  onChange={e => setStepDelay(Number(e.target.value))}
                                  className="flex-1 accent-primary" />
                                <span className="text-sm font-bold text-primary w-16 shrink-0">+{stepDelay}d</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Sends {stepDelay} day{stepDelay !== 1 ? "s" : ""} after step {cadenceSteps.length + 1}
                                {cumulDays > 0 ? ` (day ${cumulDays + stepDelay} overall)` : ""}
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs">Subject</Label>
                              <Input value={stepSubject} onChange={e => setStepSubject(e.target.value)}
                                placeholder="Quick follow-up…" className="mt-1 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Email Body</Label>
                              <GmailEditor
                                value={stepBody}
                                onChange={setStepBody}
                                placeholder="Hi {{first_name}}, just circling back…"
                                minHeight="120px"
                                className="mt-1"
                              />
                            </div>
                            <Button className="w-full" size="sm"
                              disabled={!stepSubject || !stepBody || addStep.isPending}
                              onClick={() => addStep.mutate()}>
                              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Step {cadenceSteps.length + 2}
                            </Button>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* ══ TIMELINE ══ */}
              <TabsContent value="timeline" className="mt-0">
                {timeline.length === 0 ? (
                  <Card className="border-border/60">
                    <CardContent className="flex flex-col items-center py-12 text-center">
                      <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-1">
                    {timeline.map((ev, i) => {
                      const cfg = STATUS_CFG[ev.type] || STATUS_CFG.pending;
                      const name = [ev.contact.first_name, ev.contact.last_name].filter(Boolean).join(" ") || ev.contact.email;
                      return (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="mt-0.5 shrink-0">{cfg.icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">
                              <span className="font-medium">{name}</span>
                              <span className="text-muted-foreground">
                                {ev.type === "sent"      && " — email sent"}
                                {ev.type === "bounced"   && " — bounced"}
                                {ev.type === "replied"   && " — replied"}
                                {ev.type === "converted" && " — converted to pipeline"}
                              </span>
                            </p>
                            {ev.detail && <p className="text-xs text-emerald-600 dark:text-emerald-400 italic mt-0.5">"{ev.detail}"</p>}
                            {ev.contact.bounce_reason && ev.type === "bounced" && (
                              <p className="text-xs text-destructive mt-0.5">{ev.contact.bounce_reason}</p>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                            {format(new Date(ev.date), "MMM d, HH:mm")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* ── Email Preview Dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />Email Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Step selector */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Preview step:</Label>
              <div className="flex gap-1 flex-wrap">
                {[{ n: 1, subject: campaign.subject }, ...cadenceSteps.map(s => ({ n: s.step_number, subject: s.subject }))].map(s => (
                  <button key={s.n} onClick={() => setPreviewStep(s.n)}
                    className={cn("px-2.5 py-1 rounded-full text-[11px] border font-medium transition-colors",
                      previewStep === s.n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                    )}>S{s.n}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">From</p><p className="font-medium">{campaign.from_name} &lt;{campaign.from_email}&gt;</p></div>
              <div><p className="text-xs text-muted-foreground">To (sample)</p><p className="font-medium">{sampleContact.email}</p></div>
            </div>
            <div><p className="text-xs text-muted-foreground">Subject</p><p className="font-medium">{previewStepData.subject}</p></div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Mail className="h-3 w-3" />Preview with: {[sampleContact.first_name, sampleContact.last_name].filter(Boolean).join(" ") || sampleContact.email}
              </div>
              <div className="p-4 bg-white text-black min-h-[200px] text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reply Dialog ── */}
      <Dialog open={!!replyDialog} onOpenChange={o => { if (!o) { setReplyDialog(null); setReplySnippet(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Reply className="h-4 w-4 text-emerald-500" />Log Reply</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Recording reply from <span className="font-medium text-foreground">{replyDialog?.email}</span>
            </p>
            <div>
              <Label className="text-xs">Reply snippet (optional)</Label>
              <Textarea value={replySnippet} onChange={e => setReplySnippet(e.target.value)}
                placeholder="Paste key excerpt…" rows={4} className="mt-1 text-sm" />
            </div>
            <Button className="w-full" onClick={saveReply}>
              <Reply className="h-4 w-4 mr-2" />Save Reply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
