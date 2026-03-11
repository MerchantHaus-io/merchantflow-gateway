import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GmailEditor } from "@/components/GmailEditor";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import {
  Plus, Mail, Send, Users, TrendingUp, MessageSquare, Eye, Trash2,
  CalendarIcon, Clock, Layers, BarChart3, ChevronRight, Zap, ListFilter,
  ArrowUpRight, Upload, FileSpreadsheet, UserPlus, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  draft:     { label: "Draft",     pill: "bg-muted text-muted-foreground border-transparent",                           dot: "bg-muted-foreground" },
  scheduled: { label: "Scheduled", pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",          dot: "bg-blue-500" },
  sending:   { label: "Sending",   pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",      dot: "bg-amber-500 animate-pulse" },
  sent:      { label: "Active",    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" },
  completed: { label: "Completed", pill: "bg-primary/10 text-primary border-primary/20",                                dot: "bg-primary" },
};

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border", c.pill)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", c.dot)} />
      {c.label}
    </span>
  );
}

function CampaignCard({ c, onOpen, onDelete }: { c: any; onOpen: () => void; onDelete: () => void }) {
  const total  = Math.max(c.total_contacts || 1, 1);
  const sentPct = Math.round(((c.sent_count || 0) / total) * 100);
  return (
    <Card
      onClick={onOpen}
      className="group relative cursor-pointer border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusPill status={c.status} />
              {c.scheduled_at && c.status === "draft" && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />{format(new Date(c.scheduled_at), "MMM d, HH:mm")}
                </span>
              )}
            </div>
            <p className="font-semibold text-foreground truncate">{c.name}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{c.subject}</p>
          </div>
          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpen}><Eye className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 mt-4 text-center">
          {[
            { label: "Leads",     v: c.total_contacts || 0,  cls: "text-foreground" },
            { label: "Sent",      v: c.sent_count || 0,       cls: "text-blue-500" },
            { label: "Replied",   v: c.replied_count || 0,    cls: "text-emerald-500" },
            { label: "Converted", v: c.converted_count || 0,  cls: "text-amber-500" },
          ].map(m => (
            <div key={m.label}>
              <p className={cn("text-lg font-bold leading-none", m.cls)}>{m.v}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {c.total_contacts > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Send progress</span><span>{sentPct}%</span>
            </div>
            <Progress value={sentPct} className="h-1" />
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "MMM d, yyyy")}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </CardContent>
    </Card>
  );
}

interface StepDraft {
  subject: string;
  bodyHtml: string;
  delayDays: number;
}

const DEFAULT_DELAYS = [0, 2, 3, 4, 5, 7, 7, 10, 10, 14];

export default function Outreach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen]           = useState(false);
  const [name, setName]           = useState("");
  const [fromName, setFromName]   = useState("Merchant Haus");
  const [fromEmail, setFromEmail] = useState("outreach@merchanthaus.io");
  const [stepCount, setStepCount] = useState(3);
  const [steps, setSteps]         = useState<StepDraft[]>(() => Array.from({ length: 10 }, (_, i) => ({ subject: "", bodyHtml: "", delayDays: DEFAULT_DELAYS[i] })));
  const [signature, setSignature] = useState("");
  const [signatureInitialized, setSignatureInitialized] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [schedDate, setSchedDate] = useState<Date | undefined>();
  const [schedTime, setSchedTime] = useState("09:00");
  const [view, setView]           = useState<"grid"|"list">("grid");
  const [filter, setFilter]       = useState("all");
  const [previewStepIdx, setPreviewStepIdx] = useState(0);

  // CSV target list state
  const [csvLeads, setCsvLeads] = useState<Array<{ email: string; first_name: string | null; last_name: string | null; company: string | null }>>([]);
  const [csvFileName, setCsvFileName] = useState("");

  // Auto-populate branded signature when dialog opens
  useEffect(() => {
    if (open && !signatureInitialized) {
      const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Team Member";
      const userEmail = user?.email || "outreach@merchanthaus.io";
      const logoUrl = `${window.location.origin}/merchant-haus-splash.png`;
      const sig = [
        `<p style="margin:0;font-weight:600;font-size:14px;">${userName}</p>`,
        `<p style="margin:0;font-size:13px;color:#666;">Merchant Haus</p>`,
        `<p style="margin:4px 0 0;font-size:12px;color:#888;">📞 (505) 600-6042 &nbsp;|&nbsp; ✉ ${userEmail}</p>`,
        `<p style="margin:2px 0 0;font-size:12px;color:#888;">🌐 <a href="https://merchanthaus.io" style="color:#2563eb;text-decoration:none;">merchanthaus.io</a></p>`,
        `<p style="margin:8px 0 0;"><img src="${logoUrl}" alt="Merchant Haus" style="height:40px;width:auto;" /></p>`,
      ].join("");
      setSignature(sig);
      setSignatureInitialized(true);
    }
    if (!open) {
      setSignatureInitialized(false);
    }
  }, [open, signatureInitialized, user]);

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) { toast.error("CSV needs a header and data rows"); return; }
    const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/['"]/g, "").toLowerCase());
    const findIdx = (...keys: string[]) => rawHeaders.findIndex(h => keys.some(k => h.includes(k)));
    const emailIdx = findIdx("email");
    const firstIdx = findIdx("first");
    const lastIdx = findIdx("last");
    const companyIdx = findIdx("company", "business", "dba");
    if (emailIdx === -1) { toast.error("CSV must have an 'email' column"); return; }
    const rows = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.replace(/^[\s"]+|[\s"]+$/g, ""));
      return {
        email: cols[emailIdx] || "",
        first_name: firstIdx >= 0 ? (cols[firstIdx] || null) : null,
        last_name: lastIdx >= 0 ? (cols[lastIdx] || null) : null,
        company: companyIdx >= 0 ? (cols[companyIdx] || null) : null,
      };
    }).filter(r => r.email && r.email.includes("@"));
    if (rows.length === 0) { toast.error("No valid email addresses found"); return; }
    setCsvLeads(rows);
    toast.success(`${rows.length} leads parsed from CSV`);
  };

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const appendSignature = (html: string) => {
    if (!signature) return html;
    return html + `<br/><div style="border-top:1px solid #e5e5e5;padding-top:8px;margin-top:12px;font-size:13px;color:#666;">${signature}</div>`;
  };

  const create = useMutation({
    mutationFn: async () => {
      let scheduled_at: string | null = null;
      if (schedDate) {
        const [h, m] = schedTime.split(":").map(Number);
        const dt = new Date(schedDate); dt.setHours(h, m, 0, 0);
        scheduled_at = dt.toISOString();
      }
      const step1 = steps[0];
      const { data: campaign, error } = await supabase.from("outreach_campaigns").insert({
        name, subject: step1.subject, body_html: appendSignature(step1.bodyHtml),
        from_name: fromName, from_email: fromEmail,
        created_by: user?.id || "", created_by_email: user?.email || "", scheduled_at,
      }).select().single();
      if (error) throw error;

      // Insert follow-up steps 2..N
      if (stepCount > 1 && campaign) {
        const followUps = steps.slice(1, stepCount).map((s, i) => ({
          campaign_id: campaign.id,
          step_number: i + 2,
          delay_days: s.delayDays,
          subject: s.subject || step1.subject,
          body_html: appendSignature(s.bodyHtml || step1.bodyHtml),
        }));
        const { error: stepsErr } = await supabase.from("cadence_steps").insert(followUps);
        if (stepsErr) throw stepsErr;
      }

      // Insert CSV leads if provided
      if (csvLeads.length > 0 && campaign) {
        const leadsToInsert = csvLeads.map(l => ({ campaign_id: campaign.id, ...l }));
        // Batch insert in chunks of 500
        for (let i = 0; i < leadsToInsert.length; i += 500) {
          const chunk = leadsToInsert.slice(i, i + 500);
          const { error: leadsErr } = await supabase.from("outreach_contacts").insert(chunk);
          if (leadsErr) throw leadsErr;
        }
        // Update total_contacts count
        await supabase.from("outreach_campaigns")
          .update({ total_contacts: csvLeads.length })
          .eq("id", campaign.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["all-leads"] });
      setOpen(false); setName(""); setSchedDate(undefined);
      setSteps(Array.from({ length: 10 }, (_, i) => ({ subject: "", bodyHtml: "", delayDays: DEFAULT_DELAYS[i] })));
      setSignature(""); setActiveStep(0); setCsvLeads([]); setCsvFileName("");
      toast.success(`Cadence created${csvLeads.length > 0 ? ` with ${csvLeads.length} leads` : ""}!`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      let scheduled_at: string | null = null;
      if (schedDate) {
        const [h, m] = schedTime.split(":").map(Number);
        const dt = new Date(schedDate); dt.setHours(h, m, 0, 0);
        scheduled_at = dt.toISOString();
      }
      const step1 = steps[0];
      const { data: campaign, error } = await supabase.from("outreach_campaigns").insert({
        name, subject: step1.subject || "(draft)", body_html: step1.bodyHtml ? appendSignature(step1.bodyHtml) : "",
        from_name: fromName, from_email: fromEmail,
        created_by: user?.id || "", created_by_email: user?.email || "", scheduled_at, status: "draft",
      }).select().single();
      if (error) throw error;

      if (stepCount > 1 && campaign) {
        const followUps = steps.slice(1, stepCount).filter(s => s.subject || s.bodyHtml).map((s, i) => ({
          campaign_id: campaign.id, step_number: i + 2, delay_days: s.delayDays,
          subject: s.subject || step1.subject || "(draft)", body_html: s.bodyHtml ? appendSignature(s.bodyHtml) : "",
        }));
        if (followUps.length > 0) {
          const { error: stepsErr } = await supabase.from("cadence_steps").insert(followUps);
          if (stepsErr) throw stepsErr;
        }
      }

      if (csvLeads.length > 0 && campaign) {
        const leadsToInsert = csvLeads.map(l => ({ campaign_id: campaign.id, ...l }));
        for (let i = 0; i < leadsToInsert.length; i += 500) {
          const chunk = leadsToInsert.slice(i, i + 500);
          const { error: leadsErr } = await supabase.from("outreach_contacts").insert(chunk);
          if (leadsErr) throw leadsErr;
        }
        await supabase.from("outreach_campaigns").update({ total_contacts: csvLeads.length }).eq("id", campaign.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setOpen(false); setName(""); setSchedDate(undefined);
      setSteps(Array.from({ length: 10 }, (_, i) => ({ subject: "", bodyHtml: "", delayDays: DEFAULT_DELAYS[i] })));
      setSignature(""); setActiveStep(0); setCsvLeads([]); setCsvFileName("");
      toast.success("Draft saved — you can complete it later");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("outreach_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] }); toast.success("Deleted"); },
  });

  const totalLeads  = campaigns.reduce((a, c) => a + (c.total_contacts || 0), 0);
  const totalSent   = campaigns.reduce((a, c) => a + (c.sent_count || 0), 0);
  const totalReply  = campaigns.reduce((a, c) => a + (c.replied_count || 0), 0);
  const totalConv   = campaigns.reduce((a, c) => a + (c.converted_count || 0), 0);
  const replyRate   = totalSent > 0 ? ((totalReply / totalSent) * 100).toFixed(1) : "0";

  const filtered = filter === "all" ? campaigns : campaigns.filter(c => c.status === filter);

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Top bar ── */}
        <PageHeader
          icon={Zap}
          title="Sales Cadences"
          description="Multi-step email sequences · Lead list management · Conversion tracking"
          actions={
            <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New Cadence</Button>
          }
        />

        <Dialog open={open} onOpenChange={setOpen}>
             <DialogContent className="sm:max-w-[960px] max-h-[90vh] overflow-y-auto p-0">
               <div className="flex flex-col md:flex-row">
                 {/* ── How-to Guide Panel ── */}
                 <aside className="hidden md:flex md:w-[280px] shrink-0 flex-col bg-muted/40 border-r border-border/60 p-5 overflow-y-auto">
                   <div className="flex items-center gap-2 mb-4">
                     <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                       <Zap className="h-3.5 w-3.5 text-primary" />
                     </div>
                     <p className="text-xs font-bold text-foreground uppercase tracking-wide">Quick Guide</p>
                   </div>

                   <ol className="space-y-4 text-xs text-muted-foreground">
                     <li className="flex gap-2.5">
                       <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                       <div>
                         <p className="font-semibold text-foreground mb-0.5">Name your cadence</p>
                         <p>Give it a clear name like "Q2 SMB Outreach" so you can find it later.</p>
                       </div>
                     </li>
                     <li className="flex gap-2.5">
                       <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                       <div>
                         <p className="font-semibold text-foreground mb-0.5">Set your steps</p>
                         <p>Use the slider to choose 1–10 emails. Each follow-up sends automatically after the delay you set.</p>
                       </div>
                     </li>
                     <li className="flex gap-2.5">
                       <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                       <div>
                         <p className="font-semibold text-foreground mb-0.5">Write your emails</p>
                         <p>Compose or paste content for each step. Use merge tags to personalise:</p>
                         <div className="mt-1.5 space-y-1">
                           {["{{first_name}}", "{{last_name}}", "{{company}}", "{{email}}"].map(tag => (
                             <code key={tag} className="block bg-background/80 border border-border/50 rounded px-1.5 py-0.5 text-[10px] font-mono text-primary">{tag}</code>
                           ))}
                         </div>
                       </div>
                     </li>
                     <li className="flex gap-2.5">
                       <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                       <div>
                         <p className="font-semibold text-foreground mb-0.5">Add a signature</p>
                         <p>Your signature is appended to every email in the cadence automatically.</p>
                       </div>
                     </li>
                      <li className="flex gap-2.5">
                        <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span>
                        <div>
                          <p className="font-semibold text-foreground mb-0.5">Upload your target list</p>
                          <p>Upload a CSV with your leads below. They'll be saved as leads and available on the <strong>Leads</strong> page for conversion.</p>
                        </div>
                      </li>
                   </ol>

                   <div className="mt-auto pt-5 border-t border-border/50">
                     <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 space-y-1.5">
                       <p className="text-[10px] font-bold text-primary uppercase tracking-wide">CSV Format</p>
                       <p className="text-[10px] text-muted-foreground">Your CSV should include headers:</p>
                       <code className="block text-[10px] font-mono text-foreground bg-background/80 rounded p-1.5 border border-border/50 leading-relaxed">
                         First Name, Last Name,<br/>Email, Phone, Company
                       </code>
                     </div>
                   </div>
                 </aside>

                 {/* ── Form Panel ── */}
                 <div className="flex-1 p-6 overflow-y-auto max-h-[90vh]">
                   <DialogHeader>
                     <DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />New Sales Cadence</DialogTitle>
                   </DialogHeader>
                   <div className="space-y-5 pt-3">
                     {/* Identity */}
                     <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                       <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cadence Identity</p>
                       <div>
                          <Label className="text-xs">Cadence Name <span className="text-destructive">*</span></Label>
                          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Q2 Payment Processing Outreach" className={cn("mt-1", !name && "border-destructive/50 focus-visible:ring-destructive/30")} />
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                         <div><Label className="text-xs">From Name</Label><Input value={fromName} onChange={e => setFromName(e.target.value)} className="mt-1" /></div>
                         <div><Label className="text-xs">From Email</Label><Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className="mt-1" /></div>
                       </div>
                     </div>

                     {/* Steps config */}
                     <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                       <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cadence Length</p>
                       <div className="flex items-center justify-between mb-2">
                         <Label className="text-xs">Total steps (1–10)</Label>
                         <span className="text-sm font-bold text-primary">{stepCount} emails</span>
                       </div>
                       <input type="range" min={1} max={10} value={stepCount} onChange={e => { setStepCount(Number(e.target.value)); setActiveStep(Math.min(activeStep, Number(e.target.value) - 1)); }}
                         className="w-full accent-primary" />
                       <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                         <span>1</span><span>5</span><span>10</span>
                       </div>
                     </div>

                     {/* Step tabs */}
                     <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                       <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Email Content</p>
                       <div className="flex gap-1 flex-wrap">
                         {Array.from({ length: stepCount }, (_, i) => (
                           <button key={i} type="button" onClick={() => setActiveStep(i)}
                             className={cn(
                               "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                               activeStep === i
                                 ? "bg-primary text-primary-foreground border-primary"
                                 : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                               steps[i].bodyHtml && "ring-1 ring-primary/20"
                             )}>
                             {i === 0 ? "Step 1 — Initial" : `Step ${i + 1}`}
                             {steps[i].bodyHtml && <span className="ml-1 text-[10px] opacity-60">✓</span>}
                           </button>
                         ))}
                       </div>

                       {/* Active step editor */}
                       <div className="space-y-3 pt-2">
                         <div className="flex items-center gap-2">
                           <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">{activeStep + 1}</div>
                           <p className="text-xs font-medium text-foreground">{activeStep === 0 ? "Initial Email" : `Follow-up #${activeStep}`}</p>
                           {activeStep > 0 && (
                             <div className="flex items-center gap-1 ml-auto">
                               <Label className="text-[10px]">Send after</Label>
                               <Input type="number" min={1} max={30} value={steps[activeStep].delayDays}
                                 onChange={e => updateStep(activeStep, { delayDays: Number(e.target.value) })}
                                 className="w-16 h-7 text-xs text-center" />
                               <span className="text-[10px] text-muted-foreground">days</span>
                             </div>
                           )}
                         </div>
                         <div>
                            <Label className="text-xs">Subject Line {activeStep === 0 && <span className="text-destructive">*</span>}</Label>
                            <Input value={steps[activeStep].subject} onChange={e => updateStep(activeStep, { subject: e.target.value })}
                              placeholder={activeStep === 0 ? "Payment solutions for {{company}}" : "Re: {{company}} — follow up"}
                              className={cn("mt-1", activeStep === 0 && !steps[0].subject && "border-destructive/50 focus-visible:ring-destructive/30")} />
                         </div>
                         <div>
                           <Label className="text-xs">Paste or compose your email {activeStep === 0 && <span className="text-destructive">*</span>}</Label>
                           <GmailEditor
                             value={steps[activeStep].bodyHtml}
                             onChange={(html) => updateStep(activeStep, { bodyHtml: html })}
                             placeholder={activeStep === 0
                               ? "Hi {{first_name}}, I came across {{company}} and thought our payment processing solutions might be a great fit…"
                               : "Hi {{first_name}}, just following up on my previous email about {{company}}…"}
                             minHeight="120px"
                             className="mt-1"
                           />
                           <p className="text-[10px] text-muted-foreground mt-1">Paste an existing email or write from scratch — use AI Polish to refine.</p>
                         </div>
                       </div>
                     </div>

                     {/* Signature */}
                     <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                       <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Email Signature</p>
                       <GmailEditor
                         value={signature}
                         onChange={setSignature}
                         placeholder="Your name, title, phone number, etc."
                         minHeight="80px"
                       />
                       <p className="text-[10px] text-muted-foreground">Appended to all steps automatically.</p>
                     </div>

                     {/* Target List (CSV Upload) */}
                     <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                       <div className="flex items-center justify-between">
                         <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Target List (Optional)</p>
                         {csvLeads.length > 0 && (
                           <span className="text-xs font-medium text-primary flex items-center gap-1">
                             <CheckCircle2 className="h-3 w-3" />{csvLeads.length} leads loaded
                           </span>
                         )}
                       </div>
                       <div className="flex items-center gap-3">
                         <label className="flex-1 cursor-pointer">
                           <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/80 hover:border-primary/40 transition-colors py-4 px-3">
                             <Upload className="h-4 w-4 text-muted-foreground" />
                             <span className="text-sm text-muted-foreground">
                               {csvFileName || "Upload CSV with leads"}
                             </span>
                           </div>
                           <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                         </label>
                         {csvLeads.length > 0 && (
                           <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => { setCsvLeads([]); setCsvFileName(""); }}>Clear</Button>
                         )}
                       </div>
                       {csvLeads.length > 0 && (
                         <div className="max-h-32 overflow-y-auto rounded border border-border/40 bg-background/50">
                           <Table>
                             <TableHeader>
                               <TableRow className="border-border/40">
                                 <TableHead className="h-7 text-[10px]">Name</TableHead>
                                 <TableHead className="h-7 text-[10px]">Email</TableHead>
                                 <TableHead className="h-7 text-[10px]">Company</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                               {csvLeads.slice(0, 10).map((l, i) => (
                                 <TableRow key={i} className="border-border/30">
                                   <TableCell className="py-1 text-xs">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                                   <TableCell className="py-1 text-xs text-muted-foreground">{l.email}</TableCell>
                                   <TableCell className="py-1 text-xs text-muted-foreground">{l.company || "—"}</TableCell>
                                 </TableRow>
                               ))}
                               {csvLeads.length > 10 && (
                                 <TableRow><TableCell colSpan={3} className="py-1 text-xs text-muted-foreground text-center">+ {csvLeads.length - 10} more</TableCell></TableRow>
                               )}
                             </TableBody>
                           </Table>
                         </div>
                       )}
                       <p className="text-[10px] text-muted-foreground">CSV headers: email, first_name, last_name, company. You can also add leads later.</p>
                     </div>

                     <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                       <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Schedule (Optional)</p>
                       <div className="flex gap-2">
                         <Popover>
                           <PopoverTrigger asChild>
                             <Button variant="outline" className={cn("flex-1 justify-start text-sm font-normal", !schedDate && "text-muted-foreground")}>
                               <CalendarIcon className="h-4 w-4 mr-2" />{schedDate ? format(schedDate, "PPP") : "Pick a date"}
                             </Button>
                           </PopoverTrigger>
                           <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={schedDate} onSelect={setSchedDate}
                                disabled={d => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  return d < today;
                                }} initialFocus className="p-3 pointer-events-auto" />
                           </PopoverContent>
                         </Popover>
                         <Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="w-28" />
                       </div>
                       {schedDate && (
                         <div className="flex items-center gap-2">
                           <p className="text-xs text-muted-foreground flex items-center gap-1">
                             <Clock className="h-3 w-3" />Step 1 sends {format(schedDate, "MMM d, yyyy")} at {schedTime}
                           </p>
                           <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => setSchedDate(undefined)}>Clear</Button>
                         </div>
                       )}
                     </div>

                      {/* Email Preview */}
                      {steps[0].bodyHtml && (
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Email Preview</p>
                            <div className="flex gap-1 flex-wrap">
                              {Array.from({ length: stepCount }, (_, i) => (
                                <button key={i} type="button" onClick={() => setPreviewStepIdx(i)}
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                                    previewStepIdx === i ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                                  )}>S{i + 1}</button>
                              ))}
                            </div>
                          </div>
                          <div className="border border-border rounded-lg overflow-hidden">
                            <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                              <Mail className="h-3 w-3" />
                              <span className="font-medium">{steps[previewStepIdx].subject || "(no subject)"}</span>
                            </div>
                            <div className="p-4 bg-white text-black min-h-[100px] text-sm prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{
                                __html: (steps[previewStepIdx].bodyHtml || "")
                                  .replace(/\{\{first_name\}\}/g, "Jane")
                                  .replace(/\{\{last_name\}\}/g, "Smith")
                                  .replace(/\{\{company\}\}/g, "Acme Corp")
                                  .replace(/\{\{email\}\}/g, "jane@example.com")
                                  + (signature ? `<br/><div style="border-top:1px solid #e5e5e5;padding-top:8px;margin-top:12px;font-size:13px;color:#666;">${signature}</div>` : "")
                              }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">Preview uses sample data: Jane Smith, Acme Corp</p>
                        </div>
                      )}

                       {(!name || !steps[0].subject || !steps[0].bodyHtml) && (
                          <p className="text-xs text-destructive/80 text-center flex items-center justify-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive/60" />
                            Fill in all required fields ({[!name && "name", !steps[0].subject && "subject", !steps[0].bodyHtml && "email body"].filter(Boolean).join(", ")})
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => saveDraft.mutate()} disabled={!name || saveDraft.isPending}>
                            <Clock className="h-4 w-4 mr-2" />Save Draft
                          </Button>
                          <Button className="flex-1" onClick={() => create.mutate()} disabled={!name || !steps[0].subject || !steps[0].bodyHtml || create.isPending}>
                            <Layers className="h-4 w-4 mr-2" />{schedDate ? "Schedule Cadence" : "Create Cadence"} ({stepCount} {stepCount === 1 ? "email" : "emails"})
                          </Button>
                        </div>
                   </div>
                 </div>
               </div>
              </DialogContent>
        </Dialog>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
            <StatCard label="Cadences"    value={campaigns.length} icon={Layers}        color="muted" />
            <StatCard label="Total Leads" value={totalLeads}       icon={Users}         color="teal" />
            <StatCard label="Emails Sent" value={totalSent}        icon={Send}          color="primary" />
            <StatCard label="Replied"     value={totalReply}       icon={MessageSquare} color="success" />
            <StatCard label="Reply Rate"  value={`${replyRate}%`}  icon={BarChart3}     color="warning" />
            <StatCard label="Converted"   value={totalConv}        icon={TrendingUp}    color="violet" />
          </div>

          {/* ── Filter + view toggle ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
              {["all", "draft", "scheduled", "sending", "sent", "completed"].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                    filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {s === "all" ? "All" : STATUS_CFG[s]?.label || s}
                  <span className="ml-1 opacity-60">({s === "all" ? campaigns.length : campaigns.filter(c => c.status === s).length})</span>
                </button>
              ))}
            </div>
            <div className="flex border border-border rounded-md overflow-hidden">
              {(["grid","list"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={cn("px-3 py-1 text-xs font-medium transition-colors capitalize",
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}>{v}</button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No cadences yet"
              description="Create a sales cadence to start reaching out to leads with automated multi-step email sequences."
              actionLabel="New Cadence"
              onAction={() => setOpen(true)}
            />
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(c => (
                <CampaignCard key={c.id} c={c} onOpen={() => navigate(`/outreach/${c.id}`)} onDelete={() => del.mutate(c.id)} />
              ))}
            </div>
          ) : (
            <Card className="border-border/60">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60">
                      <TableHead>Cadence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead className="text-center">Leads</TableHead>
                      <TableHead className="text-center">Sent</TableHead>
                      <TableHead className="text-center">Replied</TableHead>
                      <TableHead className="text-center">Converted</TableHead>
                      <TableHead className="text-center">Reply %</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(c => {
                      const rr = c.sent_count > 0 ? Math.round((c.replied_count / c.sent_count) * 100) : 0;
                      return (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30 border-border/40" onClick={() => navigate(`/outreach/${c.id}`)}>
                          <TableCell>
                            <p className="font-medium text-foreground text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{c.subject}</p>
                          </TableCell>
                          <TableCell><StatusPill status={c.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.scheduled_at ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(c.scheduled_at), "MMM d, HH:mm")}</span> : "—"}
                          </TableCell>
                          <TableCell className="text-center font-semibold text-sm">{c.total_contacts}</TableCell>
                          <TableCell className="text-center font-semibold text-sm text-blue-500">{c.sent_count}</TableCell>
                          <TableCell className="text-center font-semibold text-sm text-emerald-500">{c.replied_count}</TableCell>
                          <TableCell className="text-center font-semibold text-sm text-amber-500">{c.converted_count}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn("text-xs font-bold", rr > 20 ? "text-emerald-500" : rr > 10 ? "text-amber-500" : "text-muted-foreground")}>{rr}%</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/outreach/${c.id}`)}><ArrowUpRight className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
