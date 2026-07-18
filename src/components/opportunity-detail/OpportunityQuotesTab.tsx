// Quotes tab for the Opportunity detail view.
//
// Surfaces every (non-archived) quote tied to this opportunity — draft, sent,
// accepted, rejected, expired — with status, pricing, and the relevant date.
// Accepted quotes get a one-click "Generate Contract" (the same MSA dialog the
// global Quote Builder uses). Sent quotes expose a "Copy accept link" so a rep
// can re-share the merchant acceptance URL.
//
// The quote↔opportunity link lives on quotes.opportunity_id, set when a quote
// is generated from the opportunity. Archived quotes are excluded.

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  GenerateContractDialog,
  type AcceptanceRow,
} from "@/components/pricing/AcceptedQuotesPanel";

interface QuoteRow {
  id: string;
  quote_number: string;
  status: string;
  tier_name: string | null;
  billing_cycle: string | null;
  monthly_resale: number | null;
  annual_resale: number | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  acceptance_token: string | null;
}

const QUOTE_COLUMNS =
  "id, quote_number, status, tier_name, billing_cycle, monthly_resale, annual_resale, created_at, sent_at, accepted_at, rejected_at, acceptance_token";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  accepted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

/** The most meaningful date to show per status. */
const statusDate = (q: QuoteRow) => {
  switch (q.status) {
    case "accepted":
      return { label: "Accepted", value: q.accepted_at ?? q.created_at };
    case "rejected":
      return { label: "Rejected", value: q.rejected_at ?? q.created_at };
    case "sent":
      return { label: "Sent", value: q.sent_at ?? q.created_at };
    default:
      return { label: "Created", value: q.created_at };
  }
};

interface OpportunityQuotesTabProps {
  opportunityId: string;
  /** Opens the Quote Generator for this opportunity (wired by the modal). */
  onNewQuote?: () => void;
}

export const OpportunityQuotesTab = ({
  opportunityId,
  onNewQuote,
}: OpportunityQuotesTabProps) => {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [acceptances, setAcceptances] = useState<Record<string, AcceptanceRow>>({});
  const [loading, setLoading] = useState(true);
  const [contractFor, setContractFor] = useState<AcceptanceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [quoteRes, acceptRes] = await Promise.all([
      supabase
        .from("quotes")
        .select(QUOTE_COLUMNS)
        .eq("opportunity_id", opportunityId)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("quote_acceptance_summary")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .eq("status", "accepted")
        .is("archived_at", null),
    ]);
    if (quoteRes.error) {
      toast.error(`Failed to load quotes: ${quoteRes.error.message}`);
      setRows([]);
    } else {
      setRows((quoteRes.data as unknown as QuoteRow[]) ?? []);
    }
    if (!acceptRes.error && acceptRes.data) {
      const map: Record<string, AcceptanceRow> = {};
      for (const a of acceptRes.data as unknown as AcceptanceRow[]) {
        if (a.quote_id) map[a.quote_id] = a;
      }
      setAcceptances(map);
    }
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyAcceptLink = async (token: string) => {
    const url = `${window.location.origin}/q/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Acceptance link copied.");
    } catch {
      toast.error("Couldn't copy — link: " + url);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Quotes
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quotes generated for this opportunity. Accepted quotes can be turned
            into a Merchant Services Agreement here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNewQuote && (
            <Button size="sm" onClick={onNewQuote} className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New quote
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-8 w-8 p-0"
            aria-label="Refresh quotes"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No quotes for this opportunity yet.
          </p>
          {onNewQuote && (
            <Button size="sm" variant="outline" onClick={onNewQuote} className="mt-3">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Generate a quote
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-semibold">Quote</th>
                <th className="text-left py-2 px-3 font-semibold">Status</th>
                <th className="text-left py-2 px-3 font-semibold">Plan</th>
                <th className="text-right py-2 px-3 font-semibold">Monthly</th>
                <th className="text-left py-2 px-3 font-semibold">Date</th>
                <th className="text-right py-2 px-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const d = statusDate(q);
                const acceptance = acceptances[q.id];
                return (
                  <tr key={q.id} className="border-b last:border-b-0">
                    <td className="py-3 px-3 font-mono text-xs">{q.quote_number}</td>
                    <td className="py-3 px-3">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] capitalize ${STATUS_STYLE[q.status] ?? ""}`}
                      >
                        {q.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium">{q.tier_name ?? "—"}</span>
                      <span className="text-[11px] text-muted-foreground ml-1.5">
                        {q.billing_cycle === "annual" ? "Annual" : "Monthly"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium">
                      {fmt(Number(q.monthly_resale ?? 0))}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="text-[10px] uppercase tracking-wide">
                        {d.label}
                      </span>
                      <br />
                      {formatDate(d.value)}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {q.status === "accepted" && acceptance ? (
                        <Button
                          size="sm"
                          onClick={() => setContractFor(acceptance)}
                          className="bg-neutral-900 hover:bg-neutral-800 text-white border-l-[3px] border-l-[#c81030] h-8"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Generate Contract
                        </Button>
                      ) : q.status === "sent" && q.acceptance_token ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyAcceptLink(q.acceptance_token!)}
                          className="h-8"
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1.5" /> Copy accept link
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {contractFor && (
        <GenerateContractDialog
          summary={contractFor}
          onClose={() => {
            setContractFor(null);
            void load();
          }}
        />
      )}
    </div>
  );
};
