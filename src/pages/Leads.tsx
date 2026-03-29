import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { NewLeadDialog } from "@/components/NewLeadDialog";
import {
  UserPlus, Search, ArrowRightCircle, Users, Clock, Mail,
  XCircle, MessageSquare, Ban, CheckCircle2, Loader2, Filter,
  Inbox, Globe, Building2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

/* ─── Types ─── */
type SourceTab = "all" | "email" | "outreach";

interface UnifiedLead {
  id: string;
  name: string;
  email: string;
  company: string;
  source: "email" | "outreach";
  sourceLabel: string;
  status: string;
  created_at: string;
  // outreach-specific
  outreach_lead?: any;
  campaign_id?: string;
  // email-specific
  opportunity_id?: string;
  account_id?: string;
  contact_id?: string;
}

/* ─── Status config ─── */
const STATUS_CFG: Record<string, { icon: React.ReactNode; label: string; pill: string }> = {
  new:        { icon: <Inbox className="h-3 w-3 text-blue-500" />,               label: "New",       pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  pending:    { icon: <Clock className="h-3 w-3 text-muted-foreground" />,       label: "Pending",   pill: "bg-muted text-muted-foreground border-transparent" },
  sent:       { icon: <Mail className="h-3 w-3 text-blue-500" />,                label: "Sent",      pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  bounced:    { icon: <XCircle className="h-3 w-3 text-destructive" />,          label: "Bounced",   pill: "bg-destructive/10 text-destructive border-destructive/20" },
  replied:    { icon: <MessageSquare className="h-3 w-3 text-emerald-500" />,    label: "Replied",   pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  converted:  { icon: <ArrowRightCircle className="h-3 w-3 text-amber-500" />,   label: "Converted", pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  opted_out:  { icon: <Ban className="h-3 w-3 text-muted-foreground" />,         label: "Opted Out", pill: "bg-muted text-muted-foreground border-transparent" },
  discovery:  { icon: <Globe className="h-3 w-3 text-sky-500" />,                label: "Discovery", pill: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.new;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", c.pill)}>
      {c.icon}{c.label}
    </span>
  );
}

function SourceBadge({ source }: { source: "email" | "outreach" }) {
  return source === "email" ? (
    <Badge variant="outline" className="text-[10px] gap-1 border-sky-500/30 text-sky-600 dark:text-sky-400">
      <Mail className="h-2.5 w-2.5" />Email Sync
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] gap-1 border-violet-500/30 text-violet-600 dark:text-violet-400">
      <MessageSquare className="h-2.5 w-2.5" />Outreach
    </Badge>
  );
}

export default function Leads() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>("all");
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Fetch email-synced leads: opportunities where account.status = 'lead'
  const { data: emailLeads = [], isLoading: loadingEmail } = useQuery({
    queryKey: ["email-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, account_id, contact_id, stage, created_at, referral_source, account:accounts(*), contact:contacts(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Filter to accounts with status 'lead'
      return (data || []).filter((o: any) => o.account?.status === "lead");
    },
  });

  // Fetch outreach cadence leads
  const { data: outreachLeads = [], isLoading: loadingOutreach } = useQuery({
    queryKey: ["all-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_contacts")
        .select("*, outreach_campaigns(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingEmail || loadingOutreach;

  // Unify into a single list
  const unifiedLeads: UnifiedLead[] = useMemo(() => {
    const emailMapped: UnifiedLead[] = emailLeads.map((o: any) => ({
      id: `email-${o.id}`,
      name: [o.contact?.first_name, o.contact?.last_name].filter(Boolean).join(" ") || "—",
      email: o.contact?.email || "—",
      company: o.account?.name || "—",
      source: "email" as const,
      sourceLabel: o.referral_source || "Email (Auto-Synced)",
      status: "new",
      created_at: o.created_at,
      opportunity_id: o.id,
      account_id: o.account_id,
      contact_id: o.contact_id,
    }));

    const outreachMapped: UnifiedLead[] = outreachLeads.map((l: any) => ({
      id: `outreach-${l.id}`,
      name: [l.first_name, l.last_name].filter(Boolean).join(" ") || "—",
      email: l.email,
      company: l.company || "—",
      source: "outreach" as const,
      sourceLabel: (l as any).outreach_campaigns?.name || "Cadence",
      status: l.status,
      created_at: l.created_at,
      outreach_lead: l,
      campaign_id: l.campaign_id,
    }));

    return [...emailMapped, ...outreachMapped].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [emailLeads, outreachLeads]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = unifiedLeads;
    if (sourceTab !== "all") {
      list = list.filter(l => l.source === sourceTab);
    }
    if (search) {
      const term = search.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(term) ||
        l.email.toLowerCase().includes(term) ||
        l.company.toLowerCase().includes(term)
      );
    }
    return list;
  }, [unifiedLeads, sourceTab, search]);

  // Stats
  const totalEmail = unifiedLeads.filter(l => l.source === "email").length;
  const totalOutreach = unifiedLeads.filter(l => l.source === "outreach").length;
  const totalNew = unifiedLeads.filter(l => l.status === "new").length;
  const totalConverted = unifiedLeads.filter(l => l.status === "converted").length;
  const totalReplied = unifiedLeads.filter(l => ["replied", "converted"].includes(l.status)).length;

  // Convert outreach lead to pipeline
  const convertOutreachLead = async (lead: UnifiedLead) => {
    if (!lead.outreach_lead) return;
    const ol = lead.outreach_lead;
    setConvertingId(lead.id);
    try {
      const accountName = ol.company || `${ol.first_name || ""} ${ol.last_name || ""}`.trim() || ol.email;
      const { data: account, error: aErr } = await supabase
        .from("accounts").insert({ name: accountName }).select().single();
      if (aErr) throw aErr;

      const { data: contact, error: cErr } = await supabase
        .from("contacts").insert({
          account_id: account.id,
          first_name: ol.first_name || null,
          last_name: ol.last_name || null,
          email: ol.email,
        }).select().single();
      if (cErr) throw cErr;

      const campaignName = ol.outreach_campaigns?.name || "Outreach";
      const { data: opp, error: oErr } = await supabase
        .from("opportunities").insert({
          account_id: account.id,
          contact_id: contact.id,
          stage: "discovery",
          referral_source: `Cadence: ${campaignName}`,
        }).select().single();
      if (oErr) throw oErr;

      await supabase.from("outreach_contacts").update({
        status: "converted",
        converted_at: new Date().toISOString(),
        opportunity_id: opp.id,
      }).eq("id", ol.id);

      // Recalc campaign counts
      const { data: all } = await supabase
        .from("outreach_contacts").select("status").eq("campaign_id", ol.campaign_id);
      if (all) {
        await supabase.from("outreach_campaigns").update({
          sent_count: all.filter((c: any) => ["sent","bounced","replied","converted"].includes(c.status)).length,
          bounced_count: all.filter((c: any) => c.status === "bounced").length,
          replied_count: all.filter((c: any) => ["replied","converted"].includes(c.status)).length,
          converted_count: all.filter((c: any) => c.status === "converted").length,
        }).eq("id", ol.campaign_id);
      }

      queryClient.invalidateQueries({ queryKey: ["all-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast.success(`${accountName} converted to pipeline ✓`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConvertingId(null);
    }
  };

  // Promote email lead: update account status from 'lead' to 'active'
  const promoteEmailLead = async (lead: UnifiedLead) => {
    setConvertingId(lead.id);
    try {
      const { error } = await supabase
        .from("accounts")
        .update({ status: "active" })
        .eq("id", lead.account_id!);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
      toast.success(`${lead.company} promoted to active pipeline ✓`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={UserPlus}
          title="Leads"
          description="All inbound and outreach leads · Qualify and convert to your pipeline"
          actions={
            <div className="flex items-center gap-2">
              <NewLeadDialog />
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/outreach")}>
                <Mail className="h-4 w-4" />Cadences
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger-children">
            <StatCard label="Total Leads" value={unifiedLeads.length} icon={Users} color="muted" />
            <StatCard label="Email Leads" value={totalEmail} icon={Inbox} color="primary" />
            <StatCard label="Outreach Leads" value={totalOutreach} icon={MessageSquare} color="teal" />
            <StatCard label="New / Unqualified" value={totalNew} icon={Clock} color="warning" />
            <StatCard label="Converted" value={totalConverted} icon={CheckCircle2} color="success" />
          </div>

          {/* Source tabs + search */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={sourceTab} onValueChange={v => setSourceTab(v as SourceTab)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3 h-6">All ({unifiedLeads.length})</TabsTrigger>
                <TabsTrigger value="email" className="text-xs px-3 h-6">
                  <Mail className="h-3 w-3 mr-1" />Email ({totalEmail})
                </TabsTrigger>
                <TabsTrigger value="outreach" className="text-xs px-3 h-6">
                  <MessageSquare className="h-3 w-3 mr-1" />Outreach ({totalOutreach})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="pl-8 h-8 text-sm" />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded bg-muted/30 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No leads yet"
              description="Leads appear here from email correspondence and outreach cadences."
              actionLabel="Create Cadence"
              onAction={() => navigate("/outreach")}
            />
          ) : (
            <Card className="border-border/60 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(lead => {
                      const isConverting = convertingId === lead.id;
                      const isConverted = lead.status === "converted";
                      return (
                        <TableRow key={lead.id} className="border-border/40">
                          <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{lead.email}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{lead.company}</TableCell>
                          <TableCell><SourceBadge source={lead.source} /></TableCell>
                          <TableCell><StatusBadge status={lead.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(lead.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            {lead.source === "email" ? (
                              <Button
                                size="sm" variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={isConverting}
                                onClick={() => promoteEmailLead(lead)}
                              >
                                {isConverting ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" />Promoting…</>
                                ) : (
                                  <><ArrowRightCircle className="h-3 w-3" />Promote to Pipeline</>
                                )}
                              </Button>
                            ) : isConverted ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-emerald-500" disabled>
                                <CheckCircle2 className="h-3 w-3" />Converted
                              </Button>
                            ) : (
                              <Button
                                size="sm" variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={isConverting}
                                onClick={() => convertOutreachLead(lead)}
                              >
                                {isConverting ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" />Converting…</>
                                ) : (
                                  <><ArrowRightCircle className="h-3 w-3" />Convert to Pipeline</>
                                )}
                              </Button>
                            )}
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
