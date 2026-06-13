import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, FileDown, Send, Loader2, Receipt as ReceiptIcon, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { buildBillingDocPdf, blobToBase64, type BillingDocLine } from "@/lib/billingDocPdf";
import { buildScheduleLines } from "@/lib/billingDocSchedule";
import { buildBillingCatalog, catalogItemToLine, type CatalogGroup } from "@/lib/billingDocCatalog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { TierId } from "@/config/pricing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  /** Optional default doc type (defaults to invoice). */
  defaultType?: "invoice" | "receipt";
  onCreated?: () => void;
}

const CT_FMT = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);

export const BillingDocDialog = ({ open, onOpenChange, accountId, accountName, defaultType = "invoice", onCreated }: Props) => {
  const { user, teamMemberName } = useAuth();
  const [docType, setDocType] = useState<"invoice" | "receipt">(defaultType);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [merchantName, setMerchantName] = useState(accountName);
  const [merchantEmail, setMerchantEmail] = useState("");
  const [merchantPhone, setMerchantPhone] = useState("");
  const [merchantId, setMerchantId] = useState<string | null>(null);

  const [tier, setTier] = useState<TierId>("growth");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [includeGatewayAuth, setIncludeGatewayAuth] = useState(false);
  const [includePerTxn, setIncludePerTxn] = useState(false);
  const [txnCount, setTxnCount] = useState<number>(0);

  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [issuedDate, setIssuedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [paidDate, setPaidDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [lines, setLines] = useState<BillingDocLine[]>([]);
  const [notes, setNotes] = useState("");
  const [recipients, setRecipients] = useState("");

  // Load account/opportunity context
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: acc } = await supabase
        .from("accounts")
        .select("name, nmi_merchant_id, contacts(email, phone, first_name, last_name)")
        .eq("id", accountId)
        .maybeSingle();
      const { data: opps } = await supabase
        .from("opportunities")
        .select("gateway_tier, pricing_plan, billing_cycle")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      const a: any = acc;
      setMerchantName(a?.name || accountName);
      setMerchantId(a?.nmi_merchant_id ?? null);
      const c = Array.isArray(a?.contacts) ? a.contacts[0] : a?.contacts;
      if (c?.email) {
        setMerchantEmail(c.email);
        setRecipients(c.email);
      }
      if (c?.phone) setMerchantPhone(c.phone);

      const opp: any = opps?.[0];
      const tierFromOpp = (opp?.gateway_tier as TierId | undefined) || "growth";
      setTier(tierFromOpp);
      if (opp?.billing_cycle === "annual" || opp?.billing_cycle === "monthly") {
        setBillingCycle(opp.billing_cycle);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, accountId, accountName]);

  // Rebuild default lines when schedule inputs change
  useEffect(() => {
    if (!open) return;
    const defaults = buildScheduleLines({
      tier,
      billingCycle,
      includeGatewayAuth,
      includePerTxn,
      txnCount,
    });
    setLines(defaults);
  }, [open, tier, billingCycle, includeGatewayAuth, includePerTxn, txnCount]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines],
  );
  const total = subtotal; // tax left at 0 for v1

  const updateLine = (i: number, patch: Partial<BillingDocLine>) => {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      // recompute amount when qty/unit_price change
      const l = next[i];
      next[i].amount = Math.round((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * 100) / 100;
      return next;
    });
  };

  const removeLine = (i: number) =>
    setLines((prev) => prev.filter((_, idx) => idx !== i));

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { label: "Custom line", description: "", qty: 1, unit_price: 0, amount: 0 },
    ]);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalog = useMemo(() => buildBillingCatalog(), []);
  const grouped = useMemo(() => {
    const byGroup = new Map<CatalogGroup, typeof catalog>();
    for (const item of catalog) {
      const arr = byGroup.get(item.group) ?? [];
      arr.push(item);
      byGroup.set(item.group, arr);
    }
    return [...byGroup.entries()];
  }, [catalog]);

  const addCatalogItem = (id: string) => {
    const item = catalog.find((c) => c.id === id);
    if (!item) return;
    setLines((prev) => [...prev, catalogItemToLine(item)]);
    setCatalogOpen(false);
  };

  const buildPdfInput = (docNumber: string) => ({
    docType,
    docNumber,
    issuedLabel: CT_FMT(new Date(issuedDate)),
    dueLabel: docType === "invoice" ? CT_FMT(new Date(dueDate)) : undefined,
    paidLabel: docType === "receipt" ? CT_FMT(new Date(paidDate)) : undefined,
    periodLabel:
      periodStart && periodEnd
        ? `${CT_FMT(new Date(periodStart))} – ${CT_FMT(new Date(periodEnd))}`
        : undefined,
    currency: "USD",
    tierName: capitalize(tier),
    billingCycle,
    merchant: {
      name: merchantName,
      email: merchantEmail || undefined,
      phone: merchantPhone || undefined,
      merchantId: merchantId || undefined,
    },
    sender: {
      name: teamMemberName || user?.email?.split("@")[0] || "MerchantHaus",
      title: "Account Management",
      company: "MerchantHaus LLC",
      email: user?.email || "billing@merchanthaus.io",
      phone: "",
      address: "1209 Mountain Road Pl NE Ste N, Albuquerque, NM 87110",
    },
    lines,
    subtotal,
    total,
    tax: 0,
    amountPaid: docType === "receipt" ? total : 0,
    notes: notes || undefined,
  });

  const allocateNumber = async () => {
    const year = new Date().getFullYear();
    const { data, error } = await supabase.rpc("next_billing_doc_number", {
      p_doc_type: docType,
      p_year: year,
    });
    if (error) throw error;
    return data as string;
  };

  const persistRow = async (docNumber: string, pdfPath: string | null) => {
    const { error } = await supabase.from("billing_documents").insert({
      account_id: accountId,
      doc_type: docType,
      doc_number: docNumber,
      status: docType === "receipt" ? "paid" : "issued",
      issued_date: issuedDate,
      due_date: docType === "invoice" ? dueDate : null,
      paid_date: docType === "receipt" ? paidDate : null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      currency: "USD",
      subtotal,
      total,
      amount_paid: docType === "receipt" ? total : 0,
      gateway_tier: tier,
      billing_cycle: billingCycle,
      line_items: lines as any,
      merchant_name: merchantName,
      merchant_email: merchantEmail || null,
      merchant_phone: merchantPhone || null,
      sender: {
        name: teamMemberName || user?.email || null,
        email: user?.email || null,
      } as any,
      pdf_path: pdfPath,
      created_by: user?.email || teamMemberName || null,
      notes: notes || null,
    });
    if (error) throw error;
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const docNumber = await allocateNumber();
      const blob = await buildBillingDocPdf(buildPdfInput(docNumber));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Upload to storage for archival
      const path = `billing/${accountId}/${docNumber}.pdf`;
      const file = new File([blob], `${docNumber}.pdf`, { type: "application/pdf" });
      await supabase.storage.from("opportunity-documents").upload(path, file, { upsert: true });

      await persistRow(docNumber, path);
      toast.success(`${capitalize(docType)} ${docNumber} created`);
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Failed to create document: ${e.message ?? e}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleSend = async () => {
    const list = recipients.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) {
      toast.error("Add at least one recipient email");
      return;
    }
    setSending(true);
    try {
      const docNumber = await allocateNumber();
      const blob = await buildBillingDocPdf(buildPdfInput(docNumber));
      const base64 = await blobToBase64(blob);

      const path = `billing/${accountId}/${docNumber}.pdf`;
      const file = new File([blob], `${docNumber}.pdf`, { type: "application/pdf" });
      await supabase.storage.from("opportunity-documents").upload(path, file, { upsert: true });
      await persistRow(docNumber, path);

      const { error: fnError } = await supabase.functions.invoke("send-billing-doc", {
        body: {
          to: list,
          docType,
          docNumber,
          merchantName,
          total,
          pdfBase64: base64,
          pdfFilename: `${docNumber}.pdf`,
          sender: {
            name: teamMemberName || user?.email?.split("@")[0] || "MerchantHaus",
            email: user?.email || "billing@merchanthaus.io",
            title: "Account Management",
          },
          dueLabel: docType === "invoice" ? CT_FMT(new Date(dueDate)) : undefined,
        },
      });
      if (fnError) throw fnError;

      // Update sent_at / sent_to
      await supabase
        .from("billing_documents")
        .update({ status: docType === "receipt" ? "paid" : "sent", sent_at: new Date().toISOString(), sent_to: list })
        .eq("doc_number", docNumber);

      toast.success(`${capitalize(docType)} ${docNumber} sent`);
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Failed to send: ${e.message ?? e}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            {docType === "invoice" ? <FileText className="h-5 w-5" /> : <ReceiptIcon className="h-5 w-5" />}
            New {capitalize(docType)} — {accountName}
          </DialogTitle>
          <DialogDescription>
            Priced from the gateway schedule. Edit any line before issuing.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={docType} onValueChange={(v) => setDocType(v as any)}>
          <TabsList>
            <TabsTrigger value="invoice"><FileText className="h-3.5 w-3.5 mr-1.5" />Invoice</TabsTrigger>
            <TabsTrigger value="receipt"><ReceiptIcon className="h-3.5 w-3.5 mr-1.5" />Receipt</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading merchant…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Merchant / schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Bill to (name)</Label>
                <Input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Merchant email</Label>
                <Input value={merchantEmail} onChange={(e) => setMerchantEmail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Gateway tier</Label>
                <Select value={tier} onValueChange={(v) => setTier(v as TierId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="foundation">Foundation</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Billing cycle</Label>
                <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual (17% off)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Issued</Label>
                <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
              </div>
              {docType === "invoice" ? (
                <div>
                  <Label className="text-xs">Due</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Paid on</Label>
                  <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
                </div>
              )}
              <div>
                <Label className="text-xs">Period start (optional)</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Period end (optional)</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            {/* Gateway extras */}
            <div className="flex flex-wrap items-center gap-4 text-sm rounded-md bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Switch checked={includeGatewayAuth} onCheckedChange={setIncludeGatewayAuth} />
                <span>Gateway auth fee ($10/mo)</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={includePerTxn} onCheckedChange={setIncludePerTxn} />
                <span>Per-transaction fee</span>
              </div>
              {includePerTxn && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Txn count</Label>
                  <Input
                    type="number"
                    className="h-8 w-24"
                    value={txnCount}
                    onChange={(e) => setTxnCount(Number(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>

            {/* Lines */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-16 text-right">Qty</TableHead>
                    <TableHead className="w-24 text-right">Unit</TableHead>
                    <TableHead className="w-28 text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="space-y-1">
                        <Input
                          value={l.label}
                          onChange={(e) => updateLine(i, { label: e.target.value })}
                          className="h-8 font-medium"
                        />
                        <Textarea
                          value={l.description || ""}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                          rows={1}
                          className="text-xs min-h-[28px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.qty}
                          onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 0 })}
                          className="h-8 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={l.unit_price}
                          onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) || 0 })}
                          className="h-8 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ${l.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t p-2 flex items-center justify-between bg-muted/20">
                <Popover open={catalogOpen} onOpenChange={setCatalogOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[420px] p-0">
                    <Command>
                      <CommandInput placeholder="Search gateway items, NMI fees…" />
                      <CommandList className="max-h-[360px]">
                        <CommandEmpty>No matches.</CommandEmpty>
                        <CommandGroup heading="Custom">
                          <CommandItem
                            value="custom-line"
                            onSelect={() => { addLine(); setCatalogOpen(false); }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-2" /> Blank custom line
                          </CommandItem>
                        </CommandGroup>
                        {grouped.map(([group, items]) => (
                          <CommandGroup key={group} heading={group}>
                            {items.map((it) => (
                              <CommandItem
                                key={it.id}
                                value={`${group} ${it.label}`}
                                onSelect={() => addCatalogItem(it.id)}
                                className="flex items-start gap-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{it.label}</div>
                                  {it.description && (
                                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                                      {it.description}
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                  ${it.unit_price.toFixed(2)}
                                  {it.cadence ? ` · ${it.cadence.replace(/_/g, " ")}` : ""}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <div className="text-sm">
            </div>

            <div>
              <Label className="text-xs">Notes (printed on PDF)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs">Email to (comma-separated)</Label>
              <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="merchant@example.com" />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Badge variant="outline" className="mr-auto">{docType === "invoice" ? "Invoice" : "Receipt"}</Badge>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={handleDownload} disabled={downloading || sending}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileDown className="h-4 w-4 mr-1.5" />}
            Download PDF
          </Button>
          <Button onClick={handleSend} disabled={sending || downloading}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            Send to merchant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
