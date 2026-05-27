import { useEffect, useMemo, useState } from "react";
import { Building2, FileSignature, Search, User } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TIERS, type PricingTier } from "@/config/pricing";
import { QuoteGeneratorDialog } from "@/components/pricing/QuoteGeneratorDialog";
import { AcceptedQuotesPanel } from "@/components/pricing/AcceptedQuotesPanel";
import { toast } from "sonner";

type BillingCycle = "monthly" | "annual";

interface OppRow {
  id: string;
  stage: string;
  account: { id: string; name: string } | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    account_id: string;
  } | null;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  account_id: string;
}

export default function QuoteBuilder() {
  const [loading, setLoading] = useState(true);
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [oppFilter, setOppFilter] = useState("");
  const [oppId, setOppId] = useState<string>("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [tierId, setTierId] = useState<PricingTier["id"]>("growth");
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [monthlyVolume, setMonthlyVolume] = useState("");
  const [averageTicket, setAverageTicket] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("opportunities")
        .select(
          "id, stage, account:accounts(id, name), contact:contacts(id, first_name, last_name, email, phone, account_id)",
        )
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) {
        toast.error("Failed to load opportunities");
      } else {
        setOpps((data as any) || []);
      }
      setLoading(false);
    })();
  }, []);

  const selectedOpp = useMemo(
    () => opps.find((o) => o.id === oppId) || null,
    [opps, oppId],
  );

  // When opportunity changes, load all contacts for that account.
  useEffect(() => {
    if (!selectedOpp?.account?.id) {
      setContacts([]);
      setContactId("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, account_id")
        .eq("account_id", selectedOpp.account!.id)
        .order("first_name", { ascending: true });
      if (!error) {
        const list = (data as any) || [];
        setContacts(list);
        // Default to opportunity's primary contact if present.
        const primary =
          list.find((c: ContactRow) => c.id === selectedOpp.contact?.id) ||
          list[0];
        setContactId(primary?.id || "");
      }
    })();
    // Try to pre-fill volume/avg ticket from latest application for this account email.
    (async () => {
      if (!selectedOpp.contact?.email) return;
      const { data } = await supabase
        .from("applications")
        .select("monthly_volume, avg_ticket")
        .eq("email", selectedOpp.contact.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        if (data.monthly_volume) setMonthlyVolume(String(data.monthly_volume));
        if (data.avg_ticket) setAverageTicket(String(data.avg_ticket));
      }
    })();
  }, [selectedOpp]);

  const filteredOpps = useMemo(() => {
    const q = oppFilter.trim().toLowerCase();
    if (!q) return opps;
    return opps.filter((o) => {
      const name = o.account?.name?.toLowerCase() || "";
      const c = o.contact;
      const cname = `${c?.first_name || ""} ${c?.last_name || ""}`
        .trim()
        .toLowerCase();
      const cemail = c?.email?.toLowerCase() || "";
      return name.includes(q) || cname.includes(q) || cemail.includes(q);
    });
  }, [opps, oppFilter]);

  const selectedContact = contacts.find((c) => c.id === contactId) || null;

  const initialClient = selectedOpp
    ? {
        businessName: selectedOpp.account?.name || "",
        contactName: selectedContact
          ? `${selectedContact.first_name || ""} ${selectedContact.last_name || ""}`.trim()
          : "",
        email: selectedContact?.email || "",
        phone: selectedContact?.phone || "",
        monthlyVolume,
        averageTicket,
        notes: "",
      }
    : undefined;

  const tier = TIERS.find((t) => t.id === tierId) ?? TIERS[1];

  // Always allow building. When no opportunity is picked the dialog opens
  // with blank client fields — useful for one-off quotes to prospects that
  // aren't in the CRM yet. The persisted quote row carries null opportunity/
  // account/contact FKs, which the migration already permits.
  const canBuild = true;

  return (
    <AppLayout pageTitle="Quote Builder">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <FileSignature className="h-7 w-7 text-primary" />
              Quote Builder
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Pick an opportunity and contact, then generate a tailored quote
              PDF you can preview, download, or email.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Search opportunities
              </Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by account, contact, or email…"
                  className="pl-9"
                  value={oppFilter}
                  onChange={(e) => setOppFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Opportunity
                </Label>
                <Select value={oppId} onValueChange={setOppId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue
                      placeholder={
                        loading ? "Loading…" : "Select an opportunity"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOpps.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No matches.
                      </div>
                    )}
                    {filteredOpps.slice(0, 100).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="font-medium">
                          {o.account?.name || "(no account)"}
                        </span>
                        {o.contact?.first_name && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            · {o.contact.first_name} {o.contact.last_name || ""}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedOpp && (
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    Stage: {selectedOpp.stage}
                  </Badge>
                )}
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Contact
                </Label>
                <Select
                  value={contactId}
                  onValueChange={setContactId}
                  disabled={!selectedOpp}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue
                      placeholder={
                        selectedOpp
                          ? contacts.length
                            ? "Select a contact"
                            : "No contacts on this account"
                          : "Pick an opportunity first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.first_name || "") + " " + (c.last_name || "")}
                        {c.email && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            · {c.email}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Plan tier
                </Label>
                <Select
                  value={tierId}
                  onValueChange={(v) => setTierId(v as PricingTier["id"])}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Billing
                </Label>
                <Select
                  value={billing}
                  onValueChange={(v) => setBilling(v as BillingCycle)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual (17% off)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Monthly vol.
                  </Label>
                  <Input
                    className="mt-2"
                    placeholder="$50,000"
                    value={monthlyVolume}
                    onChange={(e) => setMonthlyVolume(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Avg ticket
                  </Label>
                  <Input
                    className="mt-2"
                    placeholder="$85"
                    value={averageTicket}
                    onChange={(e) => setAverageTicket(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-[11px] text-muted-foreground italic">
                {selectedOpp
                  ? `Linked to ${selectedOpp.account?.name ?? "opportunity"}`
                  : "No opportunity selected — building a one-off quote"}
              </p>
              <Button
                disabled={!canBuild}
                onClick={() => setOpen(true)}
                className="gap-2"
              >
                <FileSignature className="h-4 w-4" />
                Build {tier.name} quote
              </Button>
            </div>
          </div>

          <AcceptedQuotesPanel />
        </div>
      </div>

      {open && (
        <QuoteGeneratorDialog
          tier={tier}
          billing={billing}
          open={open}
          onOpenChange={setOpen}
          initialClient={initialClient}
          opportunityId={selectedOpp?.id ?? null}
          accountId={selectedOpp?.account?.id ?? null}
          contactId={contactId || selectedOpp?.contact?.id || null}
        />
      )}
    </AppLayout>
  );
}
