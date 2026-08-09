// Quick Scope — the one-screen public alternative to the six-step /scoping
// wizard. Seven fields, no steps, no progress bar. It submits through the same
// `submit-scoping-request` edge function and lands in the same
// `scoping_submissions` table, so nothing server-side had to change.
//
// Shape follows src/pages/Contact.tsx (local useState, hand-rolled field
// primitives, honeypot, success overlay) — the convention for public forms in
// this repo. Public forms here do not use react-hook-form or zod; that is an
// internal-page convention.
import { useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import merchanthausLogo from "@/assets/merchanthaus-logo.png";
import {
  SCOPING_ACK_TEXT,
  SCOPING_CAUTION,
  SCOPING_DISCLOSURES,
  SCOPING_SECTIONS,
} from "@/config/scopingFields";

type FormStatus = "idle" | "submitting" | "success" | "error";

interface QuickScopeForm {
  legal_business_name: string;
  product_description: string;
  monthly_volume: string;
  currently_processing: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

const EMPTY: QuickScopeForm = {
  legal_business_name: "",
  product_description: "",
  monthly_volume: "",
  currently_processing: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s()+.-]{7,}$/;

// Volume is a range here, not the free-number input the full form uses. The
// column is text, so the range label stores as-is.
const VOLUME_RANGES = [
  "Under $10,000 / month",
  "$10,000 – $50,000 / month",
  "$50,000 – $250,000 / month",
  "$250,000 – $1,000,000 / month",
  "Over $1,000,000 / month",
  "Not sure yet",
];

// Reuse the exact option strings the full scoping form uses, so the two forms
// never drift into two different vocabularies for the same column.
const PROCESSING_OPTIONS =
  SCOPING_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === "currently_processing")?.options ?? [];

// The compressed four-point disclosure. Headings and text are DERIVED from
// SCOPING_DISCLOSURES — no new legal language is authored here. The full ten
// points are one click away at /scoping-disclosures.
const SUMMARY_HEADINGS = [
  "NOT AN APPLICATION",
  "ROLE OF MERCHANT HAUS",
  "INDICATIVE PRICING ONLY",
  "SENSITIVE DATA",
];

const firstSentence = (body: string) => {
  const end = body.indexOf(". ");
  return end === -1 ? body : body.slice(0, end + 1);
};

const DISCLOSURE_SUMMARY = SUMMARY_HEADINGS.flatMap((heading) => {
  const entry = SCOPING_DISCLOSURES.find((d) => d.heading === heading);
  return entry ? [{ heading: entry.heading, body: firstSentence(entry.body) }] : [];
});

export default function QuickScope() {
  const [form, setForm] = useState<QuickScopeForm>(EMPTY);
  const [accepted, setAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitting = status === "submitting";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = (): string | null => {
    if (!form.legal_business_name.trim()) return "Please enter your legal business name.";
    if (!form.product_description.trim()) return "Please tell us what you sell.";
    if (!form.monthly_volume) return "Please pick a monthly card volume range.";
    if (!form.currently_processing) return "Please tell us whether you are currently processing.";
    if (!form.contact_name.trim()) return "Please enter a contact name.";
    if (!EMAIL_RE.test(form.contact_email.trim())) return "Please enter a valid email address.";
    if (!PHONE_RE.test(form.contact_phone.trim())) return "Please enter a valid phone number.";
    if (!accepted) return "Please acknowledge the disclosures before submitting.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (honeypot) { setStatus("success"); return; }

    const problem = validate();
    if (problem) {
      setStatus("error");
      setErrorMessage(problem);
      toast.error(problem);
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    // ─── Deliberate client-side shim ───────────────────────────────────────
    // The item asks for ONE "contact name" field, but the edge function and
    // the scoping_submissions table both require contact_first_name AND
    // contact_last_name, plus a NOT-NULL acknowledgement_name. Rather than
    // change a Deno edge function (which no local typecheck covers) or add a
    // migration, we split here:
    //   • first token before the first space  → contact_first_name
    //   • the remainder                       → contact_last_name
    //   • single-word name                    → both fields get that word, so
    //     the NOT NULL constraint is satisfied without inventing a surname
    //   • the full typed name                 → acknowledgement_name
    // The single required checkbox below carries disclosures_accepted.
    const fullName = form.contact_name.trim().replace(/\s+/g, " ");
    const splitAt = fullName.indexOf(" ");
    const firstName = splitAt === -1 ? fullName : fullName.slice(0, splitAt);
    const lastName = splitAt === -1 ? fullName : fullName.slice(splitAt + 1);
    // ───────────────────────────────────────────────────────────────────────

    const payload = {
      legal_business_name: form.legal_business_name.trim(),
      product_description: form.product_description.trim(),
      monthly_volume: form.monthly_volume,
      currently_processing: form.currently_processing,
      contact_first_name: firstName,
      contact_last_name: lastName,
      contact_email: form.contact_email.trim().toLowerCase(),
      contact_phone: form.contact_phone.trim(),
      acknowledgement_name: fullName,
      disclosures_accepted: true,
      // Marks the row as the short form so triage knows the blank fields are
      // by design, not an abandoned wizard.
      additional_notes: "Submitted via Quick Scope (/scope) — short form, seven fields.",
      user_agent: navigator.userAgent,
    };

    try {
      // Same call shape as src/pages/Scoping.tsx.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://cuqjaddtmkotgvfsgcol.supabase.co";
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/submit-scoping-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned an unexpected response. Please try again shortly.");
      }
      const result = await res.json();
      if (!res.ok) {
        const msg = result.issues
          ? result.issues.map((i: { field: string; message: string }) => `${i.field}: ${i.message}`).join(", ")
          : result.error || "Submission failed";
        throw new Error(msg);
      }
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      setStatus("error");
      setErrorMessage(message);
      toast.error(message);
    }
  };

  return (
    <div className="merchant-form fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
        <div className="max-w-3xl mx-auto">
          <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
        </div>
      </header>

      <div className="p-3 md:p-8">
        <div className="max-w-3xl mx-auto space-y-5 md:space-y-6">
          <div className="space-y-1.5 md:space-y-2 pt-1 md:pt-2">
            <p className="label-caps text-primary">Quick Scope</p>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-foreground">
              Seven questions. About two minutes.
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Enough for us to size your setup and come back with indicative options. Need the
              detailed version? Use the{" "}
              <a href="/scoping" className="font-medium underline">full scoping form</a>.
            </p>
          </div>

          <section className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm overflow-hidden">
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-5">
              {status === "error" && errorMessage && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Honeypot */}
              <div aria-hidden="true" className="absolute opacity-0 pointer-events-none -z-10" style={{ position: "absolute", left: "-9999px" }}>
                <label htmlFor="company_url">Company URL</label>
                <input id="company_url" name="company_url" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>

              <Field label="Legal business name" required htmlFor="legal_business_name">
                <Input id="legal_business_name" name="legal_business_name" type="text" placeholder="Acme Holdings LLC" value={form.legal_business_name} onChange={handleChange} disabled={submitting} />
              </Field>

              <Field label="What do you sell?" required htmlFor="product_description">
                <Textarea id="product_description" name="product_description" rows={4} placeholder="Describe your products or services, and how customers buy them." value={form.product_description} onChange={handleChange} disabled={submitting} />
              </Field>

              <Field label="Monthly card volume" required htmlFor="monthly_volume">
                <Select id="monthly_volume" name="monthly_volume" value={form.monthly_volume} onChange={handleChange} disabled={submitting}>
                  <option value="">Select a range…</option>
                  {VOLUME_RANGES.map((range) => (
                    <option key={range} value={range}>{range}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Are you currently processing card payments?" required htmlFor="currently_processing">
                <Select id="currently_processing" name="currently_processing" value={form.currently_processing} onChange={handleChange} disabled={submitting}>
                  <option value="">Select one…</option>
                  {PROCESSING_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Contact name" required htmlFor="contact_name">
                <Input id="contact_name" name="contact_name" type="text" placeholder="Jane Doe" autoComplete="name" value={form.contact_name} onChange={handleChange} disabled={submitting} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                <Field label="Email" required htmlFor="contact_email">
                  <Input id="contact_email" name="contact_email" type="email" placeholder="jane@company.com" autoComplete="email" value={form.contact_email} onChange={handleChange} disabled={submitting} />
                </Field>
                <Field label="Phone" required htmlFor="contact_phone">
                  <Input id="contact_phone" name="contact_phone" type="tel" placeholder="(555) 123-4567" autoComplete="tel" value={form.contact_phone} onChange={handleChange} disabled={submitting} />
                </Field>
              </div>

              {/* Sensitive-data caution — verbatim from SCOPING_CAUTION. */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-foreground">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                <span>{SCOPING_CAUTION}</span>
              </div>

              {/* Compressed four-point disclosure + link to the full text. */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 md:p-4 space-y-3">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Before you submit
                </p>
                <ul className="space-y-2">
                  {DISCLOSURE_SUMMARY.map((d) => (
                    <li key={d.heading} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{d.heading}. </span>
                      {d.body}
                    </li>
                  ))}
                </ul>
                <a
                  href="/scoping-disclosures"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-medium text-primary underline"
                >
                  Read the full disclosures
                </a>
              </div>

              <label className="flex items-start gap-3 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-input accent-primary"
                />
                <span>
                  {SCOPING_ACK_TEXT} <span className="text-destructive">*</span>
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
                ) : (
                  <>Submit<ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>
          </section>
        </div>
      </div>

      {status === "success" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-lg text-center space-y-4 animate-scale-in">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Got it — thank you.</h1>
            <p className="text-muted-foreground">
              We have what we need to make a start. Someone from our team will follow up within one
              business day.
            </p>
            <a
              href="https://merchanthaus.io"
              className="inline-block w-full h-11 leading-[2.75rem] rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Return to merchanthaus.io
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Local form primitives (same boxed style as Contact.tsx) ───

function Field({ label, required, htmlFor, children }: { label: string; required?: boolean; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

const FIELD_BASE =
  "w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed";
const FIELD_FILLED =
  "bg-primary text-primary-foreground font-medium border-primary focus:bg-card focus:text-foreground focus:font-normal focus:border-primary focus:ring-primary/20";
const FIELD_EMPTY = "bg-card text-foreground border-input focus:border-primary focus:ring-primary/20";

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  const filled = !focused && typeof props.value === "string" && props.value.trim().length > 0;
  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      className={cn(FIELD_BASE, filled ? FIELD_FILLED : FIELD_EMPTY, props.className)}
    />
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  const filled = !focused && typeof props.value === "string" && props.value.trim().length > 0;
  return (
    <textarea
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      className={cn(FIELD_BASE, "min-h-[110px]", filled ? FIELD_FILLED : FIELD_EMPTY, props.className)}
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const [focused, setFocused] = useState(false);
  const filled = !focused && typeof props.value === "string" && props.value.length > 0;
  return (
    <select
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      className={cn(FIELD_BASE, filled ? FIELD_FILLED : FIELD_EMPTY, props.className)}
    />
  );
}
