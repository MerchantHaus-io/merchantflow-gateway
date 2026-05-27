import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Download,
  Eye,
  FileSignature,
  Mail,
  Pencil,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import type jsPDF from "jspdf";

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
  ANCILLARY_FEE_DEFAULTS,
  DEFAULT_QUOTE_SENDER,
  QUOTE_LINES,
  QUOTE_SENDERS,
  QUOTE_TERMS_VERSION,
  TIER_PLATFORM_FEE,
  type AncillaryFeeDefault,
} from "@/config/quoteSchedule";
import { supabase } from "@/integrations/supabase/client";
import { confirmAutoEmail } from "@/components/EmailSendConfirm";
import { buildEditorialQuotePdf, type QuotePdfInput } from "@/lib/quotePdf";

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

/** Generate a URL-safe acceptance token (~22 chars, ~128 bits of entropy). */
const buildAcceptanceToken = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const validThroughLabel = (sentAt: Date): string => {
  const v = new Date(sentAt);
  v.setDate(v.getDate() + 30);
  return v.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

interface EditableAncillary {
  id: AncillaryFeeDefault["id"];
  label: string;
  description: string;
  cadence: AncillaryFeeDefault["cadence"];
  amount: number;
  enabled: boolean;
  waivedDescription?: string;
}

const buildAncillaryDefaults = (): EditableAncillary[] =>
  ANCILLARY_FEE_DEFAULTS.map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    cadence: a.cadence,
    amount: a.amount,
    enabled: true,
    waivedDescription: a.waivedDescription,
  }));

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
  /** CRM linkage — when set, the persisted quote row is tied back to these records. */
  opportunityId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
}

export function QuoteGeneratorDialog({
  tier: tierProp,
  billing: billingProp = "monthly",
  open,
  onOpenChange,
  initialClient,
  opportunityId,
  accountId,
  contactId,
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
  const [ancillary, setAncillary] = useState<EditableAncillary[]>(
    () => buildAncillaryDefaults(),
  );
  const [quoteNumber] = useState<string>(() => buildQuoteNumber());
  const [acceptanceToken] = useState<string>(() => buildAcceptanceToken());
  const [createdOn] = useState<string>(() => todayLabel());
  const [tab, setTab] = useState<"build" | "preview">("build");
  const [sending, setSending] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  // Render the actual PDF (same template the email and download use) in
  // the Preview tab. Avoids the inline-HTML drift problem where the tab
  // preview diverged from buildEditorialQuotePdf.
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewBuilding, setPreviewBuilding] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const acceptanceUrl = useMemo(
    () => `${window.location.origin}/q/${acceptanceToken}`,
    [acceptanceToken],
  );

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
    setAncillary(buildAncillaryDefaults());
    setSender({ ...DEFAULT_QUOTE_SENDER });
    setTab("build");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateAncillary = (id: AncillaryFeeDefault["id"], patch: Partial<EditableAncillary>) =>
    setAncillary((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const oneTimeTotal = useMemo(
    () =>
      ancillary
        .filter((a) => a.enabled && a.cadence === "one_time")
        .reduce((s, a) => s + a.amount, 0),
    [ancillary],
  );

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
  /**
   * Build the editorial-style PDF (cover → scope/pricing → billing/terms → acceptance).
   * Layout/design lives in src/lib/quotePdf.ts; this just assembles the input.
   */
  const buildPdf = async (): Promise<jsPDF> => {
    const now = new Date();
    const pdfInput: QuotePdfInput = {
      quoteNumber,
      issuedLabel: createdOn,
      validThroughLabel: validThroughLabel(now),
      currency: "USD",
      tierName: tier.name,
      billingCycle: billing,
      client: {
        businessName: client.businessName || "Merchant",
        contactName: client.contactName,
        email: client.email,
        phone: client.phone,
        monthlyVolume: client.monthlyVolume,
        averageTicket: client.averageTicket,
        notes: client.notes,
      },
      sender,
      platformBundleResale: billedPlatform.resale,
      lines: enabledLines.map((l) => ({
        id: l.id,
        label: l.label,
        description: l.description,
        resale: l.resale,
        bundled: l.bundled,
        perEvent: l.perEvent
          ? { label: l.perEvent.label, resale: l.perEvent.resale }
          : undefined,
      })),
      ancillary: ancillary
        .filter((a) => a.enabled)
        .map((a) => ({
          id: a.id,
          label: a.label,
          description: a.description,
          amount: a.amount,
          cadence: a.cadence,
          waived: a.amount === 0,
          waivedDescription: a.waivedDescription,
        })),
      totals: {
        monthlyResale: totals.monthlyResale,
        annualResale: totals.annualResale,
        oneTime: oneTimeTotal,
      },
      acceptUrl: acceptanceUrl,
    };
    return await buildEditorialQuotePdf(pdfInput);
  };

  // Rebuild the PDF preview whenever the Preview tab is active and the
  // inputs change. Debounced via the cancel flag so rapid edits don't
  // queue up stale builds. Object URLs are revoked on supersede/unmount.
  useEffect(() => {
    if (tab !== "preview") return;
    if (!client.businessName.trim()) {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewBuilding(true);
    setPreviewError(null);
    const timer = window.setTimeout(async () => {
      try {
        const doc = await buildPdf();
        if (cancelled) return;
        const blob = doc.output("blob") as Blob;
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err: any) {
        if (cancelled) return;
        setPreviewError(err?.message ?? String(err));
      } finally {
        if (!cancelled) setPreviewBuilding(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // buildPdf closes over all the relevant inputs; we re-trigger when any
    // of them change. Listing every primitive keeps the dep array honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    tier.id,
    billing,
    client.businessName,
    client.contactName,
    client.email,
    client.phone,
    client.monthlyVolume,
    client.averageTicket,
    client.notes,
    sender.name,
    sender.title,
    sender.company,
    sender.email,
    sender.phone,
    quoteNumber,
    acceptanceUrl,
    billedPlatform.resale,
    totals.monthlyResale,
    totals.annualResale,
    oneTimeTotal,
    enabledLines,
    ancillary,
  ]);

  useEffect(() => {
    return () => {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

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
    const email = client.email.trim();
    if (!email) {
      toast.error("Add a client email before sending.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(`"${email}" doesn't look like a valid email address.`);
      return;
    }
    if (!client.businessName.trim()) {
      toast.error("Add a business name before sending.");
      return;
    }
    const ok = await confirmAutoEmail(
      `Send the ${tier.name} quote PDF to ${client.email}${
        sender?.email ? ` (cc ${sender.email})` : ""
      }?`,
    );
    if (!ok) return;
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
            acceptUrl: acceptanceUrl,
            validThroughLabel: validThroughLabel(new Date()),
            sender,
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error));

      const persistResult = await persistQuote("sent");
      if (persistResult.error) {
        // Email landed — don't roll back, but surface the persistence failure
        // so the team knows the audit row is missing.
        console.error("Quote sent but failed to persist:", persistResult.error);
        toast.warning(
          `Quote emailed to ${client.email}, but the record couldn't be saved (${persistResult.error.message}).`,
        );
      } else {
        toast.success(`Quote emailed to ${client.email}`);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Email failed: ${err?.message ?? err}`);
    } finally {
      setSending(false);
    }
  };

  const persistQuote = async (status: "draft" | "sent") => {
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + 30);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;

    const row = {
      quote_number: quoteNumber,
      opportunity_id: opportunityId ?? null,
      account_id: accountId ?? null,
      contact_id: contactId ?? null,
      tier_id: tier.id,
      tier_name: tier.name,
      billing_cycle: billing,
      status,
      monthly_cost: +totals.monthlyCost.toFixed(2),
      monthly_resale: +totals.monthlyResale.toFixed(2),
      monthly_margin: +totals.monthlyMargin.toFixed(2),
      annual_resale: +totals.annualResale.toFixed(2),
      valid_until: validUntil.toISOString(),
      pdf_filename: safeFilename(),
      client_business_name: client.businessName || null,
      client_contact_name: client.contactName || null,
      client_email: client.email || null,
      client_phone: client.phone || null,
      client_monthly_volume: client.monthlyVolume || null,
      client_average_ticket: client.averageTicket || null,
      client_notes: client.notes || null,
      sender_name: sender.name || null,
      sender_title: sender.title || null,
      sender_company: sender.company || null,
      sender_email: sender.email || null,
      sender_phone: sender.phone || null,
      lines_snapshot: lines as any,
      sent_at: status === "sent" ? now.toISOString() : null,
      sent_by: user?.id ?? null,
      sent_by_email: user?.email ?? null,
      // Token issued client-side so the PDF that goes out matches what we persist.
      // For drafts we still persist the token but the merchant link won't be useful
      // until the quote is actually sent.
      acceptance_token: acceptanceToken,
      acceptance_token_expires_at: validUntil.toISOString(),
    };
    // Cast: the auto-generated Supabase types are regenerated separately;
    // acceptance_token columns were added in the 20260526120000 migration.
    return await supabase.from("quotes").insert(row as any);
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
                        <CurrencyField label="Monthly volume" value={client.monthlyVolume}
                          onChange={(v) => setClient({ ...client, monthlyVolume: v })}
                          placeholder="$50,000" />
                        <CurrencyField label="Average ticket" value={client.averageTicket}
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
                      <div className="grid gap-1.5">
                        <Label>Select sender</Label>
                        <Select
                          value={
                            QUOTE_SENDERS.find(
                              (s) => s.email && s.email === sender.email,
                            )?.id ?? "custom"
                          }
                          onValueChange={(id) => {
                            const picked = QUOTE_SENDERS.find((s) => s.id === id);
                            if (!picked) return;
                            if (picked.id === "custom") {
                              setSender({
                                name: "",
                                title: "",
                                company: picked.company,
                                email: "",
                                phone: "",
                                address: picked.address,
                              });
                            } else {
                              setSender({
                                name: picked.name,
                                title: picked.title,
                                company: picked.company,
                                email: picked.email,
                                phone: picked.phone,
                                address: picked.address,
                              });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose teammate…" />
                          </SelectTrigger>
                          <SelectContent>
                            {QUOTE_SENDERS.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.id === "custom"
                                  ? "✏️  Custom (manual entry)"
                                  : `${s.name} — ${s.title}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          All fields below are editable for one-off overrides.
                        </p>
                      </div>
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
                      Toggle <span className="font-semibold">Bundle</span> on any line to include it free of charge in this quote.
                    </p>
                  </div>
                  <div className="relative -mx-1 sm:mx-0">
                    <div className="sm:hidden flex items-center justify-end gap-1 pr-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Swipe for more</span>
                      <span aria-hidden>→</span>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-primary text-primary-foreground text-xs">
                        <tr>
                          <th className="text-left px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[60px]">Include</th>
                          <th className="text-left px-2 sm:px-3 py-2 font-semibold whitespace-nowrap w-[70px]">Bundle</th>
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
                                  updateLine(l.id, {
                                    enabled: !!c,
                                    bundled: !!c && l.bundled,
                                  })
                                }
                              />
                            </td>
                            <td className="p-2 align-top">
                              <Checkbox
                                checked={l.bundled}
                                onCheckedChange={(c) =>
                                  updateLine(l.id, { bundled: !!c, enabled: l.enabled || !!c })
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

                {/* Ancillary fee disclosures — chargeback, PCI, setup, return-payment */}
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold">Ancillary fee disclosures</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Always disclosed on the quote (even at $0). Set to 0 to mark as waived.
                    </p>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold w-[80px]">Disclose</th>
                          <th className="text-left px-3 py-2 font-semibold">Fee</th>
                          <th className="text-right px-3 py-2 font-semibold w-[120px]">Amount</th>
                          <th className="text-right px-3 py-2 font-semibold w-[130px]">Cadence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ancillary.map((a) => (
                          <tr key={a.id} className="border-t">
                            <td className="p-2 align-top">
                              <Checkbox
                                checked={a.enabled}
                                onCheckedChange={(c) => updateAncillary(a.id, { enabled: !!c })}
                              />
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium">{a.label}</div>
                              <div className="text-[11px] text-muted-foreground max-w-[420px]">
                                {a.description}
                              </div>
                            </td>
                            <td className="p-2 align-top text-right">
                              <CompactNum
                                value={a.amount}
                                onChange={(v) => updateAncillary(a.id, { amount: v })}
                              />
                            </td>
                            <td className="p-2 align-top text-right text-xs text-muted-foreground">
                              {a.cadence.replace("_", " ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Totals strip */}
                <section className="rounded-lg border bg-card p-4 grid gap-2 sm:grid-cols-4 text-sm">
                  <Stat label="Monthly cost" value={fmt(totals.monthlyCost)} muted />
                  <Stat label="Monthly resale" value={fmt(totals.monthlyResale)} bold />
                  <Stat label="Monthly margin"
                    value={fmt(totals.monthlyMargin)}
                    accent />
                  <Stat label="One-time fees" value={fmt(oneTimeTotal)} />
                  {enabledLines.some((l) => l.perEvent && !l.bundled) && (
                    <p className="sm:col-span-4 text-[11px] text-muted-foreground pt-1 border-t">
                      Totals reflect fixed monthly fees only. Per-event fees and ancillary "as incurred" items are variable and billed based on actual activity.
                    </p>
                  )}
                </section>

                {/* Acceptance URL preview */}
                <section className="rounded-lg border bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-4 border-l-[3px] border-l-[#c81030]">
                  <div className="text-[10px] font-bold tracking-[0.14em] text-[#c81030] mb-1">
                    ACCEPT ONLINE — CTA EMBEDDED IN PDF & EMAIL
                  </div>
                  <div className="font-serif italic text-lg mb-2">
                    Sign instantly via secure link.
                  </div>
                  <code className="text-[11px] text-neutral-300 break-all block bg-black/30 px-2 py-1.5 rounded">
                    {acceptanceUrl}
                  </code>
                  <p className="text-[11px] text-neutral-400 mt-2">
                    Token issued at quote creation. Expires when the quote does (30 days).
                    Each acceptance writes an immutable audit row with IP, UA, and fee-schedule hash, and notifies {sender.email || "the sender"}.
                  </p>
                </section>
              </div>
            </div>
          </TabsContent>

          {/* ========== PREVIEW TAB ========== */}
          {/* Renders the same PDF that buildEditorialQuotePdf produces for
              download / email, so the operator sees exactly what the merchant
              will receive. No more hand-rolled HTML preview drifting from
              the canonical PDF template. */}
          <TabsContent value="preview" className="flex-1 min-h-0 m-0 overflow-hidden bg-muted/40">
            <div ref={previewRef} className="h-full w-full flex flex-col">
              {!client.businessName.trim() ? (
                <div className="flex-1 flex items-center justify-center p-6 text-center">
                  <div className="max-w-sm">
                    <FileSignature className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium">Add a business name to preview</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The preview renders the exact PDF that gets emailed to the merchant.
                    </p>
                  </div>
                </div>
              ) : previewError ? (
                <div className="flex-1 flex items-center justify-center p-6 text-center">
                  <div className="max-w-sm">
                    <p className="text-sm font-medium text-destructive">Preview failed to build</p>
                    <p className="text-xs text-muted-foreground mt-1">{previewError}</p>
                  </div>
                </div>
              ) : previewBlobUrl ? (
                <iframe
                  key={previewBlobUrl}
                  src={previewBlobUrl}
                  title="Quote PDF preview"
                  className="flex-1 w-full bg-white"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 animate-pulse" />
                    Building preview…
                  </div>
                </div>
              )}
              {previewBuilding && previewBlobUrl && (
                <div className="absolute top-3 right-3 text-[11px] bg-background/80 backdrop-blur px-2 py-1 rounded-md border shadow-sm flex items-center gap-1.5">
                  <Mail className="h-3 w-3 animate-pulse" /> Updating…
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {tab === "preview" && (
          <div className="px-3 sm:px-6 py-2 border-t bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">
              Preview only — this is the exact PDF that will be emailed. Return to{" "}
              <button
                type="button"
                onClick={() => setTab("build")}
                className="underline underline-offset-2 font-semibold"
              >
                Edit
              </button>{" "}
              to send or download.
            </span>
          </div>
        )}
        <DialogFooter className="px-3 sm:px-6 py-3 border-t bg-background gap-2 flex-row flex-wrap [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {tab === "build" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setTab("preview")}>
                <FileSignature className="h-4 w-4 mr-2" /> Preview
              </Button>
              <Button type="button" variant="outline" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </Button>
              <Button type="button" onClick={handleSendEmail} disabled={sending}>
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
            </>
          ) : (
            <Button type="button" onClick={() => setTab("build")}>
              <Pencil className="h-4 w-4 mr-2" /> Back to edit
            </Button>
          )}
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

function CurrencyField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const handleBlur = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const digits = trimmed.replace(/[^0-9.]/g, "");
    const n = parseFloat(digits);
    if (!Number.isFinite(n) || n <= 0) return;
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n < 100 ? 2 : 0,
    }).format(n);
    if (formatted !== trimmed) onChange(formatted);
  };
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
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
