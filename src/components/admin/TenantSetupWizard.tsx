/**
 * Guided ISO setup wizard. Each step posts real data to the provision-tenant
 * worker, which validates it and writes the artifact (branding, sender
 * identity, pricing items, team invites) before ticking the step. When every
 * required step is done the worker re-asserts readiness and flips to Ready.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GATEWAY_BASIS } from "@/lib/affiliatePayouts";

type Call = (body: Record<string, unknown>, key: string) => Promise<Record<string, unknown>>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenant: { id: string; name: string; primary_contact_email: string | null };
  completed: string[];
  call: Call;
  onChanged: () => Promise<void> | void;
}

const STEPS = [
  { key: "branding", label: "Branding" },
  { key: "sender_identity", label: "Sender domain" },
  { key: "pricing", label: "Base pricing" },
  { key: "team", label: "Initial team" },
] as const;

interface PriceItem {
  code: string;
  label: string;
  category: string;
  cadence: string;
  cost: string;
  resale: string;
}

const defaultPricing = (): PriceItem[] => [
  {
    code: "gateway_monthly",
    label: "Gateway monthly fee",
    category: "platform",
    cadence: "monthly",
    cost: String(GATEWAY_BASIS.monthlyCost),
    resale: String(GATEWAY_BASIS.monthlyBilled),
  },
  {
    code: "gateway_per_txn",
    label: "Gateway per transaction",
    category: "platform",
    cadence: "per_transaction",
    cost: String(GATEWAY_BASIS.perTxnCost),
    resale: String(GATEWAY_BASIS.perTxnBilled),
  },
];

export function TenantSetupWizard({ open, onOpenChange, tenant, completed, call, onChanged }: Props) {
  const firstOpen = STEPS.findIndex((s) => !completed.includes(s.key));
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState({ display_name: tenant.name, primary_color: "#1A6BFF", logo_url: "" });
  const [sender, setSender] = useState({ from_name: tenant.name, reply_to: tenant.primary_contact_email ?? "", sender_domain: "" });
  const [pricing, setPricing] = useState<PriceItem[]>(defaultPricing);
  const [team, setTeam] = useState<{ email: string; role: string }[]>([
    { email: tenant.primary_contact_email ?? "", role: "owner" },
  ]);

  useEffect(() => {
    if (open) setIdx(firstOpen === -1 ? 0 : firstOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = STEPS[idx];

  const payload = (): Record<string, unknown> => {
    if (step.key === "branding") return brand;
    if (step.key === "sender_identity") return sender;
    if (step.key === "pricing") return { items: pricing };
    return { invites: team.filter((t) => t.email.trim()) };
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await call(
        {
          action: "onboarding_step",
          tenant_id: tenant.id,
          step: step.key,
          data: payload(),
          redirect_to: `${window.location.origin}/auth`,
        },
        `${tenant.id}:${step.key}`,
      );
      await onChanged();
      if (res.status === "ready") {
        toast.success(`${tenant.name} is Ready — activate it to go live`);
        onOpenChange(false);
        return;
      }
      toast.success(`${step.label} saved`);
      if (idx < STEPS.length - 1) setIdx(idx + 1);
      else onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this step");
    } finally {
      setSaving(false);
    }
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, extra: Record<string, string> = {}) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...extra} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up {tenant.name}</DialogTitle>
          <DialogDescription>Each step is saved and checked before the organisation can go live.</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const done = completed.includes(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                    i === idx ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <span className="font-mono">{i + 1}</span>}
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="space-y-3 py-2">
          {step.key === "branding" && (
            <>
              {field("w-dn", "Display name", brand.display_name, (v) => setBrand({ ...brand, display_name: v }))}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  {field("w-col", "Brand colour (hex)", brand.primary_color, (v) => setBrand({ ...brand, primary_color: v }))}
                </div>
                <span className="mb-1 h-8 w-8 rounded border border-border" style={{ background: brand.primary_color }} />
              </div>
              {field("w-logo", "Logo URL (optional, https)", brand.logo_url, (v) => setBrand({ ...brand, logo_url: v }))}
            </>
          )}

          {step.key === "sender_identity" && (
            <>
              {field("w-fn", "Sender name", sender.from_name, (v) => setSender({ ...sender, from_name: v }))}
              {field("w-dom", "Sender domain", sender.sender_domain, (v) => setSender({ ...sender, sender_domain: v.toLowerCase() }), { placeholder: "mail.acmepayments.com" })}
              {field("w-rt", "Reply-to address", sender.reply_to, (v) => setSender({ ...sender, reply_to: v }), { type: "email" })}
              <p className="text-xs text-muted-foreground">
                The reply-to must sit on the sender domain. The domain is recorded as unverified until its DNS records are confirmed.
              </p>
            </>
          )}

          {step.key === "pricing" && (
            <>
              <p className="text-xs text-muted-foreground">
                Internal only — cost never appears on merchant quotes. Prefilled with the standard gateway schedule.
              </p>
              {pricing.map((p, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-xs">Item</Label>
                    <Input value={p.label} onChange={(e) => setPricing(pricing.map((x, j) => (j === i ? { ...x, label: e.target.value, code: x.code || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_") } : x)))} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Cost</Label>
                    <Input inputMode="decimal" value={p.cost} onChange={(e) => setPricing(pricing.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Resale</Label>
                    <Input inputMode="decimal" value={p.resale} onChange={(e) => setPricing(pricing.map((x, j) => (j === i ? { ...x, resale: e.target.value } : x)))} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-xs">Billed</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={p.cadence}
                      onChange={(e) => setPricing(pricing.map((x, j) => (j === i ? { ...x, cadence: e.target.value } : x)))}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="per_transaction">Per txn</option>
                      <option value="one_time">One-time</option>
                    </select>
                  </div>
                  <Button variant="ghost" size="icon" className="col-span-1" aria-label="Remove item" onClick={() => setPricing(pricing.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPricing([...pricing, { code: "", label: "", category: "extra", cadence: "monthly", cost: "0", resale: "0" }])}>
                <Plus className="mr-2 h-4 w-4" /> Add item
              </Button>
            </>
          )}

          {step.key === "team" && (
            <>
              <p className="text-xs text-muted-foreground">Each person gets an email invite. At least one owner or administrator is required.</p>
              {team.map((m, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Email</Label>
                    <Input type="email" value={m.email} onChange={(e) => setTeam(team.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                  </div>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={m.role}
                    onChange={(e) => setTeam(team.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  <Button variant="ghost" size="icon" aria-label="Remove person" onClick={() => setTeam(team.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setTeam([...team, { email: "", role: "member" }])}>
                <Plus className="mr-2 h-4 w-4" /> Add person
              </Button>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
            Back
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {idx === STEPS.length - 1 ? "Save and finish" : "Save and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
