import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { CaseRow, CaseUpdate } from "@/hooks/useCases";
import type { Json } from "@/integrations/supabase/types";

function obj(v: Json | null | undefined): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Captures the merchant application the underwriting review reads. Denormalized
// into the case row (legal identity) + jsonb blobs (contact/address/application).
export function CaseForm({
  caseRow,
  onSave,
}: {
  caseRow: CaseRow;
  onSave: (patch: CaseUpdate) => Promise<unknown>;
}) {
  const app = obj(caseRow.application);
  const contact = obj(caseRow.contact);
  const address = obj(caseRow.address);
  const owners = Array.isArray(caseRow.owners) ? caseRow.owners : [];

  const [form, setForm] = useState({
    legal_name: caseRow.legal_name ?? "",
    dba_name: caseRow.dba_name ?? "",
    website_url: caseRow.website_url ?? "",
    service_type: caseRow.service_type,
    contact_first: String(contact.first ?? ""),
    contact_last: String(contact.last ?? ""),
    contact_email: String(contact.email ?? ""),
    contact_phone: String(contact.phone ?? ""),
    city: String(address.city ?? ""),
    state: String(address.state ?? ""),
    nature_of_business: String(app.nature_of_business ?? ""),
    mcc: String(app.mcc ?? ""),
    monthly_volume: String(app.monthly_volume ?? ""),
    average_transaction: String(app.average_transaction ?? ""),
    owners: owners
      .map((o) => (o && typeof o === "object" ? String((o as Record<string, unknown>).name ?? "") : ""))
      .filter(Boolean)
      .join(", "),
  });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const patch: CaseUpdate = {
      legal_name: form.legal_name || null,
      dba_name: form.dba_name || null,
      website_url: form.website_url || null,
      service_type: form.service_type,
      contact: {
        first: form.contact_first,
        last: form.contact_last,
        email: form.contact_email,
        phone: form.contact_phone,
      },
      address: { city: form.city, state: form.state },
      application: {
        nature_of_business: form.nature_of_business,
        mcc: form.mcc,
        monthly_volume: form.monthly_volume,
        average_transaction: form.average_transaction,
      },
      owners: form.owners
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name })),
    };
    try {
      await onSave(patch);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type={type} value={form[key]} onChange={(e) => set(key)(e.target.value)} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Merchant application</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Legal entity name", "legal_name")}
            {field("DBA name", "dba_name")}
            {field("Website URL", "website_url")}
            <div className="space-y-1.5">
              <Label htmlFor="service_type">Service type</Label>
              <Select
                id="service_type"
                value={form.service_type}
                onChange={(e) => set("service_type")(e.target.value)}
              >
                <option value="processing">Processing</option>
                <option value="gateway_only">Gateway only</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {field("Contact first name", "contact_first")}
            {field("Contact last name", "contact_last")}
            {field("Contact email", "contact_email", "email")}
            {field("Contact phone", "contact_phone")}
            {field("City", "city")}
            {field("State", "state")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {field("MCC / SIC", "mcc")}
            {field("Monthly volume ($)", "monthly_volume")}
            {field("Average ticket ($)", "average_transaction")}
            {field("Beneficial owners (comma-separated)", "owners")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nature_of_business">Nature of business</Label>
            <Textarea
              id="nature_of_business"
              value={form.nature_of_business}
              onChange={(e) => set("nature_of_business")(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={busy}>Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}
