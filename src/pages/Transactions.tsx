import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  Activity, DollarSign, CheckCircle, XCircle, RefreshCw, Search,
  ArrowUpDown, CreditCard, Users, TrendingUp, BarChart3, Building2,
  Shield, AlertCircle, ArrowDownRight, ArrowUpRight, Minus, ChevronDown, ChevronUp,
  FileText, Download, Coins, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Transaction {
  merchant_id: string;
  id: string;
  date: string;
  amount: string;
  condition: string;
  type: string;
  card_type: string;
  last_four: string;
  customer_name: string;
  customer_email: string;
  response_text: string;
  response_code: string;
  authorization: string;
  processor_id: string;
  currency: string;
  avs_response: string;
  cvv_response: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  billing_country: string;
  ip_address: string;
  settlement_amount: string;
  settlement_currency: string;
  platform_id: string;
  subscription_id: string;
  merchant_defined_field_1: string;
}

interface Summary {
  total_count: number;
  approved_count: number;
  declined_count: number;
  total_amount: number;
  approved_amount: number;
  refund_count: number;
  refund_amount: number;
  void_count: number;
  sale_count: number;
  auth_count: number;
}

interface MerchantSummary extends Summary {
  merchant_id: string;
  transaction_count: number;
}

interface AllModeResponse {
  mode: "all";
  transactions: Transaction[];
  total_count: number;
  summary: Summary;
  merchant_summaries: MerchantSummary[];
  seen_merchant_ids: string[];
}

interface CommissionEntry {
  merchant_id: string;
  merchant_name: string;
  gateway_id: string;
  transaction_count: number;
  gross_volume: number;
  net_volume: number;
  commission_amount: number;
  commission_rate: number;
  fees: number;
  refund_amount: number;
  chargeback_amount: number;
  status: string;
  payout_date: string;
  currency: string;
}

interface CommissionSummary {
  total_commission: number;
  total_volume: number;
  total_fees: number;
  total_refunds: number;
  total_chargebacks: number;
  total_transactions: number;
  merchant_count: number;
}

interface CommissionMerchantSummary extends CommissionSummary {
  merchant_id: string;
}

interface CommissionResponse {
  month: string;
  year: string;
  commissions: CommissionEntry[];
  total_count: number;
  summary: CommissionSummary;
  merchant_summaries: CommissionMerchantSummary[];
  truncated: boolean;
}

type DatePreset = "7d" | "30d" | "60d" | "90d" | "this_month" | "last_month";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "7d",         label: "7 Days" },
  { value: "30d",        label: "30 Days" },
  { value: "60d",        label: "60 Days" },
  { value: "90d",        label: "90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
];

function fmtNmiDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function getDateRange(preset: DatePreset) {
  const now = new Date();
  switch (preset) {
    case "7d":  return { startDate: fmtNmiDate(subDays(now,7)), endDate: fmtNmiDate(now) };
    case "30d": return { startDate: fmtNmiDate(subDays(now,30)), endDate: fmtNmiDate(now) };
    case "60d": return { startDate: fmtNmiDate(subDays(now,60)), endDate: fmtNmiDate(now) };
    case "90d": return { startDate: fmtNmiDate(subDays(now,90)), endDate: fmtNmiDate(now) };
    case "this_month": return { startDate: fmtNmiDate(startOfMonth(now)), endDate: fmtNmiDate(now) };
    case "last_month": { const lm = subMonths(now,1); return { startDate: fmtNmiDate(startOfMonth(lm)), endDate: fmtNmiDate(endOfMonth(lm)) }; }
  }
}

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(160,84%,39%)", "hsl(38,92%,50%)",
  "hsl(263,70%,50%)", "hsl(350,89%,60%)", "hsl(175,77%,40%)", "hsl(217,91%,60%)",
];

const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(n);

function formatTxDate(dateStr: string) {
  try {
    const normalized = dateStr.includes("-") ? dateStr : dateStr.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6");
    return format(new Date(normalized), "MMM dd, yyyy HH:mm");
  } catch { return dateStr || "—"; }
}

function conditionBadge(condition: string) {
  const c = (condition || "").toLowerCase();
  if (["complete","pending","pendingsettlement","pending_settlement"].includes(c))
    return <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/5">Approved</Badge>;
  if (c === "failed")
    return <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive bg-destructive/5">Failed</Badge>;
  return <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/5">{condition || "Unknown"}</Badge>;
}

function typeBadge(type: string) {
  const t = (type || "").toLowerCase();
  if (t === "sale" || t === "capture") return <Badge variant="secondary" className="text-[10px]">Sale</Badge>;
  if (t === "refund" || t === "credit") return <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">Refund</Badge>;
  if (t === "void") return <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">Void</Badge>;
  if (t === "auth") return <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600 dark:text-blue-400">Auth</Badge>;
  return <Badge variant="outline" className="text-[10px]">{type || "—"}</Badge>;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const Transactions = () => {
  const isMobile = useIsMobile();
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<"date"|"amount">("date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [commMonth, setCommMonth] = useState(() => new Date().getMonth() + 1);
  const [commYear, setCommYear] = useState(() => new Date().getFullYear());
  const [merchantSyncing, setMerchantSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  useEffect(() => { setPage(1); }, [merchantFilter, typeFilter, statusFilter, search, datePreset, sortField, sortDir]);

  const { startDate, endDate } = getDateRange(datePreset);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["nmi-all-transactions", datePreset],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("nmi-transactions", {
        body: { mode: "all", start_date: startDate, end_date: endDate },
      });
      if (error) throw error;
      return result as AllModeResponse;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Commission data
  const { data: commData, isLoading: commLoading, isError: commError, refetch: commRefetch, isFetching: commFetching } = useQuery({
    queryKey: ["nmi-commissions", commMonth, commYear],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("nmi-commissions", {
        body: { month: commMonth, year: commYear },
      });
      if (error) throw error;
      return result as CommissionResponse;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const commissions = commData?.commissions || [];
  const commSummary = commData?.summary;
  const commMerchantSummaries = commData?.merchant_summaries || [];

  const txs = data?.transactions || [];
  const summary = data?.summary;
  const merchantSummaries = data?.merchant_summaries || [];

  // Filtered & sorted
  const filtered = useMemo(() => {
    let list = [...txs];
    if (merchantFilter !== "all") list = list.filter(t => t.merchant_id === merchantFilter);
    if (typeFilter !== "all") {
      const tf = typeFilter.toLowerCase();
      list = list.filter(t => (t.type || "").toLowerCase() === tf);
    }
    if (statusFilter === "approved") list = list.filter(t => ["complete","pending","pendingsettlement","pending_settlement"].includes((t.condition||"").toLowerCase()));
    else if (statusFilter === "declined") list = list.filter(t => !["complete","pending","pendingsettlement","pending_settlement"].includes((t.condition||"").toLowerCase()));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.customer_name.toLowerCase().includes(q) ||
        t.customer_email.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.last_four.includes(q) ||
        t.merchant_id.includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortField === "amount") {
        const diff = parseFloat(a.amount||"0") - parseFloat(b.amount||"0");
        return sortDir === "asc" ? diff : -diff;
      }
      const diff = new Date(a.date||0).getTime() - new Date(b.date||0).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
    return list;
  }, [txs, merchantFilter, typeFilter, statusFilter, search, sortField, sortDir]);

  // Transactions filtered by merchant (for analytics)
  const merchantFilteredTxs = useMemo(() => {
    if (merchantFilter === "all") return txs;
    return txs.filter(t => t.merchant_id === merchantFilter);
  }, [txs, merchantFilter]);

  // Chart: daily volume
  const dailyVolume = useMemo(() => {
    const map: Record<string, { date: string; volume: number; count: number }> = {};
    for (const tx of merchantFilteredTxs) {
      if (!tx.date) continue;
      const day = tx.date.substring(0, 10);
      if (!map[day]) map[day] = { date: day, volume: 0, count: 0 };
      map[day].volume += parseFloat(tx.amount || "0");
      map[day].count++;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [merchantFilteredTxs]);

  // Chart: type breakdown
  const typeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of merchantFilteredTxs) {
      const t = (tx.type || "other").toLowerCase();
      map[t] = (map[t] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [merchantFilteredTxs]);

  // Chart: card type breakdown
  const cardBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of merchantFilteredTxs) {
      const ct = tx.card_type || "Other";
      map[ct] = (map[ct] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [merchantFilteredTxs]);

  const toggleSort = (field: "date"|"amount") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  // Stats reflect the active filters (merchant, type, status, search)
  const filteredSummary = useMemo(() => {
    const approvedSet = new Set(["complete","pending","pendingsettlement","pending_settlement"]);
    const refundSet = new Set(["refund","credit"]);
    const s = { total_count: filtered.length, approved_count: 0, approved_amount: 0, refund_count: 0, refund_amount: 0, total_amount: 0 };
    for (const tx of filtered) {
      const amt = parseFloat(tx.amount || "0") || 0;
      s.total_amount += amt;
      if (approvedSet.has((tx.condition || "").toLowerCase())) {
        s.approved_count += 1;
        s.approved_amount += amt;
      }
      if (refundSet.has((tx.type || "").toLowerCase())) {
        s.refund_count += 1;
        s.refund_amount += amt;
      }
    }
    return s;
  }, [filtered]);

  const approvalRate = filteredSummary.total_count > 0
    ? ((filteredSummary.approved_count / filteredSummary.total_count) * 100).toFixed(1) : "0";

  // Lookup merchant names from CRM accounts first, then NMI boarding fallbacks
  const { data: merchantDirectory } = useQuery({
    queryKey: ["merchant-directory"],
    queryFn: async () => {
      const [{ data: accounts }, { data: boardings }] = await Promise.all([
        supabase
          .from("accounts")
          .select("nmi_merchant_id, name")
          .not("nmi_merchant_id", "is", null),
        supabase
          .from("nmi_boarding_submissions")
          .select("nmi_gateway_id, company_name, dba_name"),
      ]);

      const map: Record<string, string> = {};

      for (const account of accounts || []) {
        const merchantId = account.nmi_merchant_id?.trim();
        const merchantName = account.name?.trim();
        if (merchantId && merchantName) {
          map[merchantId] = merchantName;
        }
      }

      for (const boarding of boardings || []) {
        const merchantId = boarding.nmi_gateway_id?.trim();
        const merchantName = boarding.dba_name?.trim() || boarding.company_name?.trim() || "";
        if (merchantId && merchantName && !map[merchantId]) {
          map[merchantId] = merchantName;
        }
      }

      return map;
    },
    staleTime: 10 * 60 * 1000,
  });

  const merchantNames = merchantDirectory || {};
  const getMerchantLabel = useCallback((id: string) => merchantNames[id] || id, [merchantNames]);

  // CSV export
  const exportCSV = useCallback(() => {
    const headers = ["Date","Transaction ID","Merchant","Customer","Email","Type","Card","Last 4","Amount","Status","Authorization","AVS","CVV"];
    const rows = filtered.map(tx => [
      tx.date, tx.id, getMerchantLabel(tx.merchant_id), tx.customer_name, tx.customer_email,
      tx.type, tx.card_type, tx.last_four, tx.amount, tx.condition, tx.authorization, tx.avs_response, tx.cvv_response,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `transactions_${datePreset}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [filtered, datePreset, getMerchantLabel]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg shadow-md px-3 py-2 text-xs">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{typeof p.value === "number" && p.name.toLowerCase().includes("volume") ? formatCurrency(p.value) : p.value}</span></p>
        ))}
      </div>
    );
  };

  return (
    <AppLayout pageTitle="Transactions & Commission">
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={CreditCard}
          title="Transactions & Commission"
          description="Partner-wide NMI transaction data · Volume analytics · Commission reports"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={datePreset} onValueChange={v => setDatePreset(v as DatePreset)}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map(p => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={exportCSV} disabled={filtered.length === 0}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[...Array(5)].map((_,i) => <Skeleton key={i} className="h-20" />)}</div>
              <Skeleton className="h-64" />
            </div>
          ) : isError ? (
            <Card><CardContent className="p-8 text-center">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive/50" />
              <p className="text-sm text-muted-foreground">Failed to load transactions</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Retry</Button>
            </CardContent></Card>
          ) : (
            <>
              {/* ── KPI Cards ── */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center"><Activity className="h-3.5 w-3.5 text-primary" /></div>
                  </div>
                  <p className="text-xl font-bold">{filteredSummary.total_count}</p>
                  <p className="text-[10px] text-muted-foreground">Total Transactions</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-md bg-green-500/10 flex items-center justify-center"><CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /></div>
                  </div>
                  <p className="text-xl font-bold">{approvalRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Approval Rate</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center"><DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /></div>
                  </div>
                  <p className="text-xl font-bold truncate">{formatCurrency(filteredSummary.approved_amount)}</p>
                  <p className="text-[10px] text-muted-foreground">Approved Volume</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center"><ArrowDownRight className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /></div>
                  </div>
                  <p className="text-xl font-bold">{filteredSummary.refund_count}</p>
                  <p className="text-[10px] text-muted-foreground">Refunds ({formatCurrency(filteredSummary.refund_amount)})</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center"><Building2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /></div>
                  </div>
                  <p className="text-xl font-bold">{merchantSummaries.length}</p>
                  <p className="text-[10px] text-muted-foreground">Active Merchants</p>
                </CardContent></Card>
              </div>

              {/* ── Global merchant filter + Tabs ── */}
              <div className="flex flex-wrap items-center gap-3">
                <Select value={merchantFilter} onValueChange={setMerchantFilter}>
                  <SelectTrigger className="h-8 text-xs w-[180px]"><Building2 className="h-3 w-3 mr-1" /><SelectValue placeholder="All merchants" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Merchants</SelectItem>
                    {(data?.seen_merchant_ids || []).map(id => (
                      <SelectItem key={id} value={id} className="text-xs">
                        <span>{getMerchantLabel(id)}</span>
                        <span className="ml-1 text-muted-foreground font-mono text-[9px]">#{id}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {merchantFilter !== "all" && (
                  <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => setMerchantFilter("all")}>
                    {getMerchantLabel(merchantFilter)} <span className="text-muted-foreground">×</span>
                  </Badge>
                )}
              </div>

              <Tabs defaultValue="transactions" className="space-y-4">
                <TabsList className="bg-muted/50 p-0.5">
                  <TabsTrigger value="transactions" className="text-xs gap-1.5"><FileText className="h-3 w-3" />Transactions</TabsTrigger>
                  <TabsTrigger value="analytics" className="text-xs gap-1.5"><BarChart3 className="h-3 w-3" />Analytics</TabsTrigger>
                  <TabsTrigger value="merchants" className="text-xs gap-1.5"><Building2 className="h-3 w-3" />Merchants</TabsTrigger>
                  <TabsTrigger value="commission" className="text-xs gap-1.5"><Coins className="h-3 w-3" />Commission</TabsTrigger>
                </TabsList>

                {/* ── Transactions Tab ── */}
                <TabsContent value="transactions" className="space-y-4">
                  {/* Filters */}
                  <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Search name, email, ID, card…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue placeholder="All types" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All Types</SelectItem>
                        <SelectItem value="sale" className="text-xs">Sale</SelectItem>
                        <SelectItem value="auth" className="text-xs">Auth</SelectItem>
                        <SelectItem value="refund" className="text-xs">Refund</SelectItem>
                        <SelectItem value="void" className="text-xs">Void</SelectItem>
                        <SelectItem value="credit" className="text-xs">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue placeholder="All status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All Status</SelectItem>
                        <SelectItem value="approved" className="text-xs">Approved</SelectItem>
                        <SelectItem value="declined" className="text-xs">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                    const currentPage = Math.min(Math.max(1, page), totalPages);
                    const startIdx = (currentPage - 1) * PAGE_SIZE;
                    const endIdx = Math.min(startIdx + PAGE_SIZE, filtered.length);
                    const pageRows = filtered.slice(startIdx, endIdx);

                    const Pager = (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {filtered.length === 0 ? "0" : `${startIdx + 1}–${endIdx}`} of {filtered.length} transactions
                          {filtered.length !== txs.length && <span className="text-muted-foreground/60"> (filtered from {txs.length})</span>}
                        </p>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</Button>
                            <span className="text-xs text-muted-foreground px-2 tabular-nums">Page {currentPage} of {totalPages}</span>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <>
                        {Pager}
                        {filtered.length === 0 ? (
                          <Card><CardContent className="p-8 text-center">
                            <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium">No transactions found</p>
                            <p className="text-xs text-muted-foreground mt-1">Adjust filters or date range</p>
                          </CardContent></Card>
                        ) : isMobile ? (
                          <div className="space-y-2">
                            {pageRows.map((tx, idx) => (
                              <Card key={tx.id || idx} className="border-border/50">
                                <CardContent className="p-3 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold">${tx.amount || "0.00"}</span>
                                    <div className="flex items-center gap-1">{typeBadge(tx.type)}{conditionBadge(tx.condition)}</div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{tx.customer_name || "—"}</span>
                                    <span>{tx.card_type}{tx.last_four ? ` ···${tx.last_four}` : ""}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="text-[10px]">{getMerchantLabel(tx.merchant_id)} <span className="text-muted-foreground/60 font-mono">#{tx.merchant_id}</span></span>
                                    <span>{formatTxDate(tx.date)}</span>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <Card>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs w-10 text-right pr-2">#</TableHead>
                                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("date")}>
                                    <span className="flex items-center gap-1">Date {sortField==="date" && (sortDir==="desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}</span>
                                  </TableHead>
                                  <TableHead className="text-xs">Merchant</TableHead>
                                  <TableHead className="text-xs">Customer</TableHead>
                                  <TableHead className="text-xs">Type</TableHead>
                                  <TableHead className="text-xs">Card</TableHead>
                                  <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                                    <span className="flex items-center justify-end gap-1">Amount {sortField==="amount" && (sortDir==="desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}</span>
                                  </TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                  <TableHead className="text-xs w-8"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pageRows.map((tx, idx) => (
                                  <>
                                    <TableRow key={tx.id || idx} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}>
                                      <TableCell className="text-[11px] text-muted-foreground tabular-nums text-right pr-2">{startIdx + idx + 1}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTxDate(tx.date)}</TableCell>
                                      <TableCell className="text-xs max-w-[140px]">
                                        <p className="font-medium truncate">{getMerchantLabel(tx.merchant_id)}</p>
                                        <p className="text-[10px] text-muted-foreground font-mono">{tx.merchant_id}</p>
                                      </TableCell>
                                      <TableCell className="text-xs">{tx.customer_name || "—"}</TableCell>
                                      <TableCell>{typeBadge(tx.type)}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{tx.card_type}{tx.last_four ? ` ···${tx.last_four}` : ""}</TableCell>
                                      <TableCell className="text-xs text-right font-semibold">${tx.amount || "0.00"}</TableCell>
                                      <TableCell>{conditionBadge(tx.condition)}</TableCell>
                                      <TableCell><ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", expandedTx === tx.id && "rotate-180")} /></TableCell>
                                    </TableRow>
                                    {expandedTx === tx.id && (
                                      <TableRow key={`${tx.id}-detail`}>
                                        <TableCell colSpan={9} className="bg-muted/20 p-4">
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                            <div><span className="text-muted-foreground">Transaction ID</span><p className="font-mono font-medium">{tx.id}</p></div>
                                            <div><span className="text-muted-foreground">Authorization</span><p className="font-mono font-medium">{tx.authorization || "—"}</p></div>
                                            <div><span className="text-muted-foreground">Response</span><p className="font-medium">{tx.response_text || "—"} ({tx.response_code || "—"})</p></div>
                                            <div><span className="text-muted-foreground">Processor</span><p className="font-medium">{tx.processor_id || "—"}</p></div>
                                            <div><span className="text-muted-foreground">Email</span><p className="font-medium">{tx.customer_email || "—"}</p></div>
                                            <div><span className="text-muted-foreground">Billing</span><p className="font-medium">{[tx.billing_city, tx.billing_state, tx.billing_zip].filter(Boolean).join(", ") || "—"}</p></div>
                                            <div><span className="text-muted-foreground">AVS / CVV</span><p className="font-medium">{tx.avs_response || "—"} / {tx.cvv_response || "—"}</p></div>
                                            <div><span className="text-muted-foreground">IP Address</span><p className="font-mono font-medium">{tx.ip_address || "—"}</p></div>
                                            {tx.settlement_amount && <div><span className="text-muted-foreground">Settlement</span><p className="font-medium">${tx.settlement_amount} {tx.settlement_currency}</p></div>}
                                            {tx.subscription_id && <div><span className="text-muted-foreground">Subscription</span><p className="font-mono font-medium">{tx.subscription_id}</p></div>}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </>
                                ))}
                              </TableBody>
                            </Table>
                          </Card>
                        )}
                        {totalPages > 1 && filtered.length > 0 && Pager}
                      </>
                    );
                  })()}
                </TabsContent>

                {/* ── Analytics Tab ── */}
                <TabsContent value="analytics" className="space-y-4">
                  {merchantFilter !== "all" && (
                    <p className="text-xs text-muted-foreground">Showing analytics for <span className="font-semibold text-foreground">{getMerchantLabel(merchantFilter)}</span></p>
                  )}
                  <div className="grid lg:grid-cols-2 gap-4">
                    {/* Daily Volume */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Daily Volume</CardTitle></CardHeader>
                      <CardContent>
                        {dailyVolume.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={dailyVolume}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" tick={{ fontSize:10 }} tickFormatter={v => v.substring(5)} />
                              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                              <Tooltip content={<CustomTooltip />} />
                              <Bar dataKey="volume" name="Volume" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>

                    {/* Transaction Count Trend */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Transaction Count</CardTitle></CardHeader>
                      <CardContent>
                        {dailyVolume.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={dailyVolume}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" tick={{ fontSize:10 }} tickFormatter={v => v.substring(5)} />
                              <YAxis tick={{ fontSize:10 }} />
                              <Tooltip content={<CustomTooltip />} />
                              <Line type="monotone" dataKey="count" name="Transactions" stroke="hsl(160,84%,39%)" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>

                    {/* Type Breakdown */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowUpDown className="h-4 w-4" />Transaction Types</CardTitle></CardHeader>
                      <CardContent>
                        {typeBreakdown.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie data={typeBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                                {typeBreakdown.map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>

                    {/* Card Type Breakdown */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" />Card Types</CardTitle></CardHeader>
                      <CardContent>
                        {cardBreakdown.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie data={cardBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                                {cardBreakdown.map((_,i) => <Cell key={i} fill={CHART_COLORS[(i+3) % CHART_COLORS.length]} />)}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ── Merchants Tab ── */}
                <TabsContent value="merchants" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{merchantSummaries.length} merchants with activity in this period</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8"
                      onClick={async () => {
                        setMerchantSyncing(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('nmi-list-merchants');
                          if (error) throw error;
                          if (data?.error) throw new Error(data.error);
                          const count = data?.merchants?.length ?? data?.count ?? 0;
                          toast.success(`Merchant roster synced — ${count} merchants found`);
                          // Refresh transactions to pick up any new merchant data
                          refetch();
                        } catch (err: any) {
                          console.error('Merchant sync error:', err);
                          toast.error(err.message || 'Failed to sync merchants');
                        } finally {
                          setMerchantSyncing(false);
                        }
                      }}
                      disabled={merchantSyncing}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", merchantSyncing && "animate-spin")} />
                      {merchantSyncing ? 'Syncing…' : 'Sync Merchants'}
                    </Button>
                  </div>
                  {merchantSummaries.length === 0 ? (
                    <Card><CardContent className="p-8 text-center">
                      <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm font-medium">No merchant data</p>
                    </CardContent></Card>
                  ) : (
                    <>
                      {/* Merchant comparison charts */}
                      <div className="grid lg:grid-cols-2 gap-4">
                        {/* Volume comparison bar chart */}
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />Volume by Merchant</CardTitle></CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={merchantSummaries.sort((a,b) => b.approved_amount - a.approved_amount).map(ms => ({
                                name: getMerchantLabel(ms.merchant_id),
                                volume: ms.approved_amount,
                                id: ms.merchant_id,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="volume" name="Approved Volume" fill="hsl(160,84%,39%)" radius={[4,4,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        {/* Approval rate comparison */}
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Approval Rate by Merchant</CardTitle></CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={merchantSummaries.map(ms => ({
                                name: getMerchantLabel(ms.merchant_id),
                                rate: ms.total_count > 0 ? parseFloat(((ms.approved_count / ms.total_count)*100).toFixed(1)) : 0,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="rate" name="Approval Rate %" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        {/* Transaction count pie chart */}
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Transaction Share</CardTitle></CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                              <PieChart>
                                <Pie
                                  data={merchantSummaries.map(ms => ({ name: getMerchantLabel(ms.merchant_id), value: ms.transaction_count }))}
                                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                                  label={({ name, percent }) => `${name.length > 12 ? name.substring(0,12)+'…' : name} ${(percent*100).toFixed(0)}%`}
                                >
                                  {merchantSummaries.map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        {/* Refund comparison */}
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowDownRight className="h-4 w-4" />Refunds by Merchant</CardTitle></CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={merchantSummaries.filter(ms => ms.refund_count > 0).map(ms => ({
                                name: getMerchantLabel(ms.merchant_id),
                                refunds: ms.refund_amount,
                                count: ms.refund_count,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="refunds" name="Refund Volume" fill="hsl(350,89%,60%)" radius={[4,4,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Merchant detail cards */}
                      <div className="grid gap-3">
                        {merchantSummaries.sort((a,b) => b.approved_amount - a.approved_amount).map(ms => {
                          const rate = ms.total_count > 0 ? ((ms.approved_count / ms.total_count)*100).toFixed(1) : "0";
                          return (
                            <Card key={ms.merchant_id} className="border-border/60">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <p className="text-sm font-semibold">{getMerchantLabel(ms.merchant_id)}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">Merchant ID: {ms.merchant_id}</p>
                                  </div>
                                  <Badge variant="outline" className="text-[10px]">{ms.transaction_count} txns</Badge>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">Approved Vol.</p>
                                    <p className="font-bold text-green-600 dark:text-green-400">{formatCurrency(ms.approved_amount)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Approval Rate</p>
                                    <p className={cn("font-bold", parseFloat(rate) >= 90 ? "text-green-600 dark:text-green-400" : parseFloat(rate) >= 70 ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>{rate}%</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Declined</p>
                                    <p className="font-bold text-destructive">{ms.declined_count}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Refunds</p>
                                    <p className="font-bold">{ms.refund_count} ({formatCurrency(ms.refund_amount)})</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Voids</p>
                                    <p className="font-bold">{ms.void_count}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* ── Commission Tab ── */}
                <TabsContent value="commission" className="space-y-4">
                  {/* Month/Year selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={String(commMonth)} onValueChange={v => setCommMonth(Number(v))}>
                      <SelectTrigger className="h-8 text-xs w-[120px]"><Calendar className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i) => (
                          <SelectItem key={i+1} value={String(i+1)} className="text-xs">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={String(commYear)} onValueChange={v => setCommYear(Number(v))}>
                      <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[2023,2024,2025,2026].map(y => (
                          <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => commRefetch()} disabled={commFetching}>
                      <RefreshCw className={cn("h-3.5 w-3.5", commFetching && "animate-spin")} /> Refresh
                    </Button>
                  </div>

                  {commLoading ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-20" />)}</div>
                      <Skeleton className="h-64" />
                    </div>
                  ) : commError ? (
                    <Card><CardContent className="p-8 text-center">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive/50" />
                      <p className="text-sm text-muted-foreground">Failed to load commission data</p>
                      <p className="text-xs text-muted-foreground mt-1">The commission API may require additional partner permissions</p>
                      <Button variant="outline" size="sm" onClick={() => commRefetch()} className="mt-3">Retry</Button>
                    </CardContent></Card>
                  ) : (
                    <>
                      {/* Commission KPI Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Card><CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center"><Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /></div>
                          </div>
                          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(commSummary?.total_commission ?? 0)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Commission</p>
                        </CardContent></Card>
                        <Card><CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center"><DollarSign className="h-3.5 w-3.5 text-primary" /></div>
                          </div>
                          <p className="text-xl font-bold">{formatCurrency(commSummary?.total_volume ?? 0)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Volume</p>
                        </CardContent></Card>
                        <Card><CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center"><Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /></div>
                          </div>
                          <p className="text-xl font-bold">{formatCurrency(commSummary?.total_fees ?? 0)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Fees</p>
                        </CardContent></Card>
                        <Card><CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center"><Building2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /></div>
                          </div>
                          <p className="text-xl font-bold">{commSummary?.merchant_count ?? 0}</p>
                          <p className="text-[10px] text-muted-foreground">Merchants</p>
                        </CardContent></Card>
                      </div>

                      {/* Commission charts */}
                      {commMerchantSummaries.length > 0 && (
                        <div className="grid lg:grid-cols-2 gap-4">
                          <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Coins className="h-4 w-4" />Commission by Merchant</CardTitle></CardHeader>
                            <CardContent>
                              <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={commMerchantSummaries.sort((a,b) => b.total_commission - a.total_commission).map(ms => ({
                                  name: getMerchantLabel(ms.merchant_id),
                                  commission: ms.total_commission,
                                }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Bar dataKey="commission" name="Commission" fill="hsl(160,84%,39%)" radius={[4,4,0,0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Volume by Merchant</CardTitle></CardHeader>
                            <CardContent>
                              <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={commMerchantSummaries.sort((a,b) => b.total_volume - a.total_volume).map(ms => ({
                                  name: getMerchantLabel(ms.merchant_id),
                                  volume: ms.total_volume,
                                }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Bar dataKey="volume" name="Volume" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Commission merchant detail cards */}
                      {commissions.length === 0 ? (
                        <Card><CardContent className="p-8 text-center">
                          <Coins className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm font-medium">No commission data for this period</p>
                          <p className="text-xs text-muted-foreground mt-1">Try selecting a different month</p>
                        </CardContent></Card>
                      ) : (
                        <div className="grid gap-3">
                          {commMerchantSummaries.sort((a,b) => b.total_commission - a.total_commission).map(ms => (
                            <Card key={ms.merchant_id} className="border-border/60">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <p className="text-sm font-semibold">{getMerchantLabel(ms.merchant_id)}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">Merchant ID: {ms.merchant_id}</p>
                                  </div>
                                  <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(ms.total_commission)}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">Commission</p>
                                    <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(ms.total_commission)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Volume</p>
                                    <p className="font-bold">{formatCurrency(ms.total_volume)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Transactions</p>
                                    <p className="font-bold">{ms.total_transactions}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Fees</p>
                                    <p className="font-bold">{formatCurrency(ms.total_fees)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Refunds</p>
                                    <p className="font-bold">{formatCurrency(ms.total_refunds)}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Transactions;