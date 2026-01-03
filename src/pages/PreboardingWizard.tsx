import { useEffect, useMemo, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { AppLayout } from "@/components/AppLayout";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  ShieldCheck,
  Upload,
  Users
} from "lucide-react";
import { OnboardingWizardState } from "@/types/opportunity";

const STEPS = [
  "Business Profile",
  "Legal Information",
  "Processing Information",
  "Documents",
  "Review"
] as const;

type SectionKey = "business" | "legal" | "processing" | "documents";

const REQUIRED_FIELDS: Record<SectionKey, string[]> = {
  business: [
    "dbaName",
    "products",
    "natureOfBusiness",
    "dbaContactFirst",
    "dbaContactLast",
    "dbaPhone",
    "dbaEmail",
    "dbaAddress",
    "dbaCity",
    "dbaState",
    "dbaZip"
  ],
  legal: [
    "legalEntityName",
    "legalPhone",
    "legalEmail",
    "tin",
    "ownershipType",
    "formationDate",
    "stateIncorporated",
    "legalAddress",
    "legalCity",
    "legalState",
    "legalZip"
  ],
  processing: [
    "monthlyVolume",
    "avgTicket",
    "highTicket",
    "swipedPct",
    "keyedPct",
    "motoPct",
    "ecomPct",
    "b2cPct",
    "b2bPct"
  ],
  documents: ["documents"]
};

interface PreboardingForm {
  // business
  dbaName: string;
  products: string;
  natureOfBusiness: string;
  dbaContactFirst: string;
  dbaContactLast: string;
  dbaPhone: string;
  dbaEmail: string;
  dbaAddress: string;
  dbaAddress2: string;
  dbaCity: string;
  dbaState: string;
  dbaZip: string;

  // legal
  legalEntityName: string;
  legalPhone: string;
  legalEmail: string;
  tin: string;
  ownershipType: string;
  formationDate: string;
  stateIncorporated: string;
  legalAddress: string;
  legalAddress2: string;
  legalCity: string;
  legalState: string;
  legalZip: string;

  // processing
  monthlyVolume: string;
  avgTicket: string;
  highTicket: string;
  swipedPct: string;
  keyedPct: string;
  motoPct: string;
  ecomPct: string;
  b2cPct: string;
  b2bPct: string;
  sicMcc: string;
  website: string;

  // docs
  documents: File[];
  notes: string;
}

const initialState: PreboardingForm = {
  dbaName: "",
  products: "",
  natureOfBusiness: "",
  dbaContactFirst: "",
  dbaContactLast: "",
  dbaPhone: "",
  dbaEmail: "",
  dbaAddress: "",
  dbaAddress2: "",
  dbaCity: "",
  dbaState: "",
  dbaZip: "",
  legalEntityName: "",
  legalPhone: "",
  legalEmail: "",
  tin: "",
  ownershipType: "",
  formationDate: "",
  stateIncorporated: "",
  legalAddress: "",
  legalAddress2: "",
  legalCity: "",
  legalState: "",
  legalZip: "",
  monthlyVolume: "",
  avgTicket: "",
  highTicket: "",
  swipedPct: "",
  keyedPct: "",
  motoPct: "",
  ecomPct: "",
  b2cPct: "",
  b2bPct: "",
  sicMcc: "",
  website: "",
  documents: [],
  notes: ""
};

interface OpportunityOption {
  id: string;
  accountName: string;
  stage?: string | null;
}

interface WizardStateRecord extends OnboardingWizardState {
  form_state: Partial<PreboardingForm>;
}

interface OpportunityWithRelations {
  account?: {
    name?: string;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    website?: string | null;
  } | null;
  contact?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    fax?: string | null;
  } | null;
}

const createFormFromOpportunity = (opportunity?: OpportunityWithRelations | null): PreboardingForm => {
  const account = opportunity?.account;
  const contact = opportunity?.contact;

  return {
    ...initialState,
    dbaName: account?.name || "",
    dbaContactFirst: contact?.first_name || "",
    dbaContactLast: contact?.last_name || "",
    dbaPhone: contact?.phone || "",
    dbaEmail: contact?.email || "",
    dbaAddress: account?.address1 || "",
    dbaAddress2: account?.address2 || "",
    dbaCity: account?.city || "",
    dbaState: account?.state || "",
    dbaZip: account?.zip || "",
    website: account?.website || "",
    legalEntityName: account?.name || "",
    legalPhone: contact?.phone || "",
    legalEmail: contact?.email || "",
    legalAddress: account?.address1 || "",
    legalAddress2: account?.address2 || "",
    legalCity: account?.city || "",
    legalState: account?.state || "",
    legalZip: account?.zip || "",
  };
};

const wizardStatusClasses = (value: number) => {
  if (value >= 100) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/40";
  if (value >= 10) return "bg-amber-500/10 text-amber-400 border border-amber-500/40";
  return "bg-destructive/10 text-destructive border border-destructive/40";
};

export default function PreboardingWizard() {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [form, setForm] = useState<PreboardingForm>(initialState);
  const [opportunityOptions, setOpportunityOptions] = useState<OpportunityOption[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    fetchOpportunities();
    const initialOpportunityId = searchParams.get("opportunityId");
    if (initialOpportunityId) {
      setSelectedOpportunityId(initialOpportunityId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedOpportunityId) {
      loadWizardState(selectedOpportunityId);
    } else {
      setForm(initialState);
      setStepIndex(0);
    }
  }, [selectedOpportunityId]);

  const fetchOpportunities = async () => {
    const { data, error } = await supabase
      .from('opportunities')
      .select(`id, stage, account:accounts(id, name)`)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Could not load accounts", description: error.message, variant: "destructive" });
      return;
    }

    const mapped = (data || []).map(item => ({
      id: item.id,
      accountName: item.account?.name ?? "Unknown account",
      stage: item.stage
    }));

    setOpportunityOptions(mapped);
  };

  const loadWizardState = async (opportunityId: string) => {
    setIsLoadingState(true);
    const { data: opportunity, error: opportunityError } = await supabase
      .from('opportunities')
      .select(`
        id,
        account:accounts(name, address1, address2, city, state, zip, country, website),
        contact:contacts(first_name, last_name, email, phone, fax)
      `)
      .eq('id', opportunityId)
      .single<OpportunityWithRelations>();

    if (opportunityError && opportunityError.code !== "PGRST116") {
      toast({ title: "Could not load account", description: opportunityError.message, variant: "destructive" });
    }

    const prefilledForm = createFormFromOpportunity(opportunity);
    const { data, error } = await supabase
      .from('onboarding_wizard_states')
      .select('id, opportunity_id, progress, step_index, form_state, created_at, updated_at')
      .eq('opportunity_id', opportunityId)
      .single<WizardStateRecord>();

    if (error && error.code !== "PGRST116") {
      toast({ title: "Could not load wizard state", description: error.message, variant: "destructive" });
      setIsLoadingState(false);
      return;
    }

    if (data) {
      const restoredForm: PreboardingForm = {
        ...prefilledForm,
        ...(data.form_state as Partial<PreboardingForm>),
        documents: []
      };
      setForm(restoredForm);
      setStepIndex(data.step_index ?? 0);
    } else {
      setForm(prefilledForm);
      setStepIndex(0);
    }

    setIsLoadingState(false);
  };

  const handleChange = <K extends keyof PreboardingForm>(field: K, value: PreboardingForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleDocsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setForm(prev => ({ ...prev, documents: files }));
  };

  const getMissingFieldsForSection = (sectionKey: SectionKey) => {
    const required = REQUIRED_FIELDS[sectionKey] ?? [];
    if (sectionKey === "documents") {
      return form.documents.length > 0 ? [] : ["At least one supporting document"];
    }
    return required.filter(field => !String(form[field as keyof PreboardingForm] ?? "").trim());
  };

  const missingBySection = useMemo(() => ({
    business: getMissingFieldsForSection("business"),
    legal: getMissingFieldsForSection("legal"),
    processing: getMissingFieldsForSection("processing"),
    documents: getMissingFieldsForSection("documents")
  }), [form]);

  const totalRequiredFields =
    REQUIRED_FIELDS.business.length +
    REQUIRED_FIELDS.legal.length +
    REQUIRED_FIELDS.processing.length +
    1;

  const completedRequiredFields =
    (REQUIRED_FIELDS.business.length - missingBySection.business.length) +
    (REQUIRED_FIELDS.legal.length - missingBySection.legal.length) +
    (REQUIRED_FIELDS.processing.length - missingBySection.processing.length) +
    (missingBySection.documents.length === 0 ? 1 : 0);

  const progress = Math.round((completedRequiredFields / totalRequiredFields) * 100);

  const saveWizardState = async () => {
    if (!selectedOpportunityId) {
      toast({
        title: "Select an account",
        description: "Attach the wizard to an account before saving progress.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    const { documents: _docs, ...restForm } = form;
    const serializableForm: Partial<PreboardingForm> = { ...restForm, documents: [] };

    const { error } = await supabase
      .from('onboarding_wizard_states')
      .upsert({
        opportunity_id: selectedOpportunityId,
        progress,
        step_index: stepIndex,
        form_state: serializableForm as unknown
      } as never, { onConflict: 'opportunity_id' });

    if (error) {
      toast({ title: "Could not save wizard", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Wizard saved", description: "Progress is now available on the account card." });
    }

    setIsSaving(false);
  };

  const handleSubmit = async () => {
    await saveWizardState();
    console.log("Preboarding payload", form);
    alert("Preboarding checklist complete! You can now move to the formal merchant app.");
  };

  const currentStep = STEPS[stepIndex];

  return (
    <AppLayout
      pageTitle="Preboarding Wizard"
      headerActions={
        <span className="text-xs text-muted-foreground">Step {stepIndex + 1} of {STEPS.length}</span>
      }
    >
      <div className="p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Use this preboarding checklist before the formal application.</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-48 rounded-full bg-merchant-gray overflow-hidden">
                      <div className="h-full bg-merchant-redLight transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-white">{progress}% complete</span>
                  </div>
                  {selectedOpportunityId && (
                    <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs", wizardStatusClasses(progress))}>
                      <span className="h-2 w-2 rounded-full bg-current" />
                      <span>Attached to dashboard account • {progress}%</span>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-merchant-gray bg-merchant-dark px-4 py-3 shadow-xl w-full md:w-[360px] space-y-2">
                  <div className="flex items-center justify-between text-sm text-white">
                    <span>Attach to dashboard account</span>
                    {isLoadingState && <span className="text-xs text-gray-400">Loading…</span>}
                  </div>
                  <select
                    value={selectedOpportunityId ?? ""}
                    onChange={event => setSelectedOpportunityId(event.target.value || null)}
                    className="w-full rounded-xl border border-merchant-gray bg-merchant-black px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-merchant-red"
                  >
                    <option value="">Select an account to sync</option>
                    {opportunityOptions.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.accountName} {option.stage ? `• ${option.stage.replace(/_/g, ' ')}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span>Saving links the wizard to the application card.</span>
                    <button
                      type="button"
                      className="ml-auto rounded-lg bg-merchant-red px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                      onClick={saveWizardState}
                      disabled={!selectedOpportunityId || isSaving}
                    >
                      {isSaving ? "Saving..." : "Save wizard state"}
                    </button>
                  </div>
                </div>
              </div>

              <ol className="flex flex-wrap gap-2 text-xs font-medium text-gray-400">
                {STEPS.map((label, index) => (
                  <li
                    key={label}
                    onClick={() => setStepIndex(index)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1 cursor-pointer transition-colors hover:bg-merchant-gray/30",
                      index === stepIndex
                        ? "border-merchant-redLight/70 bg-merchant-red/10 text-white"
                        : index < stepIndex
                          ? "border-merchant-gray bg-merchant-gray/20 text-white"
                          : "border-merchant-gray text-gray-400"
                    )}
                  >
                    <span className="h-5 w-5 rounded-full border border-merchant-gray text-center text-[11px] leading-5">
                      {index + 1}
                    </span>
                    <span>{label}</span>
                  </li>
                ))}
              </ol>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
                <section className="space-y-4 rounded-2xl border border-merchant-gray bg-merchant-dark p-5 shadow-xl">
                  {currentStep === "Business Profile" && (
                    <BusinessProfileStep form={form} onChange={handleChange} />
                  )}
                  {currentStep === "Legal Information" && (
                    <LegalInfoStep form={form} onChange={handleChange} />
                  )}
                  {currentStep === "Processing Information" && (
                    <ProcessingStep form={form} onChange={handleChange} />
                  )}
                  {currentStep === "Documents" && (
                    <DocumentsStep form={form} onChange={handleChange} onDocsChange={handleDocsChange} />
                  )}
                  {currentStep === "Review" && (
                    <ReviewStep form={form} missingBySection={missingBySection} />
                  )}

                  <div className="mt-6 flex items-center justify-between border-t border-merchant-gray/60 pt-4">
                    <button
                      type="button"
                      className="rounded-xl border border-merchant-gray px-4 py-2 text-sm font-medium text-gray-200 hover:bg-merchant-gray/40 disabled:opacity-40"
                      onClick={() => setStepIndex(prev => Math.max(0, prev - 1))}
                      disabled={stepIndex === 0}
                    >
                      ← Back
                    </button>

                    {stepIndex < STEPS.length - 1 ? (
                      <button
                        type="button"
                        className="rounded-xl bg-merchant-red px-4 py-2 text-sm font-semibold text-white shadow hover:bg-merchant-redLight"
                        onClick={() => setStepIndex(prev => Math.min(STEPS.length - 1, prev + 1))}
                      >
                        Next →
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-xl bg-merchant-red px-4 py-2 text-sm font-semibold text-white shadow hover:bg-merchant-redLight disabled:bg-merchant-gray disabled:text-gray-500"
                        onClick={handleSubmit}
                        disabled={progress < 100}
                      >
                        Mark Preboarding Complete
                      </button>
                    )}
                  </div>
                </section>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-merchant-gray bg-merchant-dark p-4 shadow-xl">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <ShieldCheck className="w-4 h-4 text-merchant-redLight" />
                      Status snapshot
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Move to the formal merchant application when this hits 100%.
                    </p>

                    <div className="mt-3 space-y-3 text-xs">
                      <SectionStatus
                        label="Business profile"
                        done={missingBySection.business.length === 0}
                        count={REQUIRED_FIELDS.business.length - missingBySection.business.length}
                        total={REQUIRED_FIELDS.business.length}
                      />
                      <SectionStatus
                        label="Legal info"
                        done={missingBySection.legal.length === 0}
                        count={REQUIRED_FIELDS.legal.length - missingBySection.legal.length}
                        total={REQUIRED_FIELDS.legal.length}
                      />
                      <SectionStatus
                        label="Processing"
                        done={missingBySection.processing.length === 0}
                        count={REQUIRED_FIELDS.processing.length - missingBySection.processing.length}
                        total={REQUIRED_FIELDS.processing.length}
                      />
                      <SectionStatus
                        label="Documents"
                        done={missingBySection.documents.length === 0}
                        count={missingBySection.documents.length === 0 ? 1 : 0}
                        total={1}
                      />
                    </div>

                    <OutstandingSummary progress={progress} missingBySection={missingBySection} />
                  </div>

                  <div className="rounded-2xl border border-merchant-gray bg-merchant-dark p-4 shadow-xl text-xs text-gray-300 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <FileText className="w-4 h-4 text-merchant-redLight" />
                      Quick tips
                    </div>
                    <ul className="list-disc space-y-1 pl-4">
                      <li>Use this to collect everything before touching the full app.</li>
                      <li>Docs can be bank statements, voided checks, IDs, or processing reports.</li>
                      <li>Share the payload with underwriting or export it into the formal boarding flow.</li>
                    </ul>
                  </div>
                </aside>
              </div>
            </div>
      </div>
    </AppLayout>
  );
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string; }) {
  return (
    <label className="space-y-1 text-sm text-gray-200">
      <span className="flex items-center gap-1 font-medium text-white">
        {label}
        {required && <span className="text-merchant-redLight">*</span>}
      </span>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </label>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-merchant-gray bg-merchant-black px-3 py-2 text-sm text-white shadow-sm focus:border-merchant-red focus:outline-none focus:ring-2 focus:ring-merchant-red/40",
        props.className
      )}
    />
  );
}

function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input type="number" step="any" min="0" {...props} />;
}

function SectionStatus({ label, done, count, total }: { label: string; done: boolean; count: number; total: number; }) {
  const pct = Math.round((count / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-200">{label}</span>
        <span className="text-[11px] text-gray-400">
          {count}/{total} · {pct}% {done ? "✓" : ""}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-merchant-gray/60">
        <div
          className={cn("h-full", done ? "bg-merchant-redLight" : "bg-merchant-red/70")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function OutstandingSummary({ progress, missingBySection }: { progress: number; missingBySection: Record<SectionKey, string[]>; }) {
  return (
    <div className="mt-4 rounded-2xl border border-merchant-gray bg-merchant-black p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-semibold text-white">
        <BadgeCheck className="w-4 h-4 text-merchant-redLight" />
        Outstanding items
      </div>
      {progress === 100 ? (
        <p className="text-emerald-400">All required items are captured. 🎉</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-gray-300">
          {Object.entries(missingBySection).map(([section, fields]) =>
            fields.length ? (
              <li key={section}>
                <span className="font-medium capitalize text-white">{section}:</span> {fields.join(", ")}
              </li>
            ) : null
          )}
        </ul>
      )}
    </div>
  );
}

function BusinessProfileStep({ form, onChange }: { form: PreboardingForm; onChange: <K extends keyof PreboardingForm>(field: K, value: PreboardingForm[K]) => void; }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Users className="w-4 h-4 text-merchant-redLight" />
        Business Profile
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="DBA name (doing business as)" required>
          <Input
            value={form.dbaName}
            onChange={e => onChange("dbaName", e.target.value)}
          />
        </Field>
        <Field label="Describe products / services" required>
          <Input
            value={form.products}
            onChange={e => onChange("products", e.target.value)}
          />
        </Field>
        <Field label="Nature of business" required>
          <Input
            value={form.natureOfBusiness}
            onChange={e => onChange("natureOfBusiness", e.target.value)}
            placeholder="e.g. Retail, eCommerce, Medical"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="DBA contact first name" required>
          <Input
            value={form.dbaContactFirst}
            onChange={e => onChange("dbaContactFirst", e.target.value)}
          />
        </Field>
        <Field label="DBA contact last name" required>
          <Input
            value={form.dbaContactLast}
            onChange={e => onChange("dbaContactLast", e.target.value)}
          />
        </Field>
        <Field label="DBA contact phone" required>
          <Input
            value={form.dbaPhone}
            onChange={e => onChange("dbaPhone", e.target.value)}
            placeholder="+1 (555) 555-5555"
          />
        </Field>
        <Field label="DBA contact email" required>
          <Input
            type="email"
            value={form.dbaEmail}
            onChange={e => onChange("dbaEmail", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="DBA address" required>
          <Input
            value={form.dbaAddress}
            onChange={e => onChange("dbaAddress", e.target.value)}
          />
        </Field>
        <Field label="Address line 2">
          <Input
            value={form.dbaAddress2}
            onChange={e => onChange("dbaAddress2", e.target.value)}
          />
        </Field>
        <Field label="City" required>
          <Input
            value={form.dbaCity}
            onChange={e => onChange("dbaCity", e.target.value)}
          />
        </Field>
        <Field label="State / Province" required>
          <Input
            value={form.dbaState}
            onChange={e => onChange("dbaState", e.target.value)}
          />
        </Field>
        <Field label="ZIP / Postal" required>
          <Input
            value={form.dbaZip}
            onChange={e => onChange("dbaZip", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

function LegalInfoStep({ form, onChange }: { form: PreboardingForm; onChange: <K extends keyof PreboardingForm>(field: K, value: PreboardingForm[K]) => void; }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <ShieldCheck className="w-4 h-4 text-merchant-redLight" />
        Legal Information
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Legal entity name" required>
          <Input
            value={form.legalEntityName}
            onChange={e => onChange("legalEntityName", e.target.value)}
          />
        </Field>
        <Field label="Business phone" required>
          <Input
            value={form.legalPhone}
            onChange={e => onChange("legalPhone", e.target.value)}
          />
        </Field>
        <Field label="Business email" required>
          <Input
            type="email"
            value={form.legalEmail}
            onChange={e => onChange("legalEmail", e.target.value)}
          />
        </Field>
        <Field label="Federal tax ID (TIN)" required>
          <Input
            value={form.tin}
            onChange={e => onChange("tin", e.target.value)}
          />
        </Field>
        <Field label="Business / ownership type" required>
          <Input
            value={form.ownershipType}
            onChange={e => onChange("ownershipType", e.target.value)}
            placeholder="e.g. LLC, Sole Prop, Corp"
          />
        </Field>
        <Field label="Business formation date" required>
          <Input
            type="date"
            value={form.formationDate}
            onChange={e => onChange("formationDate", e.target.value)}
          />
        </Field>
        <Field label="State incorporated" required>
          <Input
            value={form.stateIncorporated}
            onChange={e => onChange("stateIncorporated", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Legal address" required>
          <Input
            value={form.legalAddress}
            onChange={e => onChange("legalAddress", e.target.value)}
          />
        </Field>
        <Field label="Address line 2">
          <Input
            value={form.legalAddress2}
            onChange={e => onChange("legalAddress2", e.target.value)}
          />
        </Field>
        <Field label="City" required>
          <Input
            value={form.legalCity}
            onChange={e => onChange("legalCity", e.target.value)}
          />
        </Field>
        <Field label="State / Province" required>
          <Input
            value={form.legalState}
            onChange={e => onChange("legalState", e.target.value)}
          />
        </Field>
        <Field label="ZIP / Postal" required>
          <Input
            value={form.legalZip}
            onChange={e => onChange("legalZip", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

function ProcessingStep({ form, onChange }: { form: PreboardingForm; onChange: <K extends keyof PreboardingForm>(field: K, value: PreboardingForm[K]) => void; }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <CheckCircle2 className="w-4 h-4 text-merchant-redLight" />
        Processing Information
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Monthly volume ($)" required>
          <NumberInput
            value={form.monthlyVolume}
            onChange={e => onChange("monthlyVolume", e.target.value)}
          />
        </Field>
        <Field label="Average ticket ($)" required>
          <NumberInput
            value={form.avgTicket}
            onChange={e => onChange("avgTicket", e.target.value)}
          />
        </Field>
        <Field label="High ticket ($)" required>
          <NumberInput
            value={form.highTicket}
            onChange={e => onChange("highTicket", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Swiped %" required>
          <NumberInput
            value={form.swipedPct}
            onChange={e => onChange("swipedPct", e.target.value)}
          />
        </Field>
        <Field label="Keyed %" required>
          <NumberInput
            value={form.keyedPct}
            onChange={e => onChange("keyedPct", e.target.value)}
          />
        </Field>
        <Field label="MOTO %" required>
          <NumberInput
            value={form.motoPct}
            onChange={e => onChange("motoPct", e.target.value)}
          />
        </Field>
        <Field label="eCommerce %" required>
          <NumberInput
            value={form.ecomPct}
            onChange={e => onChange("ecomPct", e.target.value)}
          />
        </Field>
        <Field label="B2C sales %" required>
          <NumberInput
            value={form.b2cPct}
            onChange={e => onChange("b2cPct", e.target.value)}
          />
        </Field>
        <Field label="B2B sales %" required>
          <NumberInput
            value={form.b2bPct}
            onChange={e => onChange("b2bPct", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Website">
          <Input
            value={form.website}
            onChange={e => onChange("website", e.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field label="SIC / MCC lookup">
          <Input
            value={form.sicMcc}
            onChange={e => onChange("sicMcc", e.target.value)}
            placeholder="Capture MCC if known"
          />
        </Field>
      </div>
    </div>
  );
}

function DocumentsStep({ form, onChange, onDocsChange }: { form: PreboardingForm; onChange: <K extends keyof PreboardingForm>(field: K, value: PreboardingForm[K]) => void; onDocsChange: (event: ChangeEvent<HTMLInputElement>) => void; }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Upload className="w-4 h-4 text-merchant-redLight" />
        Supporting Documents
      </div>
      <p className="text-xs text-gray-400">
        Upload anything underwriting is likely to ask for: recent bank or processing statements, voided check / bank letter, government ID, etc.
      </p>

      <Field label="Upload documents" required>
        <input
          type="file"
          multiple
          onChange={onDocsChange}
          className="w-full cursor-pointer rounded-lg border border-dashed border-merchant-gray bg-merchant-black px-3 py-8 text-center text-xs text-gray-400"
        />
      </Field>

      {form.documents.length > 0 && (
        <div className="rounded-xl border border-merchant-gray bg-merchant-black p-3 text-xs">
          <div className="mb-1 font-medium text-white">Files selected</div>
          <ul className="list-disc space-y-1 pl-4 text-gray-300">
            {form.documents.map((f, idx) => (
              <li key={`${f.name}-${idx}`} className="truncate">
                {f.name} ({Math.round(f.size / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Internal notes">
        <textarea
          className="min-h-[90px] w-full rounded-lg border border-merchant-gray bg-merchant-black px-3 py-2 text-sm text-white shadow-sm focus:border-merchant-red focus:outline-none focus:ring-2 focus:ring-merchant-red/40"
          value={form.notes}
          onChange={e => onChange("notes", e.target.value)}
          placeholder="Anything unusual about the deal? High ticket rationale, pricing nuances, risk notes, etc."
        />
      </Field>
    </div>
  );
}

function ReviewStep({ form, missingBySection }: { form: PreboardingForm; missingBySection: Record<SectionKey, string[]>; }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <BadgeCheck className="w-4 h-4 text-merchant-redLight" />
        Review & Export
      </div>
      <p className="text-xs text-gray-400">
        Quick snapshot of what you captured. If anything looks off, jump back before moving to the formal portal.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard title="Business Profile">
          <SummaryItem label="DBA name" value={form.dbaName} />
          <SummaryItem label="Products / services" value={form.products} />
          <SummaryItem label="Nature of business" value={form.natureOfBusiness} />
          <SummaryItem label="Contact" value={`${form.dbaContactFirst} ${form.dbaContactLast}`.trim()} />
          <SummaryItem label="Phone" value={form.dbaPhone} />
          <SummaryItem label="Email" value={form.dbaEmail} />
        </SummaryCard>

        <SummaryCard title="Legal Info">
          <SummaryItem label="Legal entity" value={form.legalEntityName} />
          <SummaryItem label="TIN" value={form.tin} />
          <SummaryItem label="Ownership type" value={form.ownershipType} />
          <SummaryItem label="Formation date" value={form.formationDate} />
          <SummaryItem label="State incorporated" value={form.stateIncorporated} />
        </SummaryCard>

        <SummaryCard title="Processing">
          <SummaryItem label="Monthly volume" value={form.monthlyVolume} />
          <SummaryItem label="Avg ticket" value={form.avgTicket} />
          <SummaryItem label="High ticket" value={form.highTicket} />
          <SummaryItem label="Swiped / Keyed" value={`${form.swipedPct}% / ${form.keyedPct}%`} />
          <SummaryItem label="MOTO" value={`${form.motoPct}%`} />
          <SummaryItem label="eCom" value={`${form.ecomPct}%`} />
          <SummaryItem label="B2C / B2B" value={`${form.b2cPct}% / ${form.b2bPct}%`} />
        </SummaryCard>

        <SummaryCard title="Documents & Notes">
          <SummaryItem
            label="Documents"
            value={form.documents.length ? `${form.documents.length} file(s) selected` : "None"}
          />
          <SummaryItem label="Internal notes" value={form.notes || "—"} />
        </SummaryCard>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        <div className="font-semibold">Reminder</div>
        <p>
          This wizard is for preboarding only. Once it shows 100% complete and all sections look clean, move into the formal merchant application.
        </p>
      </div>

      {Object.values(missingBySection).some(fields => fields.length > 0) && (
        <div className="text-xs text-amber-300">
          Missing fields remain. Complete each section before exporting.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode; }) {
  return (
    <div className="space-y-2 rounded-xl border border-merchant-gray bg-merchant-black p-3 text-xs">
      <div className="font-semibold text-white">{title}</div>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string; }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="flex-1 text-right text-white">{value || "—"}</dd>
    </div>
  );
}
