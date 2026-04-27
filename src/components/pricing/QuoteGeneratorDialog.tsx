import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Printer, Sparkles } from "lucide-react";

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
  ADD_ONS,
  type AddOnId,
  type PricingTier,
} from "@/config/pricing";

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

const EMPTY_CLIENT: ClientDetails = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  monthlyVolume: "",
  averageTicket: "",
  notes: "",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

interface QuoteGeneratorDialogProps {
  tier: PricingTier;
  billing: BillingCycle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuoteGeneratorDialog({
  tier,
  billing,
  open,
  onOpenChange,
}: QuoteGeneratorDialogProps) {
  const [client, setClient] = useState<ClientDetails>(EMPTY_CLIENT);
  const [selectedAddOns, setSelectedAddOns] = useState<Set<AddOnId>>(new Set());

  const isCustom = tier.monthlyPrice === null;
  const basePrice =
    billing === "annual"
      ? tier.annualPrice ?? 0
      : tier.monthlyPrice ?? 0;

  const optionalAddOns = useMemo(
    () => ADD_ONS.filter((a) => !tier.bundledAddOnIds.includes(a.id)),
    [tier.bundledAddOnIds],
  );

  const addOnSubtotal = useMemo(
    () =>
      optionalAddOns
        .filter((a) => selectedAddOns.has(a.id))
        .reduce((sum, a) => sum + a.monthly, 0),
    [optionalAddOns, selectedAddOns],
  );

  const monthlyTotal = isCustom ? null : basePrice + addOnSubtotal;
  const annualTotal = monthlyTotal === null ? null : monthlyTotal * 12;

  const toggleAddOn = (id: AddOnId) => {
    setSelectedAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setClient(EMPTY_CLIENT);
    setSelectedAddOns(new Set());
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handlePrint = () => {
    if (!client.businessName.trim()) {
      toast.error("Add a business name before printing the quote.");
      return;
    }
    window.print();
  };

  const handleDownload = () => {
    if (!client.businessName.trim()) {
      toast.error("Add a business name before downloading the quote.");
      return;
    }
    const lines: string[] = [];
    lines.push("MerchantHaus — Gateway Quote");
    lines.push("=".repeat(40));
    lines.push(`Date: ${new Date().toLocaleDateString()}`);
    lines.push("");
    lines.push("Client");
    lines.push("-".repeat(40));
    lines.push(`Business:        ${client.businessName}`);
    lines.push(`Contact:         ${client.contactName}`);
    lines.push(`Email:           ${client.email}`);
    lines.push(`Phone:           ${client.phone}`);
    if (client.monthlyVolume)
      lines.push(`Monthly Volume:  ${client.monthlyVolume}`);
    if (client.averageTicket)
      lines.push(`Average Ticket:  ${client.averageTicket}`);
    if (client.notes) lines.push(`Notes:           ${client.notes}`);
    lines.push("");
    lines.push("Plan");
    lines.push("-".repeat(40));
    lines.push(`Tier:            ${tier.name}`);
    lines.push(`Billing:         ${billing === "annual" ? "Annual (17% off)" : "Monthly"}`);
    if (isCustom) {
      lines.push(`Base Price:      Custom (volume-based)`);
    } else {
      lines.push(`Base Price:      ${formatCurrency(basePrice)} / month`);
    }
    lines.push("");
    if (selectedAddOns.size > 0) {
      lines.push("Add-Ons");
      lines.push("-".repeat(40));
      optionalAddOns
        .filter((a) => selectedAddOns.has(a.id))
        .forEach((a) => {
          const perEvent = a.perEvent
            ? ` (+ ${formatCurrency(a.perEvent.amount)} ${a.perEvent.label})`
            : "";
          lines.push(
            `${a.label.padEnd(36)} ${formatCurrency(a.monthly)}/mo${perEvent}`,
          );
        });
      lines.push("");
    }
    lines.push("Totals");
    lines.push("-".repeat(40));
    if (monthlyTotal === null) {
      lines.push("Monthly:         Custom — contact sales");
    } else {
      lines.push(`Monthly Total:   ${formatCurrency(monthlyTotal)}`);
      lines.push(`Annual Total:    ${formatCurrency(annualTotal!)}`);
    }
    lines.push("");
    lines.push("Quote valid for 30 days. Subject to underwriting approval.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = client.businessName
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    a.href = url;
    a.download = `quote-${safeName}-${tier.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Quote downloaded.");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl p-0 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>Generate quote — {tier.name}</DialogTitle>
            {tier.popular && <Badge variant="secondary">Popular</Badge>}
          </div>
          <DialogDescription>
            Add the client&apos;s details, pick any optional add-ons, and we&apos;ll build a
            shareable quote based on the MerchantHaus pricing schedule.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 grid gap-6 md:grid-cols-2">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                Client details
              </h3>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="qg-business">Business name *</Label>
                  <Input
                    id="qg-business"
                    value={client.businessName}
                    onChange={(e) =>
                      setClient({ ...client, businessName: e.target.value })
                    }
                    placeholder="Acme Coffee Roasters LLC"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="qg-contact">Contact name</Label>
                  <Input
                    id="qg-contact"
                    value={client.contactName}
                    onChange={(e) =>
                      setClient({ ...client, contactName: e.target.value })
                    }
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="qg-email">Email</Label>
                    <Input
                      id="qg-email"
                      type="email"
                      value={client.email}
                      onChange={(e) =>
                        setClient({ ...client, email: e.target.value })
                      }
                      placeholder="jane@acme.com"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="qg-phone">Phone</Label>
                    <Input
                      id="qg-phone"
                      type="tel"
                      value={client.phone}
                      onChange={(e) =>
                        setClient({ ...client, phone: e.target.value })
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="qg-volume">Monthly volume</Label>
                    <Input
                      id="qg-volume"
                      value={client.monthlyVolume}
                      onChange={(e) =>
                        setClient({ ...client, monthlyVolume: e.target.value })
                      }
                      placeholder="$50,000"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="qg-ticket">Average ticket</Label>
                    <Input
                      id="qg-ticket"
                      value={client.averageTicket}
                      onChange={(e) =>
                        setClient({ ...client, averageTicket: e.target.value })
                      }
                      placeholder="$120"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="qg-notes">Notes</Label>
                  <Textarea
                    id="qg-notes"
                    rows={3}
                    value={client.notes}
                    onChange={(e) =>
                      setClient({ ...client, notes: e.target.value })
                    }
                    placeholder="B2B SaaS, plans to onboard in Q3, requires Level III."
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Optional add-ons
                </h3>
                <p className="text-xs text-muted-foreground">
                  Bundled features in {tier.name} are already included.
                </p>
              </div>

              {optionalAddOns.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Every gateway add-on is included in {tier.name}.
                </div>
              ) : (
                <div className="space-y-2">
                  {optionalAddOns.map((addon) => {
                    const checked = selectedAddOns.has(addon.id);
                    return (
                      <label
                        key={addon.id}
                        htmlFor={`qg-addon-${addon.id}`}
                        className={
                          "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors " +
                          (checked
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50")
                        }
                      >
                        <Checkbox
                          id={`qg-addon-${addon.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleAddOn(addon.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {addon.label}
                            </span>
                            <span className="text-sm font-semibold whitespace-nowrap">
                              {formatCurrency(addon.monthly)}/mo
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {addon.description}
                          </p>
                          {addon.perEvent && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              + {formatCurrency(addon.perEvent.amount)}{" "}
                              {addon.perEvent.label}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <Separator />

          <div className="px-6 py-5 bg-muted/30">
            <h3 className="text-sm font-semibold mb-3">Quote summary</h3>
            <div className="grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {tier.name} plan ({billing === "annual" ? "annual" : "monthly"})
                </span>
                <span className="font-medium">
                  {isCustom ? "Custom" : `${formatCurrency(basePrice)}/mo`}
                </span>
              </div>
              {optionalAddOns
                .filter((a) => selectedAddOns.has(a.id))
                .map((a) => (
                  <div key={a.id} className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      {a.label}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(a.monthly)}/mo
                    </span>
                  </div>
                ))}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>Monthly total</span>
                <span>
                  {monthlyTotal === null
                    ? "Custom"
                    : `${formatCurrency(monthlyTotal)}/mo`}
                </span>
              </div>
              {annualTotal !== null && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Annual total</span>
                  <span>{formatCurrency(annualTotal)}/yr</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Per-event/transaction fees apply where listed. Quote valid for 30
              days, subject to underwriting.
            </p>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" /> Download quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
