import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, User, MapPin, Globe, CreditCard, Send, Loader2, CheckCircle, AlertCircle, ArrowLeft, FileText, Upload, X, FileCheck, LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC"
];

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
];

interface FormData {
  merchant_type: string;
  company: string;
  dba_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  url: string;
  timezone: string;
  language: string;
  username: string;
  bank_name: string;
  routing_number: string;
  account_number: string;
  account_type: string;
}

const initialFormData: FormData = {
  merchant_type: "gateway",
  company: "",
  dba_name: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  url: "",
  timezone: "America/New_York",
  language: "en_US",
  username: "",
  bank_name: "",
  routing_number: "",
  account_number: "",
  account_type: "checking",
};

type Step = "details" | "address" | "settings" | "banking" | "tearsheet" | "review";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "details", label: "Business Info", icon: <Building2 className="h-4 w-4" /> },
  { key: "address", label: "Address", icon: <MapPin className="h-4 w-4" /> },
  { key: "settings", label: "Gateway Settings", icon: <Globe className="h-4 w-4" /> },
  { key: "banking", label: "Banking", icon: <CreditCard className="h-4 w-4" /> },
  { key: "tearsheet", label: "VAR/Tear Sheet", icon: <FileText className="h-4 w-4" /> },
  { key: "review", label: "Review & Submit", icon: <Send className="h-4 w-4" /> },
];

interface OpportunityOption {
  id: string;
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
  username: string | null;
  timezone: string | null;
  language: string | null;
}

const NMIBoarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; gateway_id?: string; error?: string } | null>(null);
  const [tearsheetFiles, setTearsheetFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
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
          id, username, timezone, language,
          accounts:account_id (name, address1, address2, city, state, zip, country, website),
          contacts:contact_id (first_name, last_name, email, phone)
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const mapped: OpportunityOption[] = data.map((opp: any) => ({
          id: opp.id,
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
          username: opp.username,
          timezone: opp.timezone,
          language: opp.language,
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
      company: opp.accountName || prev.company,
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
      url: opp.accountWebsite || prev.url,
      username: opp.username || prev.username,
      timezone: opp.timezone || prev.timezone,
      language: opp.language || prev.language,
    }));
    toast.success("Opportunity data synced to form");
  };

  const handleTearsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setTearsheetFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeTearsheetFile = (index: number) => {
    setTearsheetFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const update = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canNext = () => {
    switch (step) {
      case "details":
        return !!(form.company && form.first_name && form.last_name && form.email && form.phone);
      case "address":
        return !!(form.address1 && form.city && form.state && form.zip);
      case "settings":
        return !!(form.username && form.timezone);
      case "banking":
        return true; // banking is optional
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
      const { data, error } = await supabase.functions.invoke("nmi-board-merchant", {
        body: form,
      });

      if (error) throw error;

      if (data?.success) {
        setResult({ success: true, gateway_id: data.gateway_id });
        toast.success(`Merchant boarded successfully! Gateway ID: ${data.gateway_id}`);
      } else {
        setResult({ success: false, error: data?.error || "Unknown error from NMI" });
        toast.error(`Boarding failed: ${data?.error}`);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to submit boarding request";
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
        value={form[field]}
        onChange={(e) => update(field, e.target.value)}
        placeholder={opts?.placeholder}
        className="h-9"
      />
    </div>
  );

  return (
    <AppLayout pageTitle="NMI Merchant Boarding">
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

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
            result.success ? "border-green-500/40 bg-green-50/50 dark:bg-green-950/20" : "border-destructive/40 bg-destructive/5"
          )}>
            <CardContent className="p-4 flex items-start gap-3">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium text-sm text-foreground">
                  {result.success ? "Merchant Boarded Successfully" : "Boarding Failed"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.success
                    ? `Gateway ID: ${result.gateway_id}`
                    : result.error}
                </p>
                {result.success && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setForm(initialFormData);
                      setResult(null);
                      setTearsheetFiles([]);
                      setSelectedOpportunityId("");
                      setStep("details");
                    }}
                  >
                    Board Another Merchant
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form steps */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              {STEPS[stepIndex].icon}
              {STEPS[stepIndex].label}
            </CardTitle>
            <CardDescription className="text-xs">
              {step === "details" && "Enter the merchant's business and contact information."}
              {step === "address" && "Enter the merchant's business address."}
              {step === "settings" && "Configure gateway username, timezone, and website."}
              {step === "banking" && "Banking information for merchant billing (optional)."}
              {step === "tearsheet" && "Upload a VAR/Tear Sheet document (optional)."}
              {step === "review" && "Review all details before submitting to NMI."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "details" && (
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
                  <p className="text-[10px] text-muted-foreground">Selecting an opportunity will auto-populate known fields.</p>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("Company Name", "company", { required: true, placeholder: "Acme Corp" })}
                  {renderField("DBA Name", "dba_name", { placeholder: "Doing Business As" })}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Merchant Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.merchant_type} onValueChange={(v) => update("merchant_type", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gateway">Gateway</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                      <SelectItem value="splitFunding">Split Funding</SelectItem>
                      <SelectItem value="mobile">Mobile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground">Primary Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("First Name", "first_name", { required: true })}
                  {renderField("Last Name", "last_name", { required: true })}
                  {renderField("Email", "email", { type: "email", required: true })}
                  {renderField("Phone", "phone", { type: "tel", required: true, placeholder: "+1 555-123-4567" })}
                </div>
              </>
            )}

            {step === "address" && (
              <div className="space-y-4">
                {renderField("Address Line 1", "address1", { required: true })}
                {renderField("Address Line 2", "address2")}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {renderField("City", "city", { required: true })}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      State <span className="text-destructive">*</span>
                    </Label>
                    <Select value={form.state} onValueChange={(v) => update("state", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {renderField("ZIP", "zip", { required: true, placeholder: "10001" })}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Country</Label>
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="CA">Canada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === "settings" && (
              <div className="space-y-4">
                {renderField("Gateway Username", "username", { required: true, placeholder: "merchant_username" })}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Timezone <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.timezone} onValueChange={(v) => update("timezone", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {US_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {renderField("Website URL", "url", { placeholder: "https://example.com" })}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Language</Label>
                  <Select value={form.language} onValueChange={(v) => update("language", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === "banking" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Banking information is used for merchant billing. Leave blank if not applicable.
                </p>
                {renderField("Bank Name", "bank_name", { placeholder: "Chase, Wells Fargo, etc." })}
                {renderField("Routing Number", "routing_number", { placeholder: "9 digits" })}
                {renderField("Account Number", "account_number", { placeholder: "Account number" })}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Account Type</Label>
                  <Select value={form.account_type} onValueChange={(v) => update("account_type", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === "tearsheet" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Upload a VAR/Tear Sheet if available. This step is optional — you can skip to review.
                </p>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="tearsheet-upload"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    multiple
                    onChange={handleTearsheetUpload}
                  />
                  <label htmlFor="tearsheet-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Click to upload VAR/Tear Sheet</span>
                    <span className="text-xs text-muted-foreground">PDF, JPG, PNG, DOC — max 10MB each</span>
                  </label>
                </div>
                {tearsheetFiles.length > 0 && (
                  <div className="space-y-2">
                    {tearsheetFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCheck className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm text-foreground truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        <button onClick={() => removeTearsheetFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <ReviewField label="Company" value={form.company} />
                  <ReviewField label="DBA" value={form.dba_name} />
                  <ReviewField label="Type" value={form.merchant_type} />
                  <ReviewField label="Contact" value={`${form.first_name} ${form.last_name}`} />
                  <ReviewField label="Email" value={form.email} />
                  <ReviewField label="Phone" value={form.phone} />
                  <ReviewField label="Address" value={`${form.address1}${form.address2 ? `, ${form.address2}` : ''}`} />
                  <ReviewField label="City/State/ZIP" value={`${form.city}, ${form.state} ${form.zip}`} />
                  <ReviewField label="Country" value={form.country} />
                  <ReviewField label="Username" value={form.username} />
                  <ReviewField label="Timezone" value={form.timezone} />
                  <ReviewField label="Website" value={form.url} />
                  {form.bank_name && <ReviewField label="Bank" value={form.bank_name} />}
                  {form.routing_number && <ReviewField label="Routing" value={`···${form.routing_number.slice(-4)}`} />}
                  {form.account_number && <ReviewField label="Account" value={`···${form.account_number.slice(-4)}`} />}
                  <ReviewField label="VAR/Tear Sheet" value={tearsheetFiles.length > 0 ? `${tearsheetFiles.length} file(s) attached` : "None"} />
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={stepIndex === 0}
              >
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
                    <><Send className="h-3.5 w-3.5" /> Submit to NMI</>
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={goNext}
                  disabled={!canNext()}
                >
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
              <AlertDialogTitle>Submit to NMI Gateway?</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to submit <span className="font-semibold text-foreground">{form.company}</span> to the NMI gateway for boarding. This action will create a live merchant record. Are you sure you want to proceed?
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

export default NMIBoarding;
