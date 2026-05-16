import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activeSupabase as supabase } from "@/integrations/supabase/activeClient";
import { useAuth } from "@/contexts/AuthContext";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  business_type: string;
  service_type: "processing" | "gateway_only";
  monthly_volume: string;
  website: string;
  message: string;
  referral_source: string;
}

const initial: FormState = {
  full_name: "",
  email: "",
  phone: "",
  company_name: "",
  business_type: "",
  service_type: "processing",
  monthly_volume: "",
  website: "",
  message: "",
  referral_source: "",
};

export default function PortalNewReferral() {
  const navigate = useNavigate();
  const { referrer } = useAuth();
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string; detail?: string; referenceId?: string } | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!referrer) {
      const msg = "No referrer profile loaded. Please refresh and try again.";
      setStatus({ kind: "error", message: "Couldn't submit referral", detail: msg });
      toast.error("Couldn't submit referral", { description: msg });
      return;
    }
    if (!form.full_name.trim() || !form.email.trim() || !form.company_name.trim()) {
      const msg = "Contact name, email, and company name are required.";
      setStatus({ kind: "error", message: "Missing required fields", detail: msg });
      toast.error("Missing required fields", { description: msg });
      return;
    }

    setSubmitting(true);
     
    const payload: unknown = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      company_name: form.company_name.trim(),
      business_type: form.business_type.trim() || null,
      service_type: form.service_type,
      monthly_volume: form.monthly_volume.trim() || null,
      website: form.website.trim() || null,
      message: form.message.trim() || null,
      status: "pending",
      referrer_id: referrer.id,
      referral_source: form.referral_source.trim() || referrer.full_name,
    };
    const { data, error } = await supabase
      .from("applications")
      .insert(payload)
      .select("id")
      .single();

    setSubmitting(false);

    if (error) {
      setStatus({ kind: "error", message: "Submission failed", detail: error.message });
      toast.error("Submission failed", { description: error.message, duration: 8000 });
      return;
    }

    const referenceId = data?.id as string | undefined;
    const shortRef = referenceId ? referenceId.slice(0, 8).toUpperCase() : "";
    const successMsg = `${payload.company_name} has been submitted. Our team will review it within 1–2 business days.`;
    setStatus({
      kind: "success",
      message: "Referral submitted",
      detail: successMsg,
      referenceId,
    });
    toast.success("Referral submitted", {
      description: referenceId ? `Reference ID: ${shortRef} — ${successMsg}` : successMsg,
      duration: 8000,
    });
    setForm(initial);
    setTimeout(() => navigate("/affiliate"), 4000);
  };

  return (
    <PortalLayout
      pageTitle="Submit a Referral"
      headerActions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/affiliate">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
      }
    >
      {referrer && (
        <Card className="p-4 mb-4 max-w-2xl border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold))]/5">
          <p className="text-xs uppercase tracking-wider font-semibold mb-1 text-[hsl(var(--gold))]">
            Program terms
          </p>
          <p className="text-sm text-muted-foreground">
            You earn <strong>{(referrer.commission_rate * 100).toFixed(0)}%</strong> of company commission per
            referral, capped at{" "}
            <strong>${referrer.monthly_cap_per_merchant.toLocaleString()} per account, per month</strong> —
            recurring for the lifetime of each account, with no overall ceiling. Plus a{" "}
            <strong>${referrer.bonus_amount}</strong> bonus for every{" "}
            <strong>{referrer.bonus_milestone_count}</strong> successfully boarded merchants.
          </p>
        </Card>
      )}
      <Card className="p-6 max-w-2xl">
        <p className="text-sm text-muted-foreground mb-6">
          Submit a merchant you'd like to refer. Our team will reach out to them directly and update the status
          on your dashboard as the opportunity progresses. You don't need to share every detail — just enough
          for us to make contact.
        </p>

        {status && (
          <div
            role="status"
            aria-live="polite"
            className={`mb-6 flex items-start gap-3 rounded-lg border p-4 text-sm ${
              status.kind === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {status.kind === "success" ? (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-semibold">{status.message}</p>
              {status.detail && <p className="mt-0.5 opacity-90">{status.detail}</p>}
              {status.kind === "success" && status.referenceId && (
                <div className="mt-3 rounded-md border border-emerald-500/30 bg-background/60 p-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                    Submission reference ID
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="font-mono text-sm font-semibold break-all">
                      {status.referenceId}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(status.referenceId!);
                        toast.success("Reference ID copied");
                      }}
                      className="text-xs underline hover:no-underline opacity-80"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="mt-1 text-xs opacity-75">
                    Save this ID — quote it if you contact support about this referral.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">Contact name *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                required
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="company_name">Company name *</Label>
              <Input
                id="company_name"
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                required
                placeholder="Acme Coffee Roasters"
              />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                placeholder="jane@acme.com"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 123 4567"
              />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://acme.com"
              />
            </div>
            <div>
              <Label htmlFor="business_type">Business type</Label>
              <Input
                id="business_type"
                value={form.business_type}
                onChange={(e) => set("business_type", e.target.value)}
                placeholder="Retail / E-commerce / Restaurant…"
              />
            </div>
            <div>
              <Label htmlFor="service_type">Service interest</Label>
              <Select value={form.service_type} onValueChange={(v: "processing" | "gateway_only") => set("service_type", v)}>
                <SelectTrigger id="service_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="processing">Full processing</SelectItem>
                  <SelectItem value="gateway_only">Gateway only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="monthly_volume">Approx. monthly volume</Label>
              <Input
                id="monthly_volume"
                value={form.monthly_volume}
                onChange={(e) => set("monthly_volume", e.target.value)}
                placeholder="$50,000"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="referral_source">Referral source</Label>
              <Input
                id="referral_source"
                value={form.referral_source}
                onChange={(e) => set("referral_source", e.target.value)}
                placeholder={referrer ? `Defaults to "${referrer.full_name}"` : "How did you hear about this lead?"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Optional — leave blank to use your name as the source.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="message">Notes for our team</Label>
            <Textarea
              id="message"
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Anything we should know — current processor, timing, contact preferences…"
              rows={4}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              <Send className="h-4 w-4 mr-2" />
              {submitting ? "Submitting…" : "Submit referral"}
            </Button>
            <p className="text-xs text-muted-foreground">
              We'll reply with status updates on your dashboard.
            </p>
          </div>
        </form>
      </Card>
    </PortalLayout>
  );
}
