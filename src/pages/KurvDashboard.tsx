import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Zap, Search, FileText, DollarSign, ListChecks, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { KurvBoardingWizard } from "@/components/kurv/KurvBoardingWizard";

interface KurvMerchant {
  id: string; mid: string; dba_name: string | null; legal_name: string | null;
  status: string | null; mcc: string | null; processor: string | null;
  last_synced_at: string;
}
interface KurvSubmission {
  id: string; deal_id: string | null; deal_type: string; status: string;
  submitted_by: string | null; created_at: string; error: string | null;
}

const KurvDashboard = () => {
  const [tab, setTab] = useState("overview");
  const [merchants, setMerchants] = useState<KurvMerchant[]>([]);
  const [submissions, setSubmissions] = useState<KurvSubmission[]>([]);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  // (Boarding handled by wizard component)

  // Transactions
  const [txMid, setTxMid] = useState("");
  const [txStart, setTxStart] = useState(format(new Date(Date.now() - 30 * 86400_000), "yyyy-MM-dd"));
  const [txEnd, setTxEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [txData, setTxData] = useState<any>(null);
  const [txLoading, setTxLoading] = useState(false);

  const loadLocal = async () => {
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from("kurv_merchants").select("*").order("last_synced_at", { ascending: false }).limit(500),
      supabase.from("kurv_deal_submissions").select("id,deal_id,deal_type,status,submitted_by,created_at,error").order("created_at", { ascending: false }).limit(100),
    ]);
    setMerchants((m as any) ?? []);
    setSubmissions((s as any) ?? []);
  };

  useEffect(() => { loadLocal(); }, []);

  const syncRoster = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("kurv-list-merchants", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.status ? ` (HTTP ${data.status})` : ""));
      toast.success(`Synced ${data?.upserted ?? 0} merchants from Kurv`);
      await loadLocal();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/522|connection timed out|timeout|edge function returned a non-2xx/i.test(msg)) {
        toast.error("Kurv sandbox is unreachable (upstream timeout). Showing cached roster — try again shortly.");
      } else {
        toast.error(msg || "Failed to sync Kurv roster");
      }
    } finally { setSyncing(false); }
  };

  // submitDeal removed — handled by wizard

  const loadTransactions = async () => {
    if (!txMid) { toast.error("MID is required"); return; }
    setTxLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("kurv-transactions", {
        body: { mid: txMid, start_date: txStart, end_date: txEnd },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTxData(data);
      toast.success(`Loaded ${data?.cached ?? 0} day(s) of activity`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load transactions");
    } finally { setTxLoading(false); }
  };

  const filtered = merchants.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.mid?.toLowerCase().includes(q)
      || m.dba_name?.toLowerCase().includes(q)
      || m.legal_name?.toLowerCase().includes(q));
  });

  const activeCount = merchants.filter((m) => (m.status ?? "").toLowerCase() === "active").length;
  const openDeals = submissions.filter((s) => !["approved", "declined", "boarded"].includes((s.status ?? "").toLowerCase())).length;

  return (
    <AppLayout pageTitle="Kurv / MyPortfolio">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Kurv MyPortfolio
            </h1>
            <p className="text-sm text-muted-foreground italic">EMS Corporate boarding, residual roster &amp; transaction reporting</p>
          </div>
          <Button onClick={syncRoster} disabled={syncing} variant="outline" className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Merchant Roster
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="board">Boarding</TabsTrigger>
            <TabsTrigger value="merchants">Merchants</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Active MIDs" value={activeCount} icon={<DollarSign className="h-4 w-4" />} />
              <Kpi label="Total Merchants" value={merchants.length} icon={<ListChecks className="h-4 w-4" />} />
              <Kpi label="Open Deals" value={openDeals} icon={<FileText className="h-4 w-4" />} />
              <Kpi label="Total Submissions" value={submissions.length} icon={<Zap className="h-4 w-4" />} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Recent Deal Submissions</CardTitle>
                <CardDescription>Latest activity from this dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No deals submitted yet</p>
                ) : (
                  <SubmissionsTable rows={submissions.slice(0, 10)} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* BOARDING */}
          <TabsContent value="board" className="space-y-4 mt-4">
            <KurvBoardingWizard onSubmitted={loadLocal} />
          </TabsContent>

          {/* MERCHANTS */}
          <TabsContent value="merchants" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle>Merchant Roster</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search MID, DBA, legal name" className="pl-8" />
                  </div>
                </div>
                <CardDescription>{filtered.length} of {merchants.length} merchants</CardDescription>
              </CardHeader>
              <CardContent>
                {merchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No merchants yet — run a sync.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>MID</TableHead>
                          <TableHead>DBA</TableHead>
                          <TableHead>Legal</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>MCC</TableHead>
                          <TableHead>Processor</TableHead>
                          <TableHead className="text-right">Last Synced</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((m) => (
                          <TableRow key={m.id} className="cursor-pointer" onClick={() => { setTxMid(m.mid); setTab("transactions"); }}>
                            <TableCell className="font-mono text-xs">{m.mid}</TableCell>
                            <TableCell>{m.dba_name ?? "—"}</TableCell>
                            <TableCell>{m.legal_name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={(m.status ?? "").toLowerCase() === "active" ? "default" : "outline"} className="text-[10px]">
                                {m.status ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{m.mcc ?? "—"}</TableCell>
                            <TableCell className="text-xs">{m.processor ?? "—"}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {format(new Date(m.last_synced_at), "dd MMM HH:mm")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TRANSACTIONS */}
          <TabsContent value="transactions" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Transactions &amp; Deposits</CardTitle>
                <CardDescription>Daily batch + deposit summaries for a MID</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label>MID</Label>
                    <Input value={txMid} onChange={(e) => setTxMid(e.target.value)} placeholder="Merchant ID" />
                  </div>
                  <div>
                    <Label>Start</Label>
                    <Input type="date" value={txStart} onChange={(e) => setTxStart(e.target.value)} />
                  </div>
                  <div>
                    <Label>End</Label>
                    <Input type="date" value={txEnd} onChange={(e) => setTxEnd(e.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={loadTransactions} disabled={txLoading} className="w-full gap-2">
                      {txLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Load
                    </Button>
                  </div>
                </div>
                {txData && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {txData.batches?.length ?? 0} batch row(s) · {txData.deposits?.length ?? 0} deposit row(s) · cached {txData.cached} day(s)
                    </p>
                    <pre className="text-[10px] bg-muted/40 p-3 rounded max-h-96 overflow-auto">
                      {JSON.stringify(txData, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* DEALS */}
          <TabsContent value="deals" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>All Deal Submissions</CardTitle>
                <CardDescription>Every payload sent to Kurv from this CRM</CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No submissions yet</p>
                ) : <SubmissionsTable rows={submissions} />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

function Kpi({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider">
          <span>{label}</span>{icon}
        </div>
        <p className="text-2xl font-bold mt-2">{value}</p>
      </CardContent>
    </Card>
  );
}

function SubmissionsTable({ rows }: { rows: KurvSubmission[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deal ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted By</TableHead>
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{s.deal_id ?? "—"}</TableCell>
              <TableCell className="capitalize text-xs">{s.deal_type}</TableCell>
              <TableCell>
                <Badge variant={s.status === "error" ? "destructive" : "outline"} className="text-[10px] capitalize">{s.status}</Badge>
              </TableCell>
              <TableCell className="text-xs">{s.submitted_by ?? "—"}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {format(new Date(s.created_at), "dd MMM HH:mm")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default KurvDashboard;
