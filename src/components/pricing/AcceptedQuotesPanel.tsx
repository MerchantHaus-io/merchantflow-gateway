// Lists accepted-but-not-yet-contracted quotes and lets the operator
// generate the Merchant Services Agreement PDF in one click. The PDF is
// pre-stamped with the acceptance audit (signatory, IP, fee-schedule hash,
// terms version) so it can be downloaded and sent without further editing.

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { confirmAutoEmail } from "@/components/EmailSendConfirm";
import {
  buildMerchantServicesAgreementPdf,
  type MsaPdfInput,
} from "@/lib/quotePdf";
import { QUOTE_TERMS_VERSION } from "@/config/quoteSchedule";
import { asArray } from "@/lib/utils";

interface AcceptanceRow {
  quote_id: string;
  quote_number: string;
  status: string;
  client_business_name: string | null;
  sender_email: string | null;
  acceptance_id: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  signatory_email: string | null;
  accepted_at: string | null;
  ach_authorized: boolean | null;
  terms_version: string | null;
  ip_address: string | null;
  fee_schedule_hash: string | null;
}

interface FullQuote {
  id: string;
  quote_number: string;
  tier_name: string;
  billing_cycle: "monthly" | "annual";
  monthly_resale: number;
  annual_resale: number;
  client_business_name: string | null;
  client_contact_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  sender_name: string | null;
  sender_title: string | null;
  sender_company: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  lines_snapshot: Array<{
    id: string;
    label: string;
    description: string;
    resale: number;
    bundled: boolean;
    enabled: boolean;
    perEvent?: { label: string; resale: number };
  }>;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const formatAcceptedAt = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function AcceptedQuotesPanel() {
  const [rows, setRows] = useState<AcceptanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_acceptance_summary")
      .select("*")
      .eq("status", "accepted")
      .order("accepted_at", { ascending: false })
      .limit(20);
    if (error) {
      toast.error(`Failed to load accepted quotes: ${error.message}`);
    } else {
      setRows((data as AcceptanceRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const active = useMemo(
    () => rows.find((r) => r.quote_id === activeQuoteId) ?? null,
    [rows, activeQuoteId],
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Accepted — ready for contract
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Generate the Merchant Services Agreement (pre-stamped with the acceptance audit)
            and send it to the merchant.
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
          No accepted quotes yet. They appear here as soon as the merchant signs
          via the public acceptance link.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 font-semibold">Quote</th>
                <th className="text-left py-2 font-semibold">Merchant</th>
                <th className="text-left py-2 font-semibold">Signatory</th>
                <th className="text-left py-2 font-semibold">Accepted</th>
                <th className="text-right py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.quote_id} className="border-b last:border-b-0">
                  <td className="py-3 font-mono text-xs">{r.quote_number}</td>
                  <td className="py-3">
                    <div className="font-medium">
                      {r.client_business_name ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.ach_authorized && (
                        <Badge variant="secondary" className="text-[9px] mr-1">
                          ACH on file
                        </Badge>
                      )}
                      Terms {r.terms_version ?? "—"}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="text-sm">{r.signatory_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.signatory_title || r.signatory_email}
                    </div>
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">
                    {formatAcceptedAt(r.accepted_at)}
                  </td>
                  <td className="py-3 text-right">
                    <Button
                      size="sm"
                      onClick={() => setActiveQuoteId(r.quote_id)}
                      className="bg-neutral-900 hover:bg-neutral-800 text-white border-l-[3px] border-l-[#c81030] h-8"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5" /> Generate Contract
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <GenerateContractDialog
          summary={active}
          onClose={() => setActiveQuoteId(null)}
        />
      )}
    </section>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────

function GenerateContractDialog({
  summary,
  onClose,
}: {
  summary: AcceptanceRow;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<FullQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          "id, quote_number, tier_name, billing_cycle, monthly_resale, annual_resale, client_business_name, client_contact_name, client_email, client_phone, sender_name, sender_title, sender_company, sender_email, sender_phone, lines_snapshot",
        )
        .eq("id", summary.quote_id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error(`Couldn't load quote: ${error?.message ?? "not found"}`);
      } else {
        setQuote(data as unknown as FullQuote);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.quote_id]);

  const buildMsaInput = (): MsaPdfInput | null => {
    if (!quote) return null;
    const lines = (quote.lines_snapshot ?? [])
      .filter((l) => l.enabled)
      .map((l) => ({
        id: l.id,
        label: l.label,
        description: l.description,
        resale: l.resale,
        bundled: l.bundled,
        perEvent: l.perEvent,
      }));
    const platformBundleResale =
      quote.monthly_resale -
      lines.reduce((s, l) => s + (l.bundled ? 0 : l.resale), 0);
    return {
      agreementNumber: `MSA-${quote.quote_number}`,
      quoteNumber: quote.quote_number,
      effectiveDateLabel: formatAcceptedAt(summary.accepted_at),
      client: {
        businessName: quote.client_business_name ?? "Merchant",
        contactName: quote.client_contact_name ?? "",
        email: quote.client_email ?? "",
        phone: quote.client_phone ?? "",
      },
      sender: {
        name: quote.sender_name ?? "MerchantHaus",
        title: quote.sender_title ?? "",
        company: quote.sender_company ?? "MerchantHaus LLC",
        email: quote.sender_email ?? "billing@merchanthaus.io",
        phone: quote.sender_phone ?? "",
        address: "1209 Mountain Road Pl NE Ste N, Albuquerque, NM 87110, USA",
      },
      tierName: quote.tier_name,
      billingCycle: quote.billing_cycle,
      platformBundleResale,
      lines,
      ancillary: [], // ancillary defaults aren't persisted on the quote row; v1 omits
      totals: {
        monthlyResale: quote.monthly_resale,
        annualResale: quote.annual_resale,
        oneTime: 0,
      },
      signatory: {
        name: summary.signatory_name ?? "—",
        title: summary.signatory_title ?? "",
        email: summary.signatory_email ?? "",
        acceptedAtLabel: formatAcceptedAt(summary.accepted_at),
        ipAddress: summary.ip_address,
        feeScheduleHash: summary.fee_schedule_hash ?? "",
        termsVersion: summary.terms_version ?? QUOTE_TERMS_VERSION,
      },
    };
  };

  const safeFilename = () =>
    `MerchantHaus-MSA-${(quote?.client_business_name ?? "merchant")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()}-${quote?.quote_number ?? "draft"}.pdf`;

  const handleDownload = async () => {
    const input = buildMsaInput();
    if (!input) return;
    setBuilding(true);
    try {
      const doc = await buildMerchantServicesAgreementPdf(input);
      doc.save(safeFilename());
      toast.success("MSA PDF downloaded.");
    } catch (err: any) {
      toast.error(`Build failed: ${err?.message ?? err}`);
    } finally {
      setBuilding(false);
    }
  };

  const handleEmail = async () => {
    const input = buildMsaInput();
    if (!input || !quote) return;
    const recipient = quote.client_email;
    if (!recipient) {
      toast.error("No merchant email on file.");
      return;
    }
    const ok = await confirmAutoEmail(
      `Email the Merchant Services Agreement to ${recipient}?`,
    );
    if (!ok) return;
    setSending(true);
    try {
      const doc = await buildMerchantServicesAgreementPdf(input);
      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1];

      const { data, error } = await supabase.functions.invoke(
        "send-quote-email",
        {
          body: {
            to: recipient,
            ccSender: true,
            clientName: quote.client_contact_name ?? "",
            businessName: quote.client_business_name ?? "Merchant",
            tierName: `MSA · ${quote.tier_name}`,
            monthlyTotal: fmt(quote.monthly_resale),
            quoteNumber: input.agreementNumber,
            pdfBase64: base64,
            pdfFilename: safeFilename(),
            sender: {
              name: input.sender.name,
              title: input.sender.title,
              email: input.sender.email,
              phone: input.sender.phone,
            },
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error));
      toast.success(`MSA emailed to ${recipient}.`);
      onClose();
    } catch (err: any) {
      toast.error(`Email failed: ${err?.message ?? err}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Generate Merchant Services Agreement
          </DialogTitle>
          <DialogDescription>
            Pre-stamped with the acceptance audit. Download or email directly to
            the merchant.
          </DialogDescription>
        </DialogHeader>

        {loading || !quote ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading quote…
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <Row label="Quote" value={quote.quote_number} mono />
              <Row label="Merchant" value={quote.client_business_name ?? "—"} bold />
              <Row
                label="Plan"
                value={`${quote.tier_name} — ${quote.billing_cycle}`}
              />
              <Row label="Monthly" value={fmt(quote.monthly_resale)} bold />
              <Row label="Annual" value={fmt(quote.annual_resale)} />
            </div>

            <Separator />

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
              <div className="text-[10px] font-bold tracking-[0.14em] text-emerald-700">
                ACCEPTANCE AUDIT
              </div>
              <Row label="Signatory" value={summary.signatory_name ?? "—"} bold />
              <Row label="Title" value={summary.signatory_title ?? "—"} />
              <Row label="Email" value={summary.signatory_email ?? "—"} />
              <Row label="Accepted" value={formatAcceptedAt(summary.accepted_at)} />
              <Row label="IP" value={summary.ip_address ?? "—"} mono />
              <Row label="Terms version" value={summary.terms_version ?? "—"} />
              <Row
                label="Fee schedule hash"
                value={
                  summary.fee_schedule_hash
                    ? `${summary.fee_schedule_hash.substring(0, 24)}…`
                    : "—"
                }
                mono
              />
              {summary.ach_authorized && (
                <Badge variant="secondary" className="text-[10px]">
                  ACH authorized at accept
                </Badge>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={building || !quote}
          >
            {building ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Download MSA
          </Button>
          <Button
            onClick={handleEmail}
            disabled={sending || !quote || !quote.client_email}
            className="bg-neutral-900 hover:bg-neutral-800 text-white border-l-[3px] border-l-[#c81030]"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Email to merchant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          (bold ? "font-semibold " : "") +
          (mono ? "font-mono text-xs " : "text-sm ") +
          "text-right"
        }
      >
        {value}
      </span>
    </div>
  );
}
