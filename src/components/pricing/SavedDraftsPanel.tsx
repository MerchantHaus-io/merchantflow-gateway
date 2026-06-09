// Lists saved DRAFT quotes and lets the rep reopen one to keep editing, or
// delete it. Drafts are written by the QuoteGenerator (auto-save + the explicit
// "Save draft" button); this panel is the "edit later" entry point.

import { useCallback, useEffect, useState } from "react";
import { FilePenLine, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { DraftQuote } from "@/components/pricing/QuoteGeneratorDialog";

const DRAFT_COLUMNS =
  "id, quote_number, acceptance_token, created_at, updated_at, tier_id, tier_name, billing_cycle, status, monthly_resale, opportunity_id, account_id, contact_id, client_business_name, client_contact_name, client_email, client_phone, client_monthly_volume, client_average_ticket, client_notes, sender_name, sender_title, sender_company, sender_email, sender_phone, lines_snapshot, extras_snapshot";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const formatUpdatedAt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

interface SavedDraftsPanelProps {
  /** Reopen a draft in the QuoteGenerator for continued editing. */
  onEdit: (draft: DraftQuote) => void;
  /** Bump to force a reload (e.g. after the generator dialog closes). */
  refreshSignal?: number;
}

export function SavedDraftsPanel({ onEdit, refreshSignal }: SavedDraftsPanelProps) {
  const [rows, setRows] = useState<DraftQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select(DRAFT_COLUMNS)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) {
      toast.error(`Failed to load drafts: ${error.message}`);
    } else {
      setRows((data as unknown as DraftQuote[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handleDelete = async (draft: DraftQuote) => {
    const label = draft.client_business_name || draft.quote_number;
    if (!window.confirm(`Delete draft for "${label}"? This can't be undone.`)) {
      return;
    }
    setDeletingId(draft.id);
    const { error } = await supabase.from("quotes").delete().eq("id", draft.id);
    setDeletingId(null);
    if (error) {
      toast.error(`Couldn't delete draft: ${error.message}`);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== draft.id));
    toast.success("Draft deleted.");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FilePenLine className="h-4 w-4 text-primary" />
            Saved drafts
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pick up an unfinished quote where you left off. Drafts are saved
            automatically as you build, and whenever you hit “Save draft”.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No saved drafts yet. Start a quote above — it'll be saved here so you
          can finish it later.
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
                <th className="text-left py-2 font-semibold">Last edited</th>
                <th className="text-right py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="py-3 font-mono text-xs">{r.quote_number}</td>
                  <td className="py-3">
                    <div className="font-medium">
                      {r.client_business_name || "Untitled"}
                    </div>
                    {r.client_email && (
                      <div className="text-[11px] text-muted-foreground">
                        {r.client_email}
                      </div>
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
                    {formatUpdatedAt(r.updated_at ?? r.created_at)}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(r)}
                      className="h-8 mr-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Continue
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete draft"
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
    </section>
  );
}
