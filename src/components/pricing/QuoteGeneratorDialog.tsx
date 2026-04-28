import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Download,
  FileSignature,
  Mail,
  Pencil,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIERS, type PricingTier, type TierId } from "@/config/pricing";
import {
  DEFAULT_QUOTE_SENDER,
  QUOTE_DISCLAIMERS,
  QUOTE_LINES,
  TIER_PLATFORM_FEE,
} from "@/config/quoteSchedule";
import { supabase } from "@/integrations/supabase/client";
import quoteHeader from "@/assets/quote-header.png";

type BillingCycle = "monthly" | "annual";

interface ClientDetails {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  monthlyVolume: string;
  averageTicket: string;
  notes: string;
}

interface SenderDetails {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  address: string;
}

interface EditableLine {
  id: string;
  label: string;
  description: string;
  cost: number;
  resale: number;
  perEvent?: { label: string; cost: number; resale: number };
  /** True = bundled by tier OR explicitly enabled by user */
  enabled: boolean;
  bundled: boolean;
}

const EMPTY_CLIENT: ClientDetails = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  monthlyVolume: "",
  averageTicket: "",
  notes: "",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const buildQuoteNumber = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `MH-${stamp}-${rand}`;
};

const buildLinesForTier = (tierId: TierId): EditableLine[] =>
  QUOTE_LINES.map((l) => {
    const bundled = l.bundledIn.includes(tierId);
    return {
      id: l.id,
      label: l.label,
      description: l.description,
      cost: l.cost,
      resale: l.resale,
      perEvent: l.perEvent ? { ...l.perEvent } : undefined,
      bundled,
      enabled: bundled,
    };
  });

interface QuoteGeneratorDialogProps {
  tier?: PricingTier;
  billing?: BillingCycle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClient?: Partial<ClientDetails>;
}

export function QuoteGeneratorDialog({
  tier: tierProp,
  billing: billingProp = "monthly",
  open,
  onOpenChange,
  initialClient,
}: QuoteGeneratorDialogProps) {
  const [client, setClient] = useState<ClientDetails>({ ...EMPTY_CLIENT });
  const [sender, setSender] = useState<SenderDetails>({ ...DEFAULT_QUOTE_SENDER });
  const [selectedTierId, setSelectedTierId] = useState<TierId>(
    (tierProp?.id as TierId) ?? TIERS[0].id,
  );
  const [billing, setBilling] = useState<BillingCycle>(billingProp);
  const [platformCost, setPlatformCost] = useState<number>(
    TIER_PLATFORM_FEE[(tierProp?.id as TierId) ?? "foundation"].cost,
  );
  const [platformResale, setPlatformResale] = useState<number>(
    TIER_PLATFORM_FEE[(tierProp?.id as TierId) ?? "foundation"].resale,
  );
  const [lines, setLines] = useState<EditableLine[]>(
    buildLinesForTier((tierProp?.id as TierId) ?? "foundation"),
  );
  const [quoteNumber] = useState<string>(() => buildQuoteNumber());
  const [createdOn] = useState<string>(() => todayLabel());
  const [tab, setTab] = useState<"build" | "preview">("build");
  const [sending, setSending] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Re-sync when dialog opens with new context.
  useEffect(() => {
    if (!open) return;
    setClient({ ...EMPTY_CLIENT, ...(initialClient ?? {}) });
    const id: TierId = (tierProp?.id as TierId) ?? selectedTierId;
    setSelectedTierId(id);
    setBilling(billingProp);
    setPlatformCost(TIER_PLATFORM_FEE[id].cost);
    setPlatformResale(TIER_PLATFORM_FEE[id].resale);
    setLines(buildLinesForTier(id));
    setSender({ ...DEFAULT_QUOTE_SENDER });
    setTab("build");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When the user changes plan tier inside the dialog, reset platform & lines.
  const onTierChange = (id: TierId) => {
    setSelectedTierId(id);
    setPlatformCost(TIER_PLATFORM_FEE[id].cost);
    setPlatformResale(TIER_PLATFORM_FEE[id].resale);
    setLines(buildLinesForTier(id));
  };

  const tier = TIERS.find((t) => t.id === selectedTierId) ?? TIERS[0];

  const billedPlatform = useMemo(() => {
    // Annual gets the same 17% discount applied to the resale only (cost is a margin reference).
    const factor = billing === "annual" ? 0.83 : 1;
    return {
      cost: platformCost,
      resale: +(platformResale * factor).toFixed(2),
    };
  }, [billing, platformCost, platformResale]);

  const enabledLines = lines.filter((l) => l.enabled);

  const totals = useMemo(() => {
    const lineResale = enabledLines.reduce(
      (s, l) => s + (l.bundled ? 0 : l.resale),
      0,
    );
    const lineCost = enabledLines.reduce(
      (s, l) => s + (l.bundled ? 0 : l.cost),
      0,
    );
    const monthlyResale = billedPlatform.resale + lineResale;
    const monthlyCost = billedPlatform.cost + lineCost;
    const monthlyMargin = monthlyResale - monthlyCost;
    return {
      lineResale,
      lineCost,
      monthlyResale,
      monthlyCost,
      monthlyMargin,
      annualResale: monthlyResale * 12,
    };
  }, [enabledLines, billedPlatform]);

  const updateLine = (id: string, patch: Partial<EditableLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const updateLinePerEvent = (
    id: string,
    field: "cost" | "resale",
    val: number,
  ) =>
    setLines((prev) =>
      prev.map((l) =>
        l.id === id && l.perEvent
          ? { ...l, perEvent: { ...l.perEvent, [field]: val } }
          : l,
      ),
    );

  // ---------- PDF ----------
  const buildPdf = async (): Promise<jsPDF> => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;

    // Header image (full width band)
    try {
      const img = new Image();
      img.src = quoteHeader;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
      const headerH = (img.height / img.width) * (pageW - margin * 2);
      doc.addImage(img, "PNG", margin, 24, pageW - margin * 2, headerH);
      var cursor = 24 + headerH + 18;
    } catch {
      var cursor = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Gateway Services Quote", margin, cursor);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Quote #: ${quoteNumber}`, pageW - margin, cursor - 12, {
      align: "right",
    });
    doc.text(`Date: ${createdOn}`, pageW - margin, cursor, { align: "right" });
    cursor += 18;
    doc.setTextColor(0);

    // Parties
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Prepared For", margin, cursor);
    doc.text("Prepared By", pageW / 2 + 10, cursor);
    cursor += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const left = [
      client.businessName || "—",
      client.contactName,
      client.email,
      client.phone,
    ].filter(Boolean);
    const right = [
      sender.name,
      sender.title,
      sender.company,
      sender.email,
      sender.phone,
    ].filter(Boolean);
    const rows = Math.max(left.length, right.length);
    for (let i = 0; i < rows; i++) {
      if (left[i]) doc.text(left[i], margin, cursor + i * 12);
      if (right[i]) doc.text(right[i], pageW / 2 + 10, cursor + i * 12);
    }
    cursor += rows * 12 + 8;

    // Plan badge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      `Plan: ${tier.name} — ${billing === "annual" ? "Annual (17% off)" : "Monthly"}`,
      margin,
      cursor,
    );
    cursor += 14;

    // Pricing table
    const tableBody: string[][] = [
      [
        "Platform Bundle",
        billing === "annual" ? "Annual billing" : "Monthly",
        fmt(billedPlatform.resale) + "/mo",
      ],
    ];
    enabledLines.forEach((l) => {
      tableBody.push([
        l.label + (l.bundled ? "  (included)" : ""),
        l.perEvent
          ? `${fmt(l.perEvent.resale)} ${l.perEvent.label}`
          : l.description,
        l.bundled ? "Included" : fmt(l.resale) + "/mo",
      ]);
    });

    autoTable(doc, {
      startY: cursor,
      head: [["Item", "Detail", "Price"]],
      body: tableBody,
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 2: { halign: "right", cellWidth: 90 } },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error - lastAutoTable is added at runtime
    cursor = doc.lastAutoTable.finalY + 12;

    // Totals
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      `Monthly Total: ${fmt(totals.monthlyResale)}`,
      pageW - margin,
      cursor,
      { align: "right" },
    );
    cursor += 14;
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(
      `Annual Total: ${fmt(totals.annualResale)}`,
      pageW - margin,
      cursor,
      { align: "right" },
    );
    cursor += 18;
    doc.setTextColor(0);

    // Volume context
    if (client.monthlyVolume || client.averageTicket) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90);
      const ctx = [
        client.monthlyVolume && `Disclosed Monthly Volume: ${client.monthlyVolume}`,
        client.averageTicket && `Average Ticket: ${client.averageTicket}`,
      ]
        .filter(Boolean)
        .join("    •    ");
      doc.text(ctx, margin, cursor);
      cursor += 14;
      doc.setTextColor(0);
    }

    // Notes
    if (client.notes) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Notes", margin, cursor);
      cursor += 12;
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(client.notes, pageW - margin * 2);
      doc.text(wrapped, margin, cursor);
      cursor += wrapped.length * 11 + 6;
    }

    // Disclaimers
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Terms, Disclaimers & Acceptance", margin, cursor);
    cursor += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    QUOTE_DISCLAIMERS.forEach((d, i) => {
      const text = `${i + 1}. ${d}`;
      const wrapped = doc.splitTextToSize(text, pageW - margin * 2);
      // page break safeguard
      if (cursor + wrapped.length * 10 > doc.internal.pageSize.getHeight() - 100) {
        doc.addPage();
        cursor = margin;
      }
      doc.text(wrapped, margin, cursor);
      cursor += wrapped.length * 10 + 4;
    });

    // Signature block
    if (cursor > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      cursor = margin;
    }
    cursor += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Acceptance", margin, cursor);
    cursor += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      "By signing below, Merchant accepts this quote and agrees to the MerchantHaus Gateway",
      margin,
      cursor,
    );
    cursor += 10;
    doc.text(
      "Platform & Services Agreement (Appendix A: General Terms & Conditions).",
      margin,
      cursor,
    );
    cursor += 22;
    // Signature lines
    doc.line(margin, cursor, margin + 220, cursor);
    doc.line(pageW - margin - 160, cursor, pageW - margin, cursor);
    cursor += 11;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("Authorized Signatory", margin, cursor);
    doc.text("Date", pageW - margin - 160, cursor);

    // Footer
    doc.setTextColor(140);
    doc.setFontSize(8);
    doc.text(
      `MerchantHaus LLC  •  ${sender.address}  •  Quote #${quoteNumber}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" },
    );

    return doc;
  };

  const safeFilename = () => {
    const safe = (client.businessName || "merchant")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    return `MerchantHaus-Quote-${safe}-${quoteNumber}.pdf`;
  };

  const handleDownloadPdf = async () => {
    if (!client.businessName.trim()) {
      toast.error("Add a business name before downloading.");
      return;
    }
    try {
      const doc = await buildPdf();
      doc.save(safeFilename());
      toast.success("Quote PDF downloaded.");
    } catch (err: any) {
      toast.error(`Failed to build PDF: ${err?.message ?? err}`);
    }
  };

  const handleSendEmail = async () => {
    if (!client.email.trim()) {
      toast.error("Add a client email before sending.");
      return;
    }
    if (!client.businessName.trim()) {
      toast.error("Add a business name before sending.");
      return;
    }
    try {
      setSending(true);
      const doc = await buildPdf();
      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1];

      const { data, error } = await supabase.functions.invoke(
        "send-quote-email",
        {
          body: {
            to: client.email,
            ccSender: true,
            clientName: client.contactName,
            businessName: client.businessName,
            tierName: tier.name,
            monthlyTotal: fmt(totals.monthlyResale),
            quoteNumber,
            pdfBase64: base64,
            pdfFilename: safeFilename(),
            sender,
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error));
      toast.success(`Quote emailed to ${client.email}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Email failed: ${err?.message ?? err}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 w-[100vw] sm:w-full h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[92vh] rounded-none sm:rounded-lg overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>Quote Generator</DialogTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              {quoteNumber}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {createdOn}
            </Badge>
            <span className="ml-auto" />
            <Badge>{tier.name}</Badge>
          </div>
          <DialogDescription>
            Edit cost, markup, and add-ons. Preview before sending. Client
            receives a branded PDF.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3">
            <TabsList>
              <TabsTrigger value="build">
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Build
              </TabsTrigger>
              <TabsTrigger value="preview">
                <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Preview
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ========== BUILD TAB ========== */}
          <TabsContent value="build" className="flex-1 min-h-0 m-0 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="h-full">
              <div className="px-6 py-5 space-y-6">
                {/* Plan + billing */}
                <section className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="grid gap-1.5">
                    <Label>Plan tier</Label>
                    <Select
                      value={selectedTierId}
                      onValueChange={(v) => onTierChange(v as TierId)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIERS.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} — {t.tagline}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 self-end">
                    {(["monthly", "annual"] as BillingCycle[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBilling(b)}
                        className={
                          "px-3 py-1 text-xs rounded-full transition-colors " +
                          (billing === b
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {b === "monthly" ? "Monthly" : "Annual (17% off)"}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Two columns: client + sender */}
                <div className="grid gap-5 md:grid-cols-2">
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      Client
                    </h3>
                    <div className="grid gap-3">
                      <Field label="Business name *" value={client.businessName}
                        onChange={(v) => setClient({ ...client, businessName: v })}
                        placeholder="Acme Coffee Roasters LLC" />
                      <Field label="Contact name" value={client.contactName}
                        onChange={(v) => setClient({ ...client, contactName: v })}
                        placeholder="Jane Smith" />
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Email *" value={client.email}
                          type="email"
                          onChange={(v) => setClient({ ...client, email: v })}
                          placeholder="jane@acme.com" />
                        <Field label="Phone" value={client.phone}
                          onChange={(v) => setClient({ ...client, phone: v })}
                          placeholder="(555) 123-4567" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Monthly volume" value={client.monthlyVolume}
                          onChange={(v) => setClient({ ...client, monthlyVolume: v })}
                          placeholder="$50,000" />
                        <Field label="Average ticket" value={client.averageTicket}
                          onChange={(v) => setClient({ ...client, averageTicket: v })}
                          placeholder="$120" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Notes</Label>
                        <Textarea rows={2} value={client.notes}
                          onChange={(e) => setClient({ ...client, notes: e.target.value })}
                          placeholder="Optional context for the merchant…" />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Prepared by (auto-filled, editable)
                    </h3>
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Name" value={sender.name}
                          onChange={(v) => setSender({ ...sender, name: v })} />
                        <Field label="Title" value={sender.title}
                          onChange={(v) => setSender({ ...sender, title: v })} />
                      </div>
                      <Field label="Company" value={sender.company}
                        onChange={(v) => setSender({ ...sender, company: v })} />
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Email" value={sender.email} type="email"
                          onChange={(v) => setSender({ ...sender, email: v })} />
                        <Field label="Phone" value={sender.phone}
                          onChange={(v) => setSender({ ...sender, phone: v })} />
                      </div>
                      <Field label="Address" value={sender.address}
                        onChange={(v) => setSender({ ...sender, address: v })} />
                    </div>
                  </section>
                </div>

                <Separator />

                {/* Platform fee row */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Platform Bundle ({tier.name})</h3>
                  <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <NumField label="Cost ($/mo)" value={platformCost}
                      onChange={setPlatformCost} />
                    <NumField label="Resale ($/mo)" value={platformResale}
                      onChange={setPlatformResale} />
                    <div className="text-sm">
                      <div className="text-muted-foreground text-xs">Margin</div>
                      <div className="font-semibold">
                        {fmt(platformResale - platformCost)}
                        <span className="text-xs text-muted-foreground ml-1">/mo</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Add-on lines */}
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold">Add-ons</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Bundled lines are included in {tier.name} at no extra cost.
                      Cost &amp; resale are editable per quote.
                    </p>
                  </div>
                  <div className="relative -mx-1 sm:mx-0">
                    <div className="sm:hidden flex items-center justify-end gap-1 pr-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Swipe for more</span>
                      <span aria-hidden>→</span>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-secondary text-secondary-foreground text-xs">
                        <tr>
                          <th className="text-left px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[60px]">Include</th>
                          <th className="text-left px-2 sm:px-3 py-2 font-semibold whitespace-nowrap">Item</th>
                          <th className="text-right px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[80px]">Cost</th>
                          <th className="text-right px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[80px]">Resale</th>
                          <th className="text-right px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[80px]">Margin</th>
                          <th className="text-right px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[140px]">Per-event</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id} className="border-t">
                            <td className="p-2 align-top">
                              <Checkbox
                                checked={l.enabled}
                                onCheckedChange={(c) =>
                                  updateLine(l.id, { enabled: !!c })
                                }
                              />
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium flex items-center gap-2">
                                {l.label}
                                {l.bundled && (
                                  <Badge variant="secondary" className="text-[10px] py-0">
                                    Bundled
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground max-w-[260px]">
                                {l.description}
                              </div>
                            </td>
                            <td className="p-2 align-top text-right">
                              <CompactNum value={l.cost}
                                onChange={(v) => updateLine(l.id, { cost: v })} />
                            </td>
                            <td className="p-2 align-top text-right">
                              <CompactNum value={l.resale}
                                onChange={(v) => updateLine(l.id, { resale: v })} />
                            </td>
                            <td className="p-2 align-top text-right text-xs font-semibold">
                              {l.bundled ? "—" : fmt(l.resale - l.cost)}
                            </td>
                            <td className="p-2 align-top text-right">
                              {l.perEvent ? (
                                <div className="space-y-1">
                                  <div className="text-[10px] text-muted-foreground">
                                    {l.perEvent.label}
                                  </div>
                                  <div className="flex items-center gap-1 justify-end">
                                    <CompactNum value={l.perEvent.cost}
                                      onChange={(v) => updateLinePerEvent(l.id, "cost", v)} />
                                    <span className="text-muted-foreground text-[10px]">→</span>
                                    <CompactNum value={l.perEvent.resale}
                                      onChange={(v) => updateLinePerEvent(l.id, "resale", v)} />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    <div className="sm:hidden pointer-events-none absolute top-6 right-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent rounded-r-md" />
                  </div>
                </section>

                {/* Totals strip */}
                <section className="rounded-lg border bg-card p-4 grid gap-2 sm:grid-cols-3 text-sm">
                  <Stat label="Monthly cost" value={fmt(totals.monthlyCost)} muted />
                  <Stat label="Monthly resale" value={fmt(totals.monthlyResale)} bold />
                  <Stat label="Monthly margin"
                    value={fmt(totals.monthlyMargin)}
                    accent />
                </section>
              </div>
            </div>
          </TabsContent>

          {/* ========== PREVIEW TAB ========== */}
          <TabsContent value="preview" className="flex-1 min-h-0 m-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-muted/40" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="h-full">
              <div ref={previewRef} className="bg-white text-[#1f2937] mx-auto my-3 sm:my-6 w-[820px] max-w-[820px] sm:w-auto origin-top scale-[0.55] sm:scale-100 -translate-y-0 sm:translate-y-0 shadow-lg rounded-md overflow-hidden" style={{ transformOrigin: "top left" }}>
                <img src={quoteHeader} alt="MerchantHaus" className="w-full block" />
                <div className="px-8 pt-6 pb-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Gateway Services Quote</h2>
                      <p className="text-xs text-muted-foreground">{tier.name} · {billing === "annual" ? "Annual billing" : "Monthly billing"}</p>
                    </div>
                    <div className="text-right text-xs">
                      <div><span className="text-muted-foreground">Quote #</span> <span className="font-mono">{quoteNumber}</span></div>
                      <div><span className="text-muted-foreground">Date</span> {createdOn}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mt-5 text-sm">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Prepared for</div>
                      <div className="font-semibold">{client.businessName || "—"}</div>
                      {client.contactName && <div>{client.contactName}</div>}
                      {client.email && <div className="text-xs text-muted-foreground">{client.email}</div>}
                      {client.phone && <div className="text-xs text-muted-foreground">{client.phone}</div>}
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Prepared by</div>
                      <div className="font-semibold">{sender.name}</div>
                      <div className="text-xs">{sender.title} · {sender.company}</div>
                      <div className="text-xs text-muted-foreground">{sender.email}</div>
                      <div className="text-xs text-muted-foreground">{sender.phone}</div>
                    </div>
                  </div>

                  <div className="relative mt-6 -mx-2 sm:mx-0">
                    <div className="sm:hidden flex items-center justify-end gap-1 pr-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Swipe for more</span>
                      <span aria-hidden>→</span>
                    </div>
                    <div className="overflow-x-auto border-t border-b">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-slate-900 text-white text-xs">
                        <tr>
                          <th className="text-left px-2 sm:px-3 py-2.5 whitespace-nowrap">Item</th>
                          <th className="text-left px-2 sm:px-3 py-2.5 whitespace-nowrap">Detail</th>
                          <th className="text-right px-2 sm:px-3 py-2.5 whitespace-nowrap w-[110px]">Price</th>
                        </tr>
                      </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2.5 font-medium">Platform Bundle ({tier.name})</td>
                        <td className="p-2.5 text-xs text-muted-foreground">Gateway access, tokenization, PCI tools, support</td>
                        <td className="p-2.5 text-right font-semibold">{fmt(billedPlatform.resale)}/mo</td>
                      </tr>
                      {enabledLines.map((l) => (
                        <tr key={l.id} className="border-b">
                          <td className="p-2.5">
                            {l.label}
                            {l.bundled && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-700">Included</span>}
                          </td>
                          <td className="p-2.5 text-xs text-muted-foreground">
                            {l.perEvent ? `${fmt(l.perEvent.resale)} ${l.perEvent.label}` : l.description}
                          </td>
                          <td className="p-2.5 text-right">{l.bundled ? "—" : `${fmt(l.resale)}/mo`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <div className="sm:hidden pointer-events-none absolute top-6 right-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
                  </div>

                  <div className="flex justify-end mt-4 text-sm">
                    <div className="space-y-1 text-right">
                      <div><span className="text-muted-foreground mr-3">Monthly Total</span><span className="font-bold text-lg">{fmt(totals.monthlyResale)}</span></div>
                      <div className="text-xs text-muted-foreground">Annual Total: {fmt(totals.annualResale)}</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Terms, Disclaimers &amp; Acceptance</div>
                    <ol className="text-[11px] text-slate-600 space-y-1.5 list-decimal pl-4">
                      {QUOTE_DISCLAIMERS.map((d, i) => <li key={i}>{d}</li>)}
                    </ol>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
                    <div>
                      <div className="border-b border-slate-400 h-8" />
                      <div className="text-muted-foreground mt-1">Authorized Signatory</div>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-8" />
                      <div className="text-muted-foreground mt-1">Date</div>
                    </div>
                  </div>

                  <div className="mt-6 text-[10px] text-center text-muted-foreground">
                    MerchantHaus LLC · {sender.address} · Quote #{quoteNumber}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-3 border-t bg-background gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {tab === "build" ? (
            <Button onClick={() => setTab("preview")}>
              <FileSignature className="h-4 w-4 mr-2" /> Preview
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setTab("build")}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" /> Download PDF
          </Button>
          <Button onClick={handleSendEmail} disabled={sending}>
            {sending ? (
              <>
                <Mail className="h-4 w-4 mr-2 animate-pulse" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Send to client
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- helpers ----------------

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function CompactNum({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-7 w-20 text-xs text-right inline-block"
    />
  );
}

function Stat({
  label,
  value,
  bold,
  accent,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          (bold ? "text-lg font-bold " : "text-base ") +
          (accent ? "text-emerald-600 font-semibold " : "") +
          (muted ? "text-muted-foreground " : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
