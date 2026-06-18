import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Zap, Loader2, CheckCircle2 } from "lucide-react";

interface LookupItem { Id?: number | string; id?: number | string; Name?: string; name?: string; Code?: string; }

interface DealPayload {
  DBAName: string;
  LegalName: string;
  TaxId: string;
  MCC: string;
  WebsiteUrl: string;
  Phone: string;
  Email: string;
  Address: { Line1: string; City: string; State: string; Zip: string };
  Owners: { FirstName: string; LastName: string; SSN: string; DOB: string; TitleId: string; OwnershipPct: number; Email: string; Phone: string }[];
  BankAccount: { RoutingNumber: string; AccountNumber: string; BankName: string };
  Pricing: { Plan: string; QualifiedRate: number; TransactionFee: number; MonthlyFee: number; Notes: string };
  Equipment: { Notes: string };
  OpportunityId?: string;
}

const empty: DealPayload = {
  DBAName: "", LegalName: "", TaxId: "", MCC: "", WebsiteUrl: "", Phone: "", Email: "",
  Address: { Line1: "", City: "", State: "", Zip: "" },
  Owners: [{ FirstName: "", LastName: "", SSN: "", DOB: "", TitleId: "", OwnershipPct: 100, Email: "", Phone: "" }],
  BankAccount: { RoutingNumber: "", AccountNumber: "", BankName: "" },
  Pricing: { Plan: "interchange_plus", QualifiedRate: 2.7, TransactionFee: 0.1, MonthlyFee: 10, Notes: "" },
  Equipment: { Notes: "" },
};

const STEPS = ["Merchant", "Owners", "Bank", "Pricing", "Equipment", "Review"] as const;

export function KurvBoardingWizard({ onSubmitted }: { onSubmitted?: () => void }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<DealPayload>(empty);
  const [dealType, setDealType] = useState<"unsigned" | "signed">("unsigned");
  const [opportunityId, setOpportunityId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // lookups
  const [mccs, setMccs] = useState<LookupItem[]>([]);
  const [titles, setTitles] = useState<LookupItem[]>([]);
  const [mccQuery, setMccQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      const calls = [
        supabase.functions.invoke("kurv-lookups", { body: null, headers: {} as any })
          .catch(() => null),
      ];
      // Use GET-style invocation via query string is not supported by invoke; call the function URL directly.
      try {
        const [{ data: mccsRes }, { data: titlesRes }] = await Promise.all([
          invokeWithQuery("kurv-lookups", { list: "mccs" }),
          invokeWithQuery("kurv-lookups", { list: "owner_titles" }),
        ]);
        setMccs(Array.isArray(mccsRes) ? mccsRes : (mccsRes?.data ?? []));
        setTitles(Array.isArray(titlesRes) ? titlesRes : (titlesRes?.data ?? []));
      } catch (e) {
        console.error("Kurv lookups failed", e);
      }
      await calls;
    };
    load();
  }, []);

  const update = <K extends keyof DealPayload>(key: K, value: DealPayload[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const updateOwner = (i: number, patch: Partial<DealPayload["Owners"][number]>) =>
    setData((d) => ({ ...d, Owners: d.Owners.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) }));

  const addOwner = () =>
    setData((d) => ({
      ...d,
      Owners: [...d.Owners, { FirstName: "", LastName: "", SSN: "", DOB: "", TitleId: "", OwnershipPct: 0, Email: "", Phone: "" }],
    }));
  const removeOwner = (i: number) =>
    setData((d) => ({ ...d, Owners: d.Owners.filter((_, idx) => idx !== i) }));

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!data.DBAName || !data.LegalName) return "DBA and Legal Name are required";
      if (!data.MCC) return "MCC is required";
      if (!data.Address.Zip) return "Business ZIP is required";
    }
    if (step === 1) {
      const total = data.Owners.reduce((s, o) => s + (Number(o.OwnershipPct) || 0), 0);
      if (data.Owners.some((o) => !o.FirstName || !o.LastName)) return "Each owner needs a first and last name";
      if (total < 50) return "Owner ownership % should total at least 50%";
    }
    if (step === 2) {
      if (!data.BankAccount.RoutingNumber || !data.BankAccount.AccountNumber) return "Routing and account number are required";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    next();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = { ...data, OpportunityId: opportunityId || undefined };
      const idempotency_key = `${dealType}:${data.LegalName}:${data.TaxId || data.Email}`.toLowerCase();
      const { data: res, error } = await supabase.functions.invoke("kurv-board-deal", {
        body: { deal_type: dealType, opportunity_id: opportunityId || null, payload, idempotency_key },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      if (res?.duplicate) toast.info("Already submitted — showing existing deal");
      else toast.success(`Deal submitted to Kurv${res?.submission?.deal_id ? ` (${res.submission.deal_id})` : ""}`);
      setData(empty); setStep(0);
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed");
    } finally { setSubmitting(false); }
  };

  const filteredMccs = mccs.filter((m) => {
    const q = mccQuery.toLowerCase();
    if (!q) return true;
    return (m.Name ?? m.name ?? "").toString().toLowerCase().includes(q)
      || (m.Code ?? "").toString().toLowerCase().includes(q);
  }).slice(0, 80);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Boarding Wizard</CardTitle>
            <CardDescription>{STEPS[step]} · Step {step + 1} of {STEPS.length}</CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {dealType === "signed" ? "Signed (final)" : "Unsigned (editable)"}
          </Badge>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mt-3 h-1.5" />
      </CardHeader>
      <CardContent className="space-y-5">
        {step === 0 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="DBA Name" value={data.DBAName} onChange={(v) => update("DBAName", v)} />
              <Field label="Legal Name" value={data.LegalName} onChange={(v) => update("LegalName", v)} />
              <Field label="Tax ID / EIN" value={data.TaxId} onChange={(v) => update("TaxId", v)} />
              <div>
                <Label>MCC</Label>
                <Input value={mccQuery} onChange={(e) => setMccQuery(e.target.value)} placeholder="Search MCC by name or code" />
                <select
                  value={data.MCC}
                  onChange={(e) => update("MCC", e.target.value)}
                  className="w-full h-10 mt-1 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select MCC…</option>
                  {filteredMccs.map((m, i) => (
                    <option key={i} value={String(m.Code ?? m.Id ?? m.id ?? "")}>
                      {(m.Code ?? m.Id ?? "")} — {m.Name ?? m.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Phone" value={data.Phone} onChange={(v) => update("Phone", v)} />
              <Field label="Email" value={data.Email} onChange={(v) => update("Email", v)} type="email" />
              <Field label="Website" value={data.WebsiteUrl} onChange={(v) => update("WebsiteUrl", v)} className="sm:col-span-2" />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Address Line 1" value={data.Address.Line1} onChange={(v) => update("Address", { ...data.Address, Line1: v })} className="sm:col-span-2" />
              <Field label="City" value={data.Address.City} onChange={(v) => update("Address", { ...data.Address, City: v })} />
              <Field label="State" value={data.Address.State} onChange={(v) => update("Address", { ...data.Address, State: v })} />
              <Field label="ZIP" value={data.Address.Zip} onChange={(v) => update("Address", { ...data.Address, Zip: v })} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {data.Owners.map((o, i) => (
              <div key={i} className="border border-border rounded-md p-4 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Owner {i + 1}</p>
                  {data.Owners.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeOwner(i)}>Remove</Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First Name" value={o.FirstName} onChange={(v) => updateOwner(i, { FirstName: v })} />
                  <Field label="Last Name" value={o.LastName} onChange={(v) => updateOwner(i, { LastName: v })} />
                  <Field label="SSN" value={o.SSN} onChange={(v) => updateOwner(i, { SSN: v })} />
                  <Field label="Date of Birth" type="date" value={o.DOB} onChange={(v) => updateOwner(i, { DOB: v })} />
                  <div>
                    <Label>Title</Label>
                    <select
                      value={o.TitleId}
                      onChange={(e) => updateOwner(i, { TitleId: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select title…</option>
                      {titles.map((t, k) => (
                        <option key={k} value={String(t.Id ?? t.id ?? "")}>{t.Name ?? t.name}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="Ownership %" type="number" value={String(o.OwnershipPct)} onChange={(v) => updateOwner(i, { OwnershipPct: Number(v) || 0 })} />
                  <Field label="Email" type="email" value={o.Email} onChange={(v) => updateOwner(i, { Email: v })} />
                  <Field label="Phone" value={o.Phone} onChange={(v) => updateOwner(i, { Phone: v })} />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addOwner}>+ Add owner</Button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Routing Number" value={data.BankAccount.RoutingNumber} onChange={(v) => update("BankAccount", { ...data.BankAccount, RoutingNumber: v })} />
            <Field label="Account Number" value={data.BankAccount.AccountNumber} onChange={(v) => update("BankAccount", { ...data.BankAccount, AccountNumber: v })} />
            <Field label="Bank Name" value={data.BankAccount.BankName} onChange={(v) => update("BankAccount", { ...data.BankAccount, BankName: v })} className="sm:col-span-2" />
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Plan</Label>
              <select
                value={data.Pricing.Plan}
                onChange={(e) => update("Pricing", { ...data.Pricing, Plan: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="interchange_plus">Interchange+</option>
                <option value="flat_rate">Flat rate</option>
                <option value="tiered">Tiered</option>
              </select>
            </div>
            <Field label="Qualified Rate (%)" type="number" value={String(data.Pricing.QualifiedRate)} onChange={(v) => update("Pricing", { ...data.Pricing, QualifiedRate: Number(v) || 0 })} />
            <Field label="Transaction Fee ($)" type="number" value={String(data.Pricing.TransactionFee)} onChange={(v) => update("Pricing", { ...data.Pricing, TransactionFee: Number(v) || 0 })} />
            <Field label="Monthly Fee ($)" type="number" value={String(data.Pricing.MonthlyFee)} onChange={(v) => update("Pricing", { ...data.Pricing, MonthlyFee: Number(v) || 0 })} />
            <Field label="Pricing Notes" value={data.Pricing.Notes} onChange={(v) => update("Pricing", { ...data.Pricing, Notes: v })} className="sm:col-span-2" />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Equipment selection uses the Kurv reusable lists. For v1, enter free-text notes (terminal model, software, accessories). A picker backed by <code>kurv-lookups</code> ships next.
            </p>
            <div>
              <Label>Equipment Notes</Label>
              <textarea
                value={data.Equipment.Notes}
                onChange={(e) => update("Equipment", { Notes: e.target.value })}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Deal Type</Label>
                <select
                  value={dealType}
                  onChange={(e) => setDealType(e.target.value as any)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="unsigned">Unsigned (editable)</option>
                  <option value="signed">Signed (final)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>Linked Opportunity ID (optional)</Label>
                <Input value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} placeholder="uuid" />
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-1 text-sm">
              <p><span className="text-muted-foreground">DBA:</span> {data.DBAName || "—"}</p>
              <p><span className="text-muted-foreground">Legal:</span> {data.LegalName || "—"}</p>
              <p><span className="text-muted-foreground">MCC:</span> {data.MCC || "—"}</p>
              <p><span className="text-muted-foreground">Owners:</span> {data.Owners.length} ({data.Owners.reduce((s, o) => s + (Number(o.OwnershipPct) || 0), 0)}%)</p>
              <p><span className="text-muted-foreground">Bank:</span> {data.BankAccount.BankName || "—"} · …{data.BankAccount.AccountNumber.slice(-4)}</p>
              <p><span className="text-muted-foreground">Pricing:</span> {data.Pricing.Plan} · {data.Pricing.QualifiedRate}% + ${data.Pricing.TransactionFee}</p>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">View raw payload</summary>
              <pre className="mt-2 p-3 bg-muted/40 rounded max-h-72 overflow-auto text-[10px]">{JSON.stringify(data, null, 2)}</pre>
            </details>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-border">
          <Button variant="outline" onClick={back} disabled={step === 0} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} className="gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Submit {dealType === "signed" ? "Signed" : "Unsigned"} Deal
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label, value, onChange, type = "text", className = "",
}: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Edge functions don't accept GET via supabase.functions.invoke; call via fetch with query string.
async function invokeWithQuery(name: string, params: Record<string, string>): Promise<{ data: any }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}?${new URLSearchParams(params).toString()}`;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return { data: await res.json() };
}
