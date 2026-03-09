import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import {
  UserPlus, Search, ArrowRightCircle, Users, Clock, Mail,
  XCircle, MessageSquare, Ban, CheckCircle2, Loader2, Filter,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const STATUSES = ["all", "pending", "sent", "bounced", "replied", "converted", "opted_out"] as const;
type LeadStatus = typeof STATUSES[number];

const STATUS_CFG: Record<string, { icon: React.ReactNode; label: string; pill: string }> = {
  pending:   { icon: <Clock className="h-3 w-3 text-muted-foreground" />,       label: "Pending",   pill: "bg-muted text-muted-foreground border-transparent" },
  sent:      { icon: <Mail className="h-3 w-3 text-blue-500" />,                label: "Sent",      pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  bounced:   { icon: <XCircle className="h-3 w-3 text-destructive" />,          label: "Bounced",   pill: "bg-destructive/10 text-destructive border-destructive/20" },
  replied:   { icon: <MessageSquare className="h-3 w-3 text-emerald-500" />,    label: "Replied",   pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  converted: { icon: <ArrowRightCircle className="h-3 w-3 text-amber-500" />,   label: "Converted", pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  opted_out: { icon: <Ban className="h-3 w-3 text-muted-foreground" />,         label: "Opted Out", pill: "bg-muted text-muted-foreground border-transparent" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", c.pill)}>
      {c.icon}{c.label}
    </span>
  );
}

export default function Leads() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus>("all");
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const { data: leads = [], isLoading } = useQuery({
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

  const convertToPipeline = async (lead: any) => {
    setConvertingId(lead.id);
    try {
      const accountName = lead.company || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email;

      const { data: account, error: aErr } = await supabase
        .from("accounts").insert({ name: accountName }).select().single();
      if (aErr) throw aErr;

      const { data: contact, error: cErr } = await supabase
        .from("contacts").insert({
          account_id: account.id,
          first_name: lead.first_name || null,
          last_name: lead.last_name || null,
          email: lead.email,
          phone: null,
        }).select().single();
      if (cErr) throw cErr;

      const campaignName = lead.outreach_campaigns?.name || "Outreach";
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
      }).eq("id", lead.id);

      // Recalc campaign counts
      const { data: all } = await supabase
        .from("outreach_contacts").select("status").eq("campaign_id", lead.campaign_id);
      if (all) {
        await supabase.from("outreach_campaigns").update({
          sent_count: all.filter(c => ["sent","bounced","replied","converted"].includes(c.status)).length,
          bounced_count: all.filter(c => c.status === "bounced").length,
          replied_count: all.filter(c => ["replied","converted"].includes(c.status)).length,
          converted_count: all.filter(c => c.status === "converted").length,
        }).eq("id", lead.campaign_id);
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

  const filtered = leads.filter(l => {
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    const term = search.toLowerCase();
    const matchSearch = !term || [l.first_name, l.last_name, l.email, l.company]
      .filter(Boolean).some(v => v!.toLowerCase().includes(term));
    return matchStatus && matchSearch;
  });

  const total = leads.length;
  const pending = leads.filter(l => l.status === "pending").length;
  const sent = leads.filter(l => ["sent","bounced","replied","converted"].includes(l.status)).length;
  const replied = leads.filter(l => ["replied","converted"].includes(l.status)).length;
  const converted = leads.filter(l => l.status === "converted").length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={UserPlus}
          title="Leads"
          description="All outreach leads across cadences · Convert qualified leads to your pipeline"
          actions={
            <Button size="sm" className="gap-1.5" onClick={() => navigate("/outreach")}>
              <Mail className="h-4 w-4" />Manage Cadences
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger-children">
            <StatCard label="Total Leads" value={total} icon={Users} color="muted" />
            <StatCard label="Pending" value={pending} icon={Clock} color="teal" />
            <StatCard label="Contacted" value={sent} icon={Mail} color="primary" />
            <StatCard label="Replied" value={replied} icon={MessageSquare} color="success" />
            <StatCard label="Converted" value={converted} icon={CheckCircle2} color="violet" />
          </div>

          {/* Filters */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {STATUSES.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                    statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {s === "all" ? "All" : STATUS_CFG[s]?.label || s}
                </button>
              ))}
            </div>
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
              description="Create a sales cadence and upload a CSV target list to populate your leads."
              actionLabel="Go to Cadences"
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
                      <TableHead>Cadence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(lead => {
                      const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
                      const campaignName = (lead as any).outreach_campaigns?.name || "—";
                      const isConverted = lead.status === "converted";
                      const isConverting = convertingId === lead.id;
                      return (
                        <TableRow key={lead.id} className="border-border/40">
                          <TableCell className="font-medium text-foreground">{name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{lead.email}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{lead.company || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{campaignName}</Badge>
                          </TableCell>
                          <TableCell><StatusBadge status={lead.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(lead.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            {isConverted ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-emerald-500" disabled>
                                <CheckCircle2 className="h-3 w-3" />Converted
                              </Button>
                            ) : (
                              <Button
                                size="sm" variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={isConverting}
                                onClick={() => convertToPipeline(lead)}
                              >
                                {isConverting ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" />Converting…</>
                                ) : (
                                  <><ArrowRightCircle className="h-3 w-3" />Convert to Contact</>
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
