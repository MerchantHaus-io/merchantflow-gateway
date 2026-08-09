import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, Building2, CheckCircle, CheckCircle2, CreditCard, Info, Landmark, Scale, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import merchanthausLogo from "@/assets/merchanthaus-logo.png";
import {
  SCOPING_ACK_TEXT,
  SCOPING_CAUTION,
  SCOPING_DISCLOSURES,
  SCOPING_SECTIONS,
  type ScopingField,
  type ScopingSection,
} from "@/config/scopingFields";

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

type ScopingForm = Record<string, string | string[] | boolean>;

const ALL_FIELDS: ScopingField[] = SCOPING_SECTIONS.flatMap(s => s.fields);

const initialState: ScopingForm = {
  ...Object.fromEntries(ALL_FIELDS.map(f => [f.key, f.type === "multi" ? [] : ""])),
  acknowledgement_name: "",
  acknowledgement_title: "",
  disclosures_accepted: false,
};

const REQUIRED_KEYS = [
  ...ALL_FIELDS.filter(f => f.required).map(f => f.key),
  "acknowledgement_name",
];

const steps: { label: string; icon: typeof Building2; section?: ScopingSection }[] = [
  { label: "Business Profile", icon: Building2, section: SCOPING_SECTIONS[0] },
  { label: "Products & Processing", icon: CreditCard, section: SCOPING_SECTIONS[1] },
  { label: "Payment Methods & Technical", icon: Zap, section: SCOPING_SECTIONS[2] },
  { label: "Risk & Compliance", icon: Scale, section: SCOPING_SECTIONS[3] },
  { label: "Funding & Timeline", icon: Landmark, section: SCOPING_SECTIONS[4] },
  { label: "Review & Submit", icon: CheckCircle2 },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s()+.-]{7,}$/;

// #192: the review step used to render all ten disclosures in full inside a
// scroll box. It now shows every heading with only the first sentence of that
// entry's own body — DERIVED from SCOPING_DISCLOSURES, no new legal language
// authored here — and links to the full text at /scoping-disclosures. Same
// derivation as src/pages/QuickScope.tsx.
const firstSentence = (body: string) => {
  const end = body.indexOf(". ");
  return end === -1 ? body : body.slice(0, end + 1);
};

const DISCLOSURE_SUMMARY = SCOPING_DISCLOSURES.map(d => ({
  heading: d.heading,
  body: firstSentence(d.body),
}));

export default function Scoping() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const oppId = searchParams.get("opp_id");

  const [form, setForm] = useState<ScopingForm>(initialState);
  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [stepIndex]);

  const str = (key: string) => (typeof form[key] === "string" ? (form[key] as string) : "");
  const arr = (key: string) => (Array.isArray(form[key]) ? (form[key] as string[]) : []);

  const handleChange = (key: string, value: string | string[] | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));
  const handleBlur = (key: string) => setTouched(prev => ({ ...prev, [key]: true }));

  // #193: soft validation on step exit — leaving a step marks its fields
  // touched so any problem shows up in place, on that step. It never blocks
  // the move forward.
  const markStepTouched = (index: number) => {
    const section = steps[index]?.section;
    if (!section) return;
    setTouched(prev => ({
      ...prev,
      ...Object.fromEntries(section.fields.map(f => [f.key, true])),
    }));
  };

  const toggleMulti = (key: string, option: string) => {
    const current = arr(key);
    handleChange(key, current.includes(option) ? current.filter(v => v !== option) : [...current, option]);
  };

  const fieldError = (key: string): string | null => {
    const field = ALL_FIELDS.find(f => f.key === key);
    const value = str(key).trim();
    if ((field?.required || key === "acknowledgement_name") && !value) return "Required";
    if (!value) return null;
    if (field?.type === "email" && !EMAIL_RE.test(value)) return "Enter a valid email address";
    if (field?.type === "phone" && !PHONE_RE.test(value)) return "Enter a valid phone number";
    return null;
  };

  const getError = (key: string) => (touched[key] || showAllErrors ? fieldError(key) : null);

  const missingRequired = useMemo(
    () => REQUIRED_KEYS.filter(k => !!fieldError(k)),
    [form],
  );
  const progress = Math.round(((REQUIRED_KEYS.length - missingRequired.length) / REQUIRED_KEYS.length) * 100);
  const canSubmit = missingRequired.length === 0 && form.disclosures_accepted === true;

  const sectionProgress = (section: ScopingSection) => {
    const required = section.fields.filter(f => f.required);
    const answered = section.fields.filter(f =>
      f.type === "multi" ? arr(f.key).length > 0 : str(f.key).trim().length > 0,
    );
    return {
      answered: answered.length,
      total: section.fields.length,
      requiredMissing: required.filter(f => !!fieldError(f.key)).length,
    };
  };

  // #193: which step owns a given field. The acknowledgement fields are not in
  // any SCOPING_SECTIONS entry — they live on the final Review step.
  const stepOfKey = (key: string) => {
    const index = steps.findIndex(s => s.section?.fields.some(f => f.key === key));
    return index === -1 ? steps.length - 1 : index;
  };
  // Every step that still has a required gap, in order. Used both to decide
  // where (if anywhere) to move the user and to list the gaps on Review.
  const incompleteSteps = [...new Set(missingRequired.map(stepOfKey))].sort((a, b) => a - b);
  // The earliest step that still has something missing (null when the only
  // outstanding item is the disclosure checkbox, which lives on Review).
  const firstIncompleteStep = incompleteSteps.length ? incompleteSteps[0] : null;

  const handleSubmit = async () => {
    setShowAllErrors(true);
    if (!canSubmit) {
      // #193: never bounce back to step 0. Errors are revealed in place by
      // showAllErrors; we only move the user if nothing on the current step is
      // wrong, and then only to the FIRST step that actually has a gap.
      const currentStepHasGap = missingRequired.some(k => stepOfKey(k) === stepIndex);
      const target = !currentStepHasGap && firstIncompleteStep !== null && firstIncompleteStep !== stepIndex
        ? firstIncompleteStep
        : null;
      toast({
        variant: "destructive",
        title: "Almost there",
        description: target === null
          ? "Please complete the highlighted fields and tick the acknowledgement."
          : `Some required fields are still empty — taking you to “${steps[target].label}”.`,
      });
      if (target !== null) setStepIndex(target);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      payload.user_agent = navigator.userAgent;
      if (oppId) payload.opportunity_id = oppId;
      const utmSource = searchParams.get("utm_source");
      const utmMedium = searchParams.get("utm_medium");
      const utmCampaign = searchParams.get("utm_campaign");
      if (utmSource || utmMedium || utmCampaign) {
        payload.utm = { source: utmSource, medium: utmMedium, campaign: utmCampaign };
      }

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
      setIsSubmitted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed";
      toast({ variant: "destructive", title: "Submission failed", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Submitted screen (no auto-redirect) ───
  if (isSubmitted) {
    return (
      <div className="merchant-form min-h-full w-full bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Scoping form received</h1>
          <p className="text-muted-foreground">
            Thank you. Our team will follow up within one business day to arrange a scoping call and walk through anything left open.
          </p>
          <a href="https://merchanthaus.io" className="inline-block mt-4 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Return to merchanthaus.io
          </a>
        </div>
      </div>
    );
  }

  const currentStep = steps[stepIndex];

  return (
    <div className="merchant-form h-full w-full overflow-y-auto bg-background" style={{ WebkitOverflowScrolling: "touch" }}>
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
          {/* #189: the numeric percentage is gone — the per-section counts in
              the Status Snapshot are the readout. The bar stays as a quiet
              visual cue; the figure is still exposed to assistive tech. */}
          <div
            className="h-1.5 w-20 md:h-2 md:w-32 rounded-full bg-secondary overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Required fields completed"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <div className="p-3 md:p-8">
        <div className="max-w-6xl mx-auto space-y-3 md:space-y-6">
          <div className="space-y-1">
            <h1 className="text-lg md:text-2xl font-bold text-foreground">Payments &amp; Gateway Scoping Form</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              A requirements questionnaire — not an application. Answer what you know; we will cover the rest on a call.
            </p>
          </div>

          {/* Step Navigation */}
          <nav className="flex items-center justify-between gap-1 md:gap-2 overflow-x-auto pb-1 md:pb-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === stepIndex;
              const isCompleted = index < stepIndex;
              return (
                <button key={step.label} onClick={() => setStepIndex(index)} className={cn(
                  "flex items-center gap-1.5 md:gap-3 px-2 py-1.5 md:px-4 md:py-3 rounded-lg flex-1 min-w-0 transition-all border-b-2",
                  isActive ? "bg-card border-primary shadow-sm" : isCompleted ? "bg-card/50 border-primary/50" : "bg-transparent border-transparent hover:bg-card/50",
                )}>
                  <div className={cn("w-6 h-6 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0", isActive ? "bg-primary/10 text-primary" : isCompleted ? "bg-primary/5 text-primary/70" : "bg-secondary text-muted-foreground")}>
                    <StepIcon className="w-3 h-3 md:w-5 md:h-5" />
                  </div>
                  <div className="text-left min-w-0 hidden sm:block">
                    <p className={cn("text-xs md:text-sm font-medium truncate", isActive ? "text-primary" : isCompleted ? "text-primary/70" : "text-muted-foreground")}>{step.label}</p>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
            <section className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm overflow-visible">
              <div className="p-4 md:p-6">
                <div className="mb-4 md:mb-6">
                  <h2 className="text-base md:text-xl font-semibold text-foreground">{currentStep.label}</h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Required fields marked with <span className="text-destructive">*</span> — everything else is optional.</p>
                </div>

                {stepIndex === 0 && (
                  <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 md:p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs md:text-sm text-foreground">{SCOPING_CAUTION}</p>
                    </div>
                  </div>
                )}

                {currentStep.section ? (
                  <SectionFields
                    section={currentStep.section}
                    str={str}
                    arr={arr}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    getError={getError}
                    toggleMulti={toggleMulti}
                  />
                ) : (
                  <ReviewStep
                    str={str}
                    arr={arr}
                    form={form}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    getError={getError}
                    canSubmit={canSubmit}
                    isSubmitting={isSubmitting}
                    onSubmit={handleSubmit}
                    incompleteSteps={showAllErrors ? incompleteSteps.filter(i => i !== stepIndex) : []}
                    stepLabels={steps.map(s => s.label)}
                    onGoToStep={setStepIndex}
                  />
                )}
              </div>

              {stepIndex < steps.length - 1 && (
                <div className="px-4 py-3 md:px-6 md:py-4 bg-muted border-t border-border flex items-center justify-between">
                  <button type="button" className="rounded-lg border border-border bg-card px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-40" onClick={() => setStepIndex(p => Math.max(0, p - 1))} disabled={stepIndex === 0}>Back</button>
                  <button type="button" className="rounded-lg bg-primary px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90" onClick={() => { markStepTouched(stepIndex); setStepIndex(p => Math.min(steps.length - 1, p + 1)); }}>Next Step</button>
                </div>
              )}
            </section>

            {/* Sidebar */}
            <aside className="space-y-3 md:space-y-4">
              <div className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm p-3 md:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
                  <AlertCircle className="w-4 h-4 text-primary" />
                  Status Snapshot
                </div>
                <div className="space-y-4">
                  {SCOPING_SECTIONS.map(section => {
                    const { answered, total } = sectionProgress(section);
                    return <SectionStatus key={section.key} label={section.label} count={answered} total={total} />;
                  })}
                </div>
              </div>

              <div className="bg-info/10 rounded-xl md:rounded-2xl border border-info/20 p-3 md:p-5">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Requirements only</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No SSN, date of birth, bank details, card numbers or ID documents are collected here. If we need those at application stage, we will request them through a secure channel.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step renderers
// ─────────────────────────────────────────────────────────────────────────────

interface SectionFieldsProps {
  section: ScopingSection;
  str: (key: string) => string;
  arr: (key: string) => string[];
  onChange: (key: string, value: string | string[] | boolean) => void;
  onBlur: (key: string) => void;
  getError: (key: string) => string | null;
  toggleMulti: (key: string, option: string) => void;
}

function SectionFields({ section, str, arr, onChange, onBlur, getError, toggleMulti }: SectionFieldsProps) {
  return (
    <div className="space-y-3 md:space-y-4">
      {section.fields.map(field => {
        const error = getError(field.key);
        if (field.type === "multi") {
          const selected = arr(field.key);
          return (
            <div key={field.key} className="space-y-1.5">
              <p className="text-xs md:text-sm font-medium text-foreground">{field.label}</p>
              {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {field.options?.map(option => {
                  const checked = selected.includes(option);
                  return (
                    <label key={option} className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs md:text-sm cursor-pointer transition-colors",
                      // #188: selected reads as a tinted chip with a 2px accent
                      // edge instead of a solid emerald block.
                      checked
                        ? "border-primary border-l-2 bg-primary/10 text-foreground font-medium"
                        : "border-input bg-card text-foreground hover:bg-secondary",
                    )}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleMulti(field.key, option)}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        }
        return (
          <Field key={field.key} label={field.label} required={field.required} hint={field.hint} error={error}>
            {field.type === "textarea" ? (
              <Textarea
                value={str(field.key)}
                placeholder={field.placeholder}
                rows={3}
                onChange={e => onChange(field.key, e.target.value)}
                onBlur={() => onBlur(field.key)}
                hasError={!!error}
              />
            ) : field.type === "select" ? (
              <SelectInput
                value={str(field.key)}
                onChange={e => onChange(field.key, e.target.value)}
                onBlur={() => onBlur(field.key)}
                hasError={!!error}
              >
                <option value="">Select…</option>
                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
            ) : field.type === "number" ? (
              <NumberInput
                value={str(field.key)}
                placeholder={field.placeholder}
                onChange={e => onChange(field.key, e.target.value)}
                onBlur={() => onBlur(field.key)}
                hasError={!!error}
              />
            ) : (
              <Input
                type={field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "phone" ? "tel" : "text"}
                value={str(field.key)}
                placeholder={field.placeholder}
                onChange={e => onChange(field.key, e.target.value)}
                onBlur={() => onBlur(field.key)}
                hasError={!!error}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

interface ReviewProps {
  str: (key: string) => string;
  arr: (key: string) => string[];
  form: ScopingForm;
  onChange: (key: string, value: string | string[] | boolean) => void;
  onBlur: (key: string) => void;
  getError: (key: string) => string | null;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  /** Steps (other than this one) that still have a required gap, after a submit attempt. */
  incompleteSteps: number[];
  stepLabels: string[];
  onGoToStep: (index: number) => void;
}

function ReviewStep({ str, arr, form, onChange, onBlur, getError, canSubmit, isSubmitting, onSubmit, incompleteSteps, stepLabels, onGoToStep }: ReviewProps) {
  return (
    <div className="space-y-6">
      {SCOPING_SECTIONS.map(section => {
        // #190: only answered fields get their own row. Everything left blank
        // collapses into one expandable line so the review reads as a summary
        // of what you said, not a wall of "Not provided".
        const answered = section.fields.filter(f =>
          (f.type === "multi" ? arr(f.key).join(", ") : str(f.key)).trim().length > 0,
        );
        const blank = section.fields.filter(f => !answered.includes(f));
        return (
          <div key={section.key} className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">{section.label}</h3>
            {answered.length > 0 ? (
              <dl className="grid gap-3 sm:grid-cols-2 text-xs md:text-sm">
                {answered.map(field => (
                  <DataItem
                    key={field.key}
                    label={field.label}
                    value={field.type === "multi" ? arr(field.key).join(", ") : str(field.key)}
                  />
                ))}
              </dl>
            ) : (
              <p className="text-xs md:text-sm text-muted-foreground italic">Nothing answered in this section yet.</p>
            )}
            {blank.length > 0 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs text-muted-foreground hover:text-foreground">
                  <span className="underline underline-offset-2">
                    {blank.length} {blank.length === 1 ? "question" : "questions"} not answered
                  </span>
                  <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
                </summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
                  {blank.map(field => (
                    <li key={field.key} className="break-words">{field.label}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}

      {/* Disclosures — #192: compressed to the heading plus the first sentence
          of each entry's own body, taken verbatim from SCOPING_DISCLOSURES.
          No new legal language is authored here; the full text lives at
          /scoping-disclosures. Same approach as src/pages/QuickScope.tsx. */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Disclosures</h3>
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <ul className="space-y-1.5">
            {DISCLOSURE_SUMMARY.map(d => (
              <li key={d.heading}>
                <span className="font-semibold text-foreground">{d.heading}. </span>
                {d.body}
              </li>
            ))}
          </ul>
          <a
            href="/scoping-disclosures"
            target="_blank"
            rel="noreferrer"
            className="inline-block pt-1 text-xs font-medium text-primary underline"
          >
            Read the full disclosures
          </a>
        </div>
      </div>

      {/* Acknowledgement */}
      <div className="space-y-3">
        <div className="grid gap-3 md:gap-4 md:grid-cols-2">
          <Field label="Printed name" required error={getError("acknowledgement_name")}>
            <Input
              value={str("acknowledgement_name")}
              onChange={e => onChange("acknowledgement_name", e.target.value)}
              onBlur={() => onBlur("acknowledgement_name")}
              hasError={!!getError("acknowledgement_name")}
            />
          </Field>
          <Field label="Title">
            <Input value={str("acknowledgement_title")} onChange={e => onChange("acknowledgement_title", e.target.value)} />
          </Field>
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs md:text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={form.disclosures_accepted === true}
            onChange={e => onChange("disclosures_accepted", e.target.checked)}
          />
          <span className="text-foreground">{SCOPING_ACK_TEXT}</span>
        </label>
      </div>

      {/* #193: instead of throwing the user back to step 0, a failed submit
          leaves them here and points at the steps that still have gaps. */}
      {incompleteSteps.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs md:text-sm">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Required answers are still missing on:
          </p>
          <ul className="mt-2 space-y-1">
            {incompleteSteps.map(index => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onGoToStep(index)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {stepLabels[index]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* #193: the button used to be hard-disabled until every required field
          was filled, which made the "what is still missing?" feedback below
          unreachable — the user got a dead button and no explanation. It is now
          always clickable while incomplete: onSubmit still refuses to send
          anything unless canSubmit is true, it just reveals the gaps instead. */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting}
        className={cn(
          "w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed",
          canSubmit ? "" : "opacity-60",
        )}
      >
        {isSubmitting ? "Submitting…" : "Submit scoping form"}
      </button>
      {!canSubmit && (
        <p className="text-xs text-muted-foreground text-center">
          Complete the required fields and tick the acknowledgement to submit.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper components (mirrors /merchant-apply conventions)
// ─────────────────────────────────────────────────────────────────────────────

// #188: a completed field used to invert to a solid emerald block, which read
// as an error state and blew out the page's colour balance. It now keeps the
// normal card surface and gains a 2px accent edge on the leading side, built
// from the design-system --primary token (no literal colours).
const FILLED_ACCENT = "bg-card text-foreground border-input border-l-2 border-l-primary";

function Field({ label, required, children, hint, error }: { label: string; required?: boolean; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="block space-y-1 md:space-y-1.5 text-xs md:text-sm">
      <span className="flex items-start gap-1 font-medium text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
      {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}

function Input({ hasError, ...props }: InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  const [focused, setFocused] = useState(false);
  const filled = !hasError && !focused && typeof props.value === "string" && props.value.trim().length > 0;
  return (
    <input
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      className={cn(
        "w-full rounded-lg border px-2.5 py-2 md:px-3 md:py-2.5 text-xs md:text-sm placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 transition-colors duration-200",
        hasError
          ? "bg-card text-foreground border-destructive focus:border-destructive focus:ring-destructive/20"
          : filled
            ? cn(FILLED_ACCENT, "focus:border-primary focus:ring-primary/20")
            : "bg-card text-foreground border-input focus:border-primary focus:ring-primary/20",
        props.className,
      )}
    />
  );
}

function NumberInput(props: InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return <Input type="number" step="any" min="0" {...props} />;
}

function SelectInput({ children, hasError, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; hasError?: boolean }) {
  const [focused, setFocused] = useState(false);
  const filled = !hasError && !focused && typeof props.value === "string" && props.value.trim().length > 0;
  return (
    <select
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      className={cn(
        "w-full rounded-lg border px-2.5 py-2 md:px-3 md:py-2.5 text-xs md:text-sm shadow-sm focus:outline-none focus:ring-2 transition-colors duration-200",
        hasError
          ? "bg-card text-foreground border-destructive focus:ring-destructive/20"
          : filled
            ? cn(FILLED_ACCENT, "focus:ring-primary/20")
            : "bg-card text-foreground border-input focus:ring-primary/20",
      )}
    >{children}</select>
  );
}

function Textarea({ hasError, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }) {
  const [focused, setFocused] = useState(false);
  const filled = !hasError && !focused && typeof props.value === "string" && props.value.trim().length > 0;
  return (
    <textarea
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      className={cn(
        "w-full rounded-lg border px-2.5 py-2 md:px-3 md:py-2.5 text-xs md:text-sm placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 min-h-[60px] transition-colors duration-200",
        hasError
          ? "bg-card text-foreground border-destructive focus:ring-destructive/20"
          : filled
            ? cn(FILLED_ACCENT, "focus:ring-primary/20")
            : "bg-card text-foreground border-input focus:ring-primary/20",
      )}
    />
  );
}

function SectionStatus({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{count}/{total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full transition-all", count === total ? "bg-primary" : "bg-primary/70")} style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-medium break-words">{value || <span className="text-muted-foreground font-normal italic">Not provided</span>}</dd>
    </div>
  );
}
