import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, User, Send, Loader2, CheckCircle, AlertCircle, LinkIcon, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const BUSINESS_TYPES = [
  "Sole Proprietorship", "LLC", "Corporation", "S-Corporation",
  "Partnership", "Non-Profit", "Government",
];

interface FormData {
  // Business
  legal_name: string;
  dba_name: string;
  business_type: string;
  mcc: string;
  business_start_date: string;
  ein: string;
  website_url: string;
  // Principal / owner
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  phone: string;
  owner_dob: string;
  ssn: string;
  ownership_percent: string;
  // Address
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  // Processing profile
  average_ticket: string;
  high_ticket: string;
  monthly_volume: string;
  // Banking
  bank_name: string;
  routing_number: string;
  account_number: string;
  account_type: string;
}

const initialFormData: FormData = {
  legal_name: "",
  dba_name: "",
  business_type: "",
  mcc: "",
  business_start_date: "",
  ein: "",
  website_url: "",
  first_name: "",
  last_name: "",
  title: "",
  email: "",
  phone: "",
  owner_dob: "",
  ssn: "",
  ownership_percent: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  average_ticket: "",
  high_ticket: "",
  monthly_volume: "",
  bank_name: "",
  routing_number: "",
  account_number: "",
  account_type: "checking",
};

type Step = "business" | "processing" | "review";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "business", label: "Business & Owner", icon: <Building2 className="h-4 w-4" /> },
  { key: "processing", label: "Processing & Banking", icon: <User className="h-4 w-4" /> },
  { key: "review", label: "Review & Submit", icon: <Send className="h-4 w-4" /> },
];

interface OpportunityOption {
  id: string;
  accountId: string | null;
  accountName: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  accountAddress1: string | null;
  accountAddress2: string | null;
  accountCity: string | null;
  accountState: string | null;
  accountZip: string | null;
  accountCountry: string | null;
  accountWebsite: string | null;
}

const KurvApplication = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("business");
  const [form, setForm] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; pending?: boolean; application_id?: string; error?: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("");
  const [loadingOpps, setLoadingOpps] = useState(true);

  useEffect(() => {
    const fetchOpportunities = async () => {
      setLoadingOpps(true);
      const { data, error } = await supabase
        .from("opportunities")
        .select(`
          id, account_id,
          accounts:account_id (name, address1, address2, city, state, zip, country, website),
          contacts:contact_id (first_name, last_name, email, phone)
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const mapped: OpportunityOption[] = data.map((opp: any) => ({
          id: opp.id,
          accountId: opp.account_id,
          accountName: opp.accounts?.name || "",
          contactFirstName: opp.contacts?.first_name,
          contactLastName: opp.contacts?.last_name,
          contactEmail: opp.contacts?.email,
          contactPhone: opp.contacts?.phone,
          accountAddress1: opp.accounts?.address1,
          accountAddress2: opp.accounts?.address2,
          accountCity: opp.accounts?.city,
          accountState: opp.accounts?.state,
          accountZip: opp.accounts?.zip,
          accountCountry: opp.accounts?.country,
          accountWebsite: opp.accounts?.website,
        }));
        setOpportunities(mapped);
      }
      setLoadingOpps(false);
    };
    fetchOpportunities();
  }, []);

  const handleSelectOpportunity = (oppId: string) => {
    setSelectedOpportunityId(oppId);
    if (oppId === "none") return;
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp) return;
    setForm((prev) => ({
      ...prev,
      legal_name: opp.accountName || prev.legal_name,
      first_name: opp.contactFirstName || prev.first_name,
      last_name: opp.contactLastName || prev.last_name,
      email: opp.contactEmail || prev.email,
      phone: opp.contactPhone || prev.phone,
      address1: opp.accountAddress1 || prev.address1,
      address2: opp.accountAddress2 || prev.address2,
      city: opp.accountCity || prev.city,
      state: opp.accountState || prev.state,
      zip: opp.accountZip || prev.zip,
      country: opp.accountCountry || prev.country,
      website_url: opp.accountWebsite || prev.website_url,
    }));
    toast.success("Opportunity data synced to application");
  };

  const update = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const canNext = () => {
    switch (step) {
      case "business":
        return !!(form.legal_name && form.first_name && form.last_name && form.email && form.phone && form.address1 && form.city && form.state && form.zip);
      default:
        return true;
    }
  };

  const goNext = () => {
    const idx = stepIndex + 1;
    if (idx < STEPS.length) setStep(STEPS[idx].key);
  };
  const goPrev = () => {
    const idx = stepIndex - 1;
    if (idx >= 0) setStep(STEPS[idx].key);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const oppId = selectedOpportunityId && selectedOpportunityId !== "none" ? selectedOpportunityId : undefined;
      const accountId = oppId ? opportunities.find((o) => o.id === oppId)?.accountId || undefined : undefined;

      const { data, error } = await supabase.functions.invoke("kurv-submit-application", {
        body: { ...form, opportunity_id: oppId, account_id: accountId },
      });

      if (error) throw error;

      if (data?.success) {
        setResult({ success: true, application_id: data.application_id });
        toast.success(`Application submitted to Kurv${data.application_id ? ` — ID: ${data.application_id}` : ""}`);
      } else if (data?.pending_credentials) {
        setResult({ success: false, pending: true, error: data.error });
        toast.info("Saved as draft — Kurv API access not configured yet");
      } else {
        setResult({ success: false, error: data?.error || "Unknown error from Kurv" });
        toast.error(`Submission failed: ${data?.error}`);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to submit application";
      setResult({ success: false, error: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (label: string, field: keyof FormData, opts?: { type?: string; placeholder?: string; required?: boolean }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {opts?.required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        type={opts?.type || "text"}
        value={form[field] as string}
        onChange={(e) => update(field, e.target.value)}
        placeholder={opts?.placeholder}
        className="h-9"
      />
    </div>
  );

  const resetForm = () => {
    setForm(initialFormData);
    setResult(null);
    setSelectedOpportunityId("");
    setStep("business");
  };

  return (
    <AppLayout pageTitle="Kurv Application Submission">
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                step === s.key
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          ))}
        </div>

        {/* Result banner */}
        {result && (
          <Card className={cn(
            "border",
            result.success
              ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
              : result.pending
              ? "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-destructive/40 bg-destructive/5"
          )}>
            <CardContent className="p-4 flex items-start gap-3">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : result.pending ? (
                <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium text-sm text-foreground">
                  {result.success ? "Application Submitted" : result.pending ? "Saved as Draft" : "Submission Failed"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.success ? (result.application_id ? `Application ID: ${result.application_id}` : "Submitted to Kurv underwriting.") : result.error}
                </p>
                {result.success && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={resetForm}>
                    Submit Another Application
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              {STEPS[stepIndex].icon}
              {STEPS[stepIndex].label}
            </CardTitle>
            <CardDescription className="text-xs">
              {step === "business" && "Business legal details and the principal owner's information."}
              {step === "processing" && "Expected processing volume and settlement bank account."}
              {step === "review" && "Review everything before submitting to Kurv underwriting."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "business" && (
              <>
                {/* Opportunity Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" /> Link to Opportunity
                  </Label>
                  <Select value={selectedOpportunityId} onValueChange={handleSelectOpportunity}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={loadingOpps ? "Loading opportunities…" : "Select an opportunity to auto-fill"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No opportunity —</SelectItem>
                      {opportunities.map((opp) => (
                        <SelectItem key={opp.id} value={opp.id}>
                          {opp.accountName}{opp.contactFirstName ? ` — ${opp.contactFirstName} ${opp.contactLastName || ""}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Selecting an opportunity will auto-populate known fields from your CRM.</p>
                </div>

                <Separator />

                {/* Business Info */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Business Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("Legal Business Name", "legal_name", { required: true, placeholder: "Acme Corp LLC" })}
                  {renderField("Doing Business As (DBA)", "dba_name", { placeholder: "Acme" })}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Business Type</Label>
                    <Select value={form.business_type} onValueChange={(v) => update("business_type", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {BUSINESS_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  {renderField("MCC (optional)", "mcc", { placeholder: "e.g. 5812" })}
                  {renderField("EIN / Tax ID", "ein", { placeholder: "12-3456789" })}
                  {renderField("Business Start Date", "business_start_date", { type: "date" })}
                </div>
                {renderField("Website", "website_url", { placeholder: "https://example.com" })}

                <Separator />

                {/* Principal / owner */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Principal Owner</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("First Name", "first_name", { required: true })}
                  {renderField("Last Name", "last_name", { required: true })}
                  {renderField("Title", "title", { placeholder: "Owner / CEO" })}
                  {renderField("Ownership %", "ownership_percent", { type: "number", placeholder: "100" })}
                  {renderField("Email", "email", { type: "email", required: true })}
                  {renderField("Telephone", "phone", { type: "tel", required: true, placeholder: "+1 555-123-4567" })}
                  {renderField("Date of Birth", "owner_dob", { type: "date" })}
                  {renderField("SSN", "ssn", { placeholder: "###-##-####" })}
                </div>

                <Separator />

                {/* Address */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Business Address</p>
                {renderField("Address Line 1", "address1", { required: true })}
                {renderField("Address Line 2", "address2")}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {renderField("City", "city", { required: true })}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">State <span className="text-destructive">*</span></Label>
                    <Select value={form.state} onValueChange={(v) => update("state", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  {renderField("ZIP", "zip", { required: true, placeholder: "10001" })}
                </div>
              </>
            )}

            {step === "processing" && (
              <>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Processing Profile</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {renderField("Average Ticket ($)", "average_ticket", { type: "number", placeholder: "75" })}
                  {renderField("High Ticket ($)", "high_ticket", { type: "number", placeholder: "500" })}
                  {renderField("Monthly Volume ($)", "monthly_volume", { type: "number", placeholder: "25000" })}
                </div>

                <Separator />

                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Settlement Bank Account</p>
                <p className="text-[10px] text-muted-foreground">Account &amp; routing numbers are forwarded to Kurv securely — only the last 4 digits are stored in the CRM.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("Bank Name", "bank_name")}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Account Type</Label>
                    <Select value={form.account_type} onValueChange={(v) => update("account_type", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {renderField("Routing / ABA Number", "routing_number", { placeholder: "9 digits" })}
                  {renderField("Account Number", "account_number", { placeholder: "Account number" })}
                </div>
              </>
            )}

            {step === "review" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {selectedOpportunityId && selectedOpportunityId !== "none" && (
                    <ReviewField label="Linked Opportunity" value={opportunities.find(o => o.id === selectedOpportunityId)?.accountName || "Yes"} />
                  )}
                  <ReviewField label="Legal Name" value={form.legal_name} />
                  <ReviewField label="DBA" value={form.dba_name} />
                  <ReviewField label="Business Type" value={form.business_type} />
                  <ReviewField label="MCC" value={form.mcc} />
                  <ReviewField label="EIN" value={form.ein ? `···${form.ein.replace(/\D/g, "").slice(-4)}` : ""} />
                  <ReviewField label="Start Date" value={form.business_start_date} />
                  <ReviewField label="Website" value={form.website_url} />
                  <ReviewField label="Owner" value={`${form.first_name} ${form.last_name}`} />
                  <ReviewField label="Title" value={form.title} />
                  <ReviewField label="Ownership %" value={form.ownership_percent} />
                  <ReviewField label="Email" value={form.email} />
                  <ReviewField label="Telephone" value={form.phone} />
                  <ReviewField label="DOB" value={form.owner_dob} />
                  <ReviewField label="SSN" value={form.ssn ? `···${form.ssn.replace(/\D/g, "").slice(-4)}` : ""} />
                  <ReviewField label="Address" value={`${form.address1}${form.address2 ? `, ${form.address2}` : ""}`} />
                  <ReviewField label="City/State/ZIP" value={`${form.city}, ${form.state} ${form.zip}`} />
                  <ReviewField label="Avg Ticket" value={form.average_ticket ? `$${form.average_ticket}` : ""} />
                  <ReviewField label="High Ticket" value={form.high_ticket ? `$${form.high_ticket}` : ""} />
                  <ReviewField label="Monthly Volume" value={form.monthly_volume ? `$${form.monthly_volume}` : ""} />
                  <ReviewField label="Bank" value={form.bank_name} />
                  <ReviewField label="Routing" value={form.routing_number ? `···${form.routing_number.slice(-4)}` : ""} />
                  <ReviewField label="Account" value={form.account_number ? `···${form.account_number.slice(-4)}` : ""} />
                  <ReviewField label="Account Type" value={form.account_type} />
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle className="text-sm">Heads up</AlertTitle>
                  <AlertDescription className="text-xs">
                    Submitting sends this application to Kurv (EMS) underwriting via API. Until your Kurv API token is configured, the application is saved as a draft and can be re-submitted later.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={goPrev} disabled={stepIndex === 0}>
                Previous
              </Button>
              {step === "review" ? (
                <Button
                  size="sm"
                  onClick={() => setShowConfirm(true)}
                  disabled={submitting || result?.success === true}
                  className="gap-1.5"
                >
                  {submitting ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting...</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" /> Submit to Kurv</>
                  )}
                </Button>
              ) : (
                <Button size="sm" onClick={goNext} disabled={!canNext()}>
                  Next
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit application to Kurv?</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to submit <span className="font-semibold text-foreground">{form.legal_name}</span> to Kurv (EMS) underwriting. Please confirm the details are correct before proceeding.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowConfirm(false); handleSubmit(); }}>
                Yes, Submit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

const ReviewField = ({ label, value }: { label: string; value: string }) => {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
};

export default KurvApplication;
