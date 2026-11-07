// Lists quotes that have been generated and sent but NOT accepted (sent,
// rejected, expired) and lets a rep void or delete one — e.g. a quote sent
// with the wrong pricing, to the wrong merchant, or superseded by a newer one.
//
// Void keeps the row (status 'void', stamped by the DB) and the merchant's
// /q/:token link then shows "withdrawn". Delete removes it outright and the
// link returns "not found". Accepted quotes are voided from the Accepted
// panel and never deleted: deleting cascades away the `quote_acceptances`
// row, which is the signed audit record of the merchant's acceptance.

import { useCallback, useEffect, useState } from "react";
import { Ban, Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { voidConfirmDescription } from "@/lib/quote-schema";

type SentQuote = {
  id: string;
  quote_number: string;
  status: string;
  tier_id: string;
  tier_name: string | null;
  billing_cycle: string | null;
  monthly_resale: number | null;
  client_business_name: string | null;
  client_email: string | null;
  sent_at: string | null;
  created_at: string;
  valid_until: string | null;
};

const COLUMNS =
  "id, quote_number, status, tier_id, tier_name, billing_cycle, monthly_resale, client_business_name, client_email, sent_at, created_at, valid_until";

// Statuses that can be deleted from this panel. Drafts have their own panel;
// accepted quotes are protected (see header comment).
const DELETABLE_STATUSES = ["sent", "rejected", "expired"];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

const isPastValidity = (q: SentQuote) =>
  !!q.valid_until && new Date(q.valid_until).getTime() < Date.now();

const statusLabel = (q: SentQuote) => {
  if (q.status === "sent" && isPastValidity(q)) return "Lapsed";
  return q.status.charAt(0).toUpperCase() + q.status.slice(1);
};

const statusClass = (q: SentQuote) =>
  q.status === "sent" && !isPastValidity(q)
    ? "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10"
    : "border-slate-400/40 text-slate-500 dark:text-slate-400 bg-slate-400/10";

interface SentQuotesPanelProps {
  /** Bump to force a reload (e.g. after the generator dialog sends a quote). */
  refreshSignal?: number;
}

export function SentQuotesPanel({ refreshSignal }: SentQuotesPanelProps) {
  const [rows, setRows] = useState<SentQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, setPending] = useState<SentQuote | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [pendingVoid, setPendingVoid] = useState<SentQuote | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select(COLUMNS)
      .in("status", DELETABLE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(`Failed to load sent quotes: ${error.message}`);
    } else {
      setRows((data as unknown as SentQuote[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handleDelete = async (quote: SentQuote) => {
    setPending(null);
    setDeletingId(quote.id);
    // The status filter means a quote the merchant accepted since this list
    // loaded is NOT deleted — its signed acceptance record survives.
    const { data, error } = await supabase
      .from("quotes")
      .delete()
      .eq("id", quote.id)
      .in("status", DELETABLE_STATUSES)
      .select("id");
    setDeletingId(null);
    if (error) {
      toast.error(`Couldn't delete quote: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error(`${quote.quote_number} was accepted in the meantime, so it was not deleted.`);
      void load();
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== quote.id));
    toast.success(`${quote.quote_number} deleted.`);
  };

  const handleVoid = async (quote: SentQuote) => {
    setPendingVoid(null);
    setVoidingId(quote.id);
    // Only the statuses this panel lists: a quote accepted since the list
    // loaded is voided from the Accepted panel, where the earnings warning is.
    const { data, error } = await supabase
      .from("quotes")
      .update({ status: "void" })
      .eq("id", quote.id)
      .in("status", DELETABLE_STATUSES)
      .select("id");
    setVoidingId(null);
    if (error) {
      toast.error(`Couldn't void quote: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error(`${quote.quote_number} changed in the meantime, so it was not voided.`);
      void load();
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== quote.id));
    toast.success(`${quote.quote_number} voided — its acceptance link now shows it as withdrawn.`);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Sent quotes
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Quotes that went out and haven't been accepted. Void one that was sent in
            error (kept for the record) or delete it — either way its acceptance link
            stops working immediately.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Refresh sent quotes">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No outstanding sent quotes.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 font-semibold">Quote</th>
                <th className="text-left py-2 font-semibold">Merchant</th>
                <th className="text-left py-2 font-semibold">Plan</th>
                <th className="text-right py-2 font-semibold">Monthly</th>
                <th className="text-left py-2 font-semibold">Sent</th>
                <th className="text-left py-2 font-semibold">Status</th>
                <th className="text-right py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="py-3 font-mono text-xs">{r.quote_number}</td>
                  <td className="py-3">
                    <div className="font-medium">{r.client_business_name || "Untitled"}</div>
                    {r.client_email && (
                      <div className="text-[11px] text-muted-foreground">{r.client_email}</div>
                    )}
                  </td>
                  <td className="py-3">
                    <Badge variant="secondary" className="text-[10px]">
                      {r.tier_name ?? r.tier_id}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground ml-1.5">
                      {r.billing_cycle === "annual" ? "Annual" : "Monthly"}
                    </span>
                  </td>
                  <td className="py-3 text-right font-medium">
                    {fmt(Number(r.monthly_resale ?? 0))}
                  </td>
                  <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(r.sent_at ?? r.created_at)}
                  </td>
                  <td className="py-3">
                    <Badge variant="outline" className={cn("text-[10px]", statusClass(r))}>
                      {statusLabel(r)}
                    </Badge>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingVoid(r)}
                      disabled={voidingId === r.id || deletingId === r.id}
                      className="h-8 px-2 text-muted-foreground hover:text-destructive"
                      aria-label={`Void ${r.quote_number}`}
                    >
                      {voidingId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1 text-xs">Void</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPending(r)}
                      disabled={deletingId === r.id || voidingId === r.id}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${r.quote_number}`}
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!pendingVoid} onOpenChange={(o) => !o && setPendingVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {pendingVoid?.quote_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingVoid &&
                voidConfirmDescription({
                  quoteNumber: pendingVoid.quote_number,
                  businessName: pendingVoid.client_business_name,
                  status: pendingVoid.status,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingVoid && handleVoid(pendingVoid)}
            >
              Void quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pending?.quote_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the quote for{" "}
              {pending?.client_business_name || "this merchant"}. If it was emailed, the
              merchant's acceptance link will stop working. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pending && handleDelete(pending)}
            >
              Delete quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
