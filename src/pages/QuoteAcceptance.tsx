// Public quote acceptance page — /q/:token
//
// Hosts the Accept-&-Sign CTA from the merchant's quote email. No auth — the
// `accept-quote` edge function validates the unguessable token. Captures
// signatory identity, authority-to-bind, MSA acceptance, and optional ACH
// authority; submits to the edge function which records the audit row,
// flips the quote status, and notifies the assigned CRM owner.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { asArray } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CheckCircle2, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import merchantHausLogo from "@/assets/merchanthaus-logo.png";
import { QUOTE_TERMS_VERSION } from "@/config/quoteSchedule";
import {
  PAYMENT_INSTRUCTIONS,
  hasPaymentInstructions,
} from "@/config/paymentInstructions";

interface PublicQuote {
  id: string;
  quote_number: string;
  status: string;
  tier_name: string;
  billing_cycle: "monthly" | "annual";
  monthly_resale: number;
  annual_resale: number;
  valid_until: string | null;
  client_business_name: string | null;
  client_contact_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_monthly_volume: string | null;
  client_average_ticket: string | null;
  sender_name: string | null;
  sender_title: string | null;
  sender_company: string | null;
  sender_email: string | null;
  lines_snapshot: Array<{
    id: string;
    label: string;
    description: string;
    cost: number;
    resale: number;
    perEvent?: { label: string; resale: number };
    enabled: boolean;
    bundled: boolean;
  }>;
  // Rep-customizable extras persisted by the Quote Generator. Arrays carry an
  // `enabled` flag (unfiltered), so we filter to enabled items when rendering.
  extras_snapshot?: {
    gatewayFees?: Array<{
      id: string;
      label: string;
      description: string;
      cost?: number;
      resale: number;
      cadence: "monthly" | "per_transaction";
      enabled?: boolean;
    }>;
    ancillary?: Array<{
      id: string;
      label: string;
      description: string;
      amount: number;
      cadence: "per_occurrence" | "monthly" | "annual" | "one_time";
      enabled?: boolean;
      waivedDescription?: string;
    }>;
    activation?: { enabled?: boolean; label: string; description?: string; amount: number } | null;
    platformCost?: number;
    platformResale?: number;
  } | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

function QuoteAcceptanceInner() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [acceptedNow, setAcceptedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [signatoryEmail, setSignatoryEmail] = useState("");
  const [authority, setAuthority] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [achToggle, setAchToggle] = useState(false);
  const [achHolder, setAchHolder] = useState("");
  const [achRouting, setAchRouting] = useState("");
  const [achAccount, setAchAccount] = useState("");
  const [achType, setAchType] = useState<"checking" | "savings">("checking");
  const [achBank, setAchBank] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("accept-quote", {
          body: { action: "load", token },
        });
        if (cancelled) return;
        if (error) {
          const msg = (error as Error).message || "Failed to load quote";
          setError(msg);
        } else if ((data as { error?: string })?.error) {
          setError((data as { error: string }).error);
        } else {
          const payload = data as { quote: PublicQuote; already_accepted: boolean };
          setQuote(payload.quote);
          setAlreadyAccepted(!!payload.already_accepted);
          setSignatoryEmail(payload.quote.client_email ?? "");
          setSignatoryName(payload.quote.client_contact_name ?? "");
        }
      } catch (err) {
        if (!cancelled) setError(String((err as Error).message ?? err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  type QuoteLine = PublicQuote["lines_snapshot"][number];
  const enabledLines = useMemo(
    () => asArray<QuoteLine>(quote?.lines_snapshot).filter((l) => l && l.enabled),
    [quote],
  );

  const extras = quote?.extras_snapshot ?? {};
  const gatewayFees = (extras.gatewayFees ?? []).filter((f) => f.enabled);
  const activation = extras.activation ?? null;
  // Ancillary one-time charges (e.g. Setup) plus the activation fee.
  const oneTimeAncillary = (extras.ancillary ?? []).filter(
    (a) => a.enabled && a.cadence === "one_time" && a.amount > 0,
  );
  const activationCharged = !!activation && !!activation.enabled && activation.amount > 0;
  const showPaymentInstructions = activationCharged && hasPaymentInstructions();
  const oneTimeTotal =
    oneTimeAncillary.reduce((s, a) => s + a.amount, 0) +
    (activationCharged ? activation!.amount : 0);
  const hasOneTime = oneTimeTotal > 0;

  // Log payload to console for easier debugging if a downstream render crashes.
  useEffect(() => {
    if (quote) console.debug("[QuoteAcceptance] payload", quote);
  }, [quote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote || !token) return;

    if (!signatoryName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signatoryEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!authority) {
      toast.error("You must confirm you have authority to bind the business.");
      return;
    }
    if (!agreed) {
      toast.error("You must agree to the Master Agreement to proceed.");
      return;
    }
    if (achToggle) {
      if (!achHolder.trim() || !achRouting.trim() || !achAccount.trim()) {
        toast.error("ACH fields are incomplete. Either complete them or untick the ACH section.");
        return;
      }
      if (!/^\d{9}$/.test(achRouting.replace(/\D/g, ""))) {
        toast.error("Routing number must be 9 digits.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-quote", {
        body: {
          token,
          signatory_name: signatoryName.trim(),
          signatory_title: signatoryTitle.trim() || undefined,
          signatory_email: signatoryEmail.trim().toLowerCase(),
          authority_to_bind: true,
          agreed_to_msa: true,
          terms_version: QUOTE_TERMS_VERSION,
          ach: achToggle
            ? {
                authorized: true,
                account_holder: achHolder.trim(),
                routing: achRouting.replace(/\D/g, ""),
                account: achAccount.replace(/\D/g, ""),
                account_type: achType,
                bank_name: achBank.trim() || undefined,
              }
            : undefined,
        },
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; error?: string };
      if (payload?.error) throw new Error(payload.error);
      setAcceptedNow(true);
      toast.success("Acceptance recorded. The MerchantHaus team has been notified.");
    } catch (err) {
      toast.error(`Couldn't record acceptance: ${(err as Error)?.message ?? err}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading / error / accepted states ─────────────────────────────
  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-neutral-500 py-24 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading your quote…</span>
        </div>
      </Shell>
    );
  }

  if (error || !quote) {
    return (
      <Shell>
        <div className="max-w-xl mx-auto py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-[#c81030] mx-auto mb-4" />
          <h1 className="font-serif text-3xl mb-3">We couldn't load this quote.</h1>
          <p className="text-neutral-600 text-sm">
            {error ?? "The link may be invalid or the quote may have expired."} If you
            believe this is a mistake, reply to the email this link came from and your
            MerchantHaus contact will issue a new link.
          </p>
        </div>
      </Shell>
    );
  }

  if (acceptedNow || alreadyAccepted) {
    return (
      <Shell>
        <div className="max-w-xl mx-auto py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
          <h1 className="font-serif text-4xl mb-3">
            {acceptedNow ? "Acceptance recorded." : "Already accepted."}
          </h1>
          <p className="text-neutral-600 text-sm mb-6">
            {acceptedNow
              ? "Thank you. The MerchantHaus team has been notified and will reach out shortly with onboarding next steps."
              : "This quote has already been accepted. If you need to make changes, contact your MerchantHaus representative."}
          </p>
          <div className="bg-neutral-100 border border-neutral-200 rounded-lg px-4 py-3 inline-block text-left text-xs text-neutral-600 font-mono">
            Quote {quote.quote_number}
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Acceptance form ──────────────────────────────────────────────
  return (
    <Shell>
      <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4">
        {/* Header strip */}
        <div className="flex items-center justify-between gap-4 mb-10">
          <div>
            <div className="text-[10px] font-bold tracking-[0.16em] text-[#c81030]">
              PAYMENT GATEWAY QUOTE · CONFIDENTIAL
            </div>
            <div className="text-[11px] text-neutral-500 font-mono mt-1">
              {quote.quote_number}
            </div>
          </div>
          <img src={merchantHausLogo} alt="MerchantHaus" className="h-10 w-auto" />
        </div>

        {/* Hero */}
        <div className="mb-10">
          <div className="text-[10px] font-bold tracking-[0.16em] text-[#c81030] mb-1">
            PREPARED FOR
          </div>
          <div className="w-7 h-[2px] bg-[#c81030] mb-4" />
          <h1 className="font-serif text-4xl sm:text-5xl text-neutral-900 leading-tight tracking-tight">
            {quote.client_business_name ?? "Merchant"}
          </h1>
          <p className="font-serif italic text-lg text-neutral-500 mt-3">
            Gateway services — {quote.tier_name} Plan, {quote.billing_cycle} billing.
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-neutral-200 mb-10 border-y border-neutral-200">
          {[
            { label: "Plan", value: quote.tier_name },
            { label: "Billing", value: quote.billing_cycle === "annual" ? "Annual" : "Monthly" },
            { label: "Monthly", value: fmt(quote.monthly_resale) },
            { label: "Annualized", value: fmt(quote.annual_resale) },
          ].map((s) => (
            <div key={s.label} className="bg-white p-4">
              <div className="font-serif text-xl text-neutral-900">{s.value}</div>
              <div className="text-[10px] font-bold tracking-[0.14em] text-neutral-500 mt-1">
                {s.label.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        {/* Line items */}
        <section className="mb-10">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-[0.16em] text-[#c81030]">01</span>
            <span className="text-[10px] font-bold tracking-[0.14em] text-neutral-500">
              · INCLUDED
            </span>
          </div>
          <div className="w-7 h-[2px] bg-[#c81030] mb-5" />
          <h2 className="font-serif text-2xl mb-5">What's included.</h2>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-neutral-900 text-[10px] tracking-[0.14em] text-neutral-500">
                <th className="text-left py-2 font-bold">ITEM</th>
                <th className="text-left py-2 font-bold">DETAIL</th>
                <th className="text-right py-2 font-bold">PRICE</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200">
                <td className="py-3 font-semibold">Platform Bundle ({quote.tier_name})</td>
                <td className="py-3 text-neutral-500 text-xs">
                  Gateway access, tokenization, PCI tools, support
                </td>
                <td className="py-3 text-right font-semibold">
                  {fmt(quote.monthly_resale - enabledLines.reduce((s, l) => s + (l.bundled ? 0 : l.resale), 0))}/mo
                </td>
              </tr>
              {enabledLines.map((l) => (
                <tr key={l.id} className="border-b border-neutral-200">
                  <td className="py-3">{l.label}</td>
                  <td className="py-3 text-neutral-500 text-xs">
                    {l.perEvent
                      ? `${fmt(l.perEvent.resale)} ${l.perEvent.label}`
                      : l.description}
                  </td>
                  <td className="py-3 text-right text-sm">
                    {l.bundled ? "Included" : `${fmt(l.resale)}/mo`}
                  </td>
                </tr>
              ))}
              {gatewayFees.map((f) => (
                <tr key={f.id} className="border-b border-neutral-200">
                  <td className="py-3">{f.label}</td>
                  <td className="py-3 text-neutral-500 text-xs">
                    {f.cadence === "per_transaction"
                      ? `${fmt(f.resale)} per transaction · billed on actual volume`
                      : f.description}
                  </td>
                  <td className="py-3 text-right text-sm">
                    {f.cadence === "monthly" ? `${fmt(f.resale)}/mo` : `${fmt(f.resale)}/txn`}
                  </td>
                </tr>
              ))}
              {oneTimeAncillary.map((a) => (
                <tr key={a.id} className="border-b border-neutral-200">
                  <td className="py-3">{a.label}</td>
                  <td className="py-3 text-neutral-500 text-xs">{a.description}</td>
                  <td className="py-3 text-right text-sm">{fmt(a.amount)} one-time</td>
                </tr>
              ))}
              {activationCharged && (
                <tr className="border-b border-neutral-200">
                  <td className="py-3">{activation!.label}</td>
                  <td className="py-3 text-neutral-500 text-xs">
                    One-time gateway activation. Payable per the instructions below.
                  </td>
                  <td className="py-3 text-right text-sm">
                    {fmt(activation!.amount)} one-time
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {hasOneTime && (
            <div className="flex justify-end mt-4">
              <div className="text-sm text-neutral-600">
                <span className="text-neutral-500 mr-3">One-time fees</span>
                <span className="font-semibold text-neutral-900">{fmt(oneTimeTotal)}</span>
              </div>
            </div>
          )}

          {showPaymentInstructions && (
            <div className="mt-8 rounded-lg border border-neutral-300 bg-neutral-50 p-5">
              <div className="text-[10px] font-bold tracking-[0.16em] text-[#c81030] mb-3">
                PAYMENT INSTRUCTIONS
              </div>
              <div className="text-sm font-semibold text-neutral-900 mb-3">
                {activation!.label}: {fmt(activation!.amount)}{" "}
                <span className="font-normal text-neutral-500">(one-time)</span>
              </div>
              <table className="text-sm">
                <tbody>
                  <tr>
                    <td className="pr-5 py-1 text-neutral-500 align-top whitespace-nowrap">Bank</td>
                    <td className="py-1 text-neutral-800">{PAYMENT_INSTRUCTIONS.bankName}</td>
                  </tr>
                  <tr>
                    <td className="pr-5 py-1 text-neutral-500 align-top whitespace-nowrap">Account name</td>
                    <td className="py-1 text-neutral-800">
                      {PAYMENT_INSTRUCTIONS.accountName}
                      {PAYMENT_INSTRUCTIONS.signatory &&
                        ` (signatory: ${PAYMENT_INSTRUCTIONS.signatory})`}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-5 py-1 text-neutral-500 align-top whitespace-nowrap">Routing</td>
                    <td className="py-1 font-mono text-neutral-800">
                      {PAYMENT_INSTRUCTIONS.routingNumber}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-5 py-1 text-neutral-500 align-top whitespace-nowrap">Account</td>
                    <td className="py-1 font-mono text-neutral-800">
                      {PAYMENT_INSTRUCTIONS.accountNumber}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-neutral-600 mt-3">
                {PAYMENT_INSTRUCTIONS.activationNote}
              </p>
            </div>
          )}
        </section>

        {/* Acceptance form */}
        <section>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-[0.16em] text-[#c81030]">02</span>
            <span className="text-[10px] font-bold tracking-[0.14em] text-neutral-500">
              · ACCEPTANCE
            </span>
          </div>
          <div className="w-7 h-[2px] bg-[#c81030] mb-5" />
          <h2 className="font-serif text-3xl mb-3">Sign to commence.</h2>
          <p className="text-sm text-neutral-600 mb-6">
            Submitting this form constitutes binding acceptance of the MerchantHaus
            Gateway Platform &amp; Services Agreement, the Fee Schedule shown above, and
            the billing and termination terms in the attached PDF. Gateway provisioning
            begins within 5 business days.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="sn">Full legal name *</Label>
                <Input
                  id="sn"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="st">Title</Label>
                <Input
                  id="st"
                  value={signatoryTitle}
                  onChange={(e) => setSignatoryTitle(e.target.value)}
                  placeholder="e.g. Owner, CEO, CFO"
                  autoComplete="organization-title"
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="se">Email *</Label>
                <Input
                  id="se"
                  type="email"
                  value={signatoryEmail}
                  onChange={(e) => setSignatoryEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <Separator />

            {/* Authority + MSA */}
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={authority}
                  onCheckedChange={(c) => setAuthority(!!c)}
                  className="mt-0.5"
                />
                <span className="text-sm text-neutral-700">
                  I confirm I have legal authority to bind{" "}
                  <strong>{quote.client_business_name ?? "the Merchant"}</strong> to this
                  agreement.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(c) => setAgreed(!!c)}
                  className="mt-0.5"
                />
                <span className="text-sm text-neutral-700">
                  I agree to the MerchantHaus Gateway Platform &amp; Services Agreement
                  (Master Agreement, Appendix A) and the Fee Schedule above.
                </span>
              </label>
            </div>

            <Separator />

            {/* Optional ACH */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer mb-3">
                <Checkbox
                  checked={achToggle}
                  onCheckedChange={(c) => setAchToggle(!!c)}
                  className="mt-0.5"
                />
                <span className="text-sm text-neutral-700">
                  <strong>(Optional)</strong> Authorize ACH debit now to streamline
                  onboarding. We capture last-4 details on this page; full account
                  details are tokenized separately in our billing system.
                </span>
              </label>
              {achToggle && (
                <div className="grid sm:grid-cols-2 gap-3 pl-7 border-l-2 border-[#c81030]/30 ml-1">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="ach-holder">Account holder name</Label>
                    <Input
                      id="ach-holder"
                      value={achHolder}
                      onChange={(e) => setAchHolder(e.target.value)}
                      placeholder="As shown on bank statement"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ach-routing">Routing number (9 digits)</Label>
                    <Input
                      id="ach-routing"
                      inputMode="numeric"
                      maxLength={11}
                      value={achRouting}
                      onChange={(e) => setAchRouting(e.target.value)}
                      placeholder="123456789"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ach-account">Account number</Label>
                    <Input
                      id="ach-account"
                      inputMode="numeric"
                      value={achAccount}
                      onChange={(e) => setAchAccount(e.target.value)}
                      placeholder="Account number"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ach-type">Account type</Label>
                    <Select
                      value={achType}
                      onValueChange={(v) => setAchType(v as "checking" | "savings")}
                    >
                      <SelectTrigger id="ach-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ach-bank">Bank name (optional)</Label>
                    <Input
                      id="ach-bank"
                      value={achBank}
                      onChange={(e) => setAchBank(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={submitting || !authority || !agreed}
                className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 text-white border-l-[3px] border-l-[#c81030] py-6 px-8 text-base font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording acceptance…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" /> Accept &amp; Sign
                  </>
                )}
              </Button>
              <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
                On submit we record your name, email, IP address, browser, and a hash of
                the Fee Schedule shown above as an immutable audit trail. A copy of the
                signed quote is emailed to you, and your MerchantHaus contact is notified
                to generate the contract.
              </p>
            </div>
          </form>
        </section>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-neutral-200 text-[10px] tracking-[0.14em] text-neutral-400 text-center">
          {(quote.sender_company ?? "MERCHANTHAUS LLC").toUpperCase()} · TERMS VERSION{" "}
          {QUOTE_TERMS_VERSION} · CONFIDENTIAL
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // fixed inset-0 + overflow-y-auto escapes any parent app-shell layout
  // (the dashboard chrome) and gives this public page its own scroll
  // container. Matches the pattern used by TermsProcessing and Apply.
  return (
    <div
      className="fixed inset-0 z-50 bg-[#fafafa] text-neutral-900 font-sans overflow-y-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {children}
    </div>
  );
}

export default function QuoteAcceptance() {
  return (
    <ErrorBoundary>
      <QuoteAcceptanceInner />
    </ErrorBoundary>
  );
}
