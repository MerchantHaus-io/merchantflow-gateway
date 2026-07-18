// Quotes & Contracts — opportunity-centric status board.
//
// One row per opportunity showing whether a quote exists, whether it's been
// sent / is out for signature, the quote number, when it was created, when it
// was sent, and when it was accepted & signed (with the signatory). A
// "contract" is an accepted quote (quotes.status = 'accepted' + an immutable
// quote_acceptances audit row) — there is no separate contracts table.
//
// Data: opportunities ← quotes (opportunity_id) ← quote_acceptance_summary
// (latest acceptance per quote). When an opportunity has multiple quotes we
// surface the most advanced one (accepted > sent > draft > rejected/expired),
// tie-broken by most recent.

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_CONFIG, OpportunityStage } from "@/types/opportunity";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { SortableTableHead } from "@/components/SortableTableHead";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FileSignature, Search, CheckCircle2, Send, FileX } from "lucide-react";

// ─── Status model ──────────────────────────────────────────────────────────
type QuoteState =
  | "none"
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

const STATE_LABEL: Record<QuoteState, string> = {
  none: "No quote",
  draft: "Draft",
  sent: "Out for signature",
  accepted: "Accepted & Signed",
  rejected: "Rejected",
  expired: "Expired",
};

// Higher = more advanced; used to pick the "primary" quote per opportunity.
const STATE_RANK: Record<QuoteState, number> = {
  accepted: 5,
  sent: 4,
  draft: 3,
  rejected: 2,
  expired: 1,
  none: 0,
};

const STATE_BADGE: Record<QuoteState, string> = {
  none: "bg-muted text-muted-foreground",
  draft: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/30",
  sent: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30",
  accepted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
  rejected: "bg-destructive/10 text-destructive border border-destructive/30",
  expired: "bg-neutral-500/10 text-neutral-500 border border-neutral-500/30",
};

interface QuoteRow {
  id: string;
  opportunity_id: string | null;
  quote_number: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  valid_until: string | null;
  tier_name: string;
  monthly_resale: number;
}

interface AcceptanceRow {
  quote_id: string;
  signatory_name: string | null;
  signatory_title: string | null;
  accepted_at: string | null;
}

interface OppRow {
  id: string;
  stage: OpportunityStage;
  status: string | null;
  service_type: string | null;
  assigned_to: string | null;
  updated_at: string;
  account: { name: string | null } | null;
}

interface BoardRow {
  oppId: string;
  merchant: string;
  stage: OpportunityStage;
  owner: string;
  state: QuoteState;
  quoteNumber: string | null;
  quoteCount: number;
  createdAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  signatory: string | null;
  monthlyResale: number | null;
}

const normalizeState = (s: string | null | undefined): QuoteState => {
  switch (s) {
    case "draft":
    case "sent":
    case "accepted":
    case "rejected":
    case "expired":
      return s;
    default:
      return "draft";
  }
};

const fmtDate = (iso: string | null) =>
  iso ? format(new Date(iso), "MMM d, yyyy") : "—";
const fmtDateTime = (iso: string | null) =>
  iso ? format(new Date(iso), "MMM d, yyyy · h:mm a") : "—";

type SortField = "merchant" | "stage" | "state" | "created" | "sent" | "signed";

export default function QuotesContracts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BoardRow[]>([]);

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<QuoteState | "all" | "has_quote">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oppRes, quoteRes, acceptRes] = await Promise.all([
        supabase
          .from("opportunities")
          .select("id, stage, status, service_type, assigned_to, updated_at, account:accounts(name)")
          .order("updated_at", { ascending: false }),
        supabase
          .from("quotes")
          .select(
            "id, opportunity_id, quote_number, status, created_at, sent_at, accepted_at, rejected_at, valid_until, tier_name, monthly_resale",
          )
          .not("opportunity_id", "is", null)
          .is("archived_at", null),
        supabase
          .from("quote_acceptance_summary")
          .select("quote_id, signatory_name, signatory_title, accepted_at"),
      ]);

      if (oppRes.error) throw oppRes.error;
      if (quoteRes.error) throw quoteRes.error;
      if (acceptRes.error) throw acceptRes.error;

      const opps = (oppRes.data ?? []) as unknown as OppRow[];
      const quotes = (quoteRes.data ?? []) as unknown as QuoteRow[];
      const accepts = (acceptRes.data ?? []) as unknown as AcceptanceRow[];

      const acceptByQuote = new Map<string, AcceptanceRow>();
      for (const a of accepts) if (a.quote_id) acceptByQuote.set(a.quote_id, a);

      const quotesByOpp = new Map<string, QuoteRow[]>();
      for (const q of quotes) {
        if (!q.opportunity_id) continue;
        const list = quotesByOpp.get(q.opportunity_id) ?? [];
        list.push(q);
        quotesByOpp.set(q.opportunity_id, list);
      }

      const board: BoardRow[] = opps.map((o) => {
        const qs = quotesByOpp.get(o.id) ?? [];
        // Choose the most-advanced quote, tie-broken by most recent.
        const primary = qs
          .slice()
          .sort((a, b) => {
            const ra = STATE_RANK[normalizeState(a.status)];
            const rb = STATE_RANK[normalizeState(b.status)];
            if (rb !== ra) return rb - ra;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })[0];

        const state: QuoteState = primary ? normalizeState(primary.status) : "none";
        const accept = primary ? acceptByQuote.get(primary.id) : undefined;

        return {
          oppId: o.id,
          merchant: o.account?.name || "Untitled merchant",
          stage: o.stage,
          owner: o.assigned_to || "Unassigned",
          state,
          quoteNumber: primary?.quote_number ?? null,
          quoteCount: qs.length,
          createdAt: primary?.created_at ?? null,
          sentAt: primary?.sent_at ?? null,
          acceptedAt: accept?.accepted_at ?? primary?.accepted_at ?? null,
          signatory: accept?.signatory_name ?? null,
          monthlyResale: primary?.monthly_resale ?? null,
        };
      });

      setRows(board);
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const owners = useMemo(
    () => Array.from(new Set(rows.map((r) => r.owner))).sort(),
    [rows],
  );

  const stats = useMemo(() => {
    const total = rows.length;
    const withQuote = rows.filter((r) => r.state !== "none").length;
    const outForSig = rows.filter((r) => r.state === "sent").length;
    const signed = rows.filter((r) => r.state === "accepted").length;
    return { total, withQuote, outForSig, signed };
  }, [rows]);

  const handleSort = (field: string) => {
    const f = field as SortField;
    if (sortField === f) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(f);
      setSortDirection("desc");
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (stateFilter === "has_quote" && r.state === "none") return false;
      if (stateFilter !== "all" && stateFilter !== "has_quote" && r.state !== stateFilter) return false;
      if (ownerFilter !== "all" && r.owner !== ownerFilter) return false;
      if (q) {
        const hay = `${r.merchant} ${r.quoteNumber ?? ""} ${r.signatory ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    list = list.slice().sort((a, b) => {
      switch (sortField) {
        case "merchant":
          return a.merchant.localeCompare(b.merchant) * dir;
        case "stage":
          return a.stage.localeCompare(b.stage) * dir;
        case "state":
          return (STATE_RANK[a.state] - STATE_RANK[b.state]) * dir;
        case "sent":
          return (
            ((a.sentAt ? new Date(a.sentAt).getTime() : 0) -
              (b.sentAt ? new Date(b.sentAt).getTime() : 0)) *
            dir
          );
        case "signed":
          return (
            ((a.acceptedAt ? new Date(a.acceptedAt).getTime() : 0) -
              (b.acceptedAt ? new Date(b.acceptedAt).getTime() : 0)) *
            dir
          );
        case "created":
        default:
          return (
            ((a.createdAt ? new Date(a.createdAt).getTime() : 0) -
              (b.createdAt ? new Date(b.createdAt).getTime() : 0)) *
            dir
          );
      }
    });
    return list;
  }, [rows, search, stateFilter, ownerFilter, sortField, sortDirection]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        <PageHeader
          icon={FileSignature}
          title="Quotes & Contracts"
          description="Quote and signature status across every opportunity"
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* Summary chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatChip icon={FileSignature} label="Opportunities" value={stats.total} />
            <StatChip icon={FileSignature} label="With a quote" value={stats.withQuote} tone="primary" />
            <StatChip icon={Send} label="Out for signature" value={stats.outForSig} tone="warning" />
            <StatChip icon={CheckCircle2} label="Accepted & signed" value={stats.signed} tone="success" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchant, quote #, signatory…"
                className="pl-8"
              />
            </div>
            <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as typeof stateFilter)}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="has_quote">Has a quote</SelectItem>
                <SelectItem value="none">No quote</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Out for signature</SelectItem>
                <SelectItem value="accepted">Accepted &amp; Signed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {error ? (
            <QueryErrorCard message={error} onRetry={load} />
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={FileX}
              title="No matching opportunities"
              description="Adjust the filters, or generate a quote from an opportunity to see it here."
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead field="merchant" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      Merchant
                    </SortableTableHead>
                    <SortableTableHead field="stage" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      Stage
                    </SortableTableHead>
                    <TableHead className="text-xs">Quote?</TableHead>
                    <TableHead className="text-xs">Quote #</TableHead>
                    <SortableTableHead field="state" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      Status
                    </SortableTableHead>
                    <SortableTableHead field="created" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      Created
                    </SortableTableHead>
                    <SortableTableHead field="sent" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      Sent
                    </SortableTableHead>
                    <SortableTableHead field="signed" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      Accepted &amp; signed
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => {
                    const stage = STAGE_CONFIG[r.stage] ?? STAGE_CONFIG.discovery;
                    return (
                      <TableRow
                        key={r.oppId}
                        className="cursor-pointer"
                        onClick={() => navigate(`/opportunities/${r.oppId}`)}
                      >
                        <TableCell className="font-medium">
                          {r.merchant}
                          <div className="text-[11px] text-muted-foreground">{r.owner}</div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className={cn("w-2 h-2 rounded-full", stage.colorClass)} />
                            {stage.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {r.state === "none" ? (
                            <Badge variant="outline" className="text-muted-foreground">No</Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">
                              Yes{r.quoteCount > 1 ? ` ·${r.quoteCount}` : ""}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.quoteNumber ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", STATE_BADGE[r.state])}>
                            {STATE_LABEL[r.state]}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(r.sentAt)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.acceptedAt ? (
                            <div>
                              <div className="text-foreground">{fmtDateTime(r.acceptedAt)}</div>
                              {r.signatory && (
                                <div className="text-[11px] text-muted-foreground">by {r.signatory}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: typeof FileSignature;
  label: string;
  value: number;
  tone?: "muted" | "primary" | "warning" | "success";
}) {
  const toneCls = {
    muted: "text-muted-foreground",
    primary: "text-primary",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <Icon className={cn("h-4 w-4", toneCls)} />
      <div>
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}
