import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, User, FileText, Send, Loader2, CheckCircle, AlertCircle, LinkIcon, Upload, Trash2, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC"
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
  // Banking (NMI-required accountInfo)
  check_aba: string;
  check_account: string;
  account_holder_type: string;
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
  check_aba: "",
  check_account: "",
  account_holder_type: "business",
  account_type: "checking",
};

type Step = "details" | "documents" | "review";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "details", label: "Merchant Details", icon: <User className="h-4 w-4" /> },
  { key: "documents", label: "Documents", icon: <FileText className="h-4 w-4" /> },
  { key: "review", label: "Review & Submit", icon: <Send className="h-4 w-4" /> },
];

interface UploadedDoc {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

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
  const [showConfirm, setShowConfirm] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("");
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [varSheet, setVarSheet] = useState<UploadedDoc | null>(null);
  const [bankLetter, setBankLetter] = useState<UploadedDoc | null>(null);

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

  const update = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const canNext = () => {
    switch (step) {
      case "details":
        return !!(form.company && form.first_name && form.last_name && form.email && form.phone && form.address1 && form.city && form.state && form.zip && form.username);
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

  const handleFileSelect = useCallback((setter: (doc: UploadedDoc | null) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File too large (max 10 MB)");
        return;
      }
      setter({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      });
    };
    input.click();
  }, []);

  const uploadDocument = async (doc: UploadedDoc, label: string, oppId?: string) => {
    const path = `nmi-boarding/${Date.now()}-${doc.name}`;
    const { error } = await supabase.storage
      .from("opportunity-documents")
      .upload(path, doc.file, { contentType: doc.type });

    if (error) {
      console.error(`Failed to upload ${label}:`, error);
      toast.error(`Failed to upload ${label}`);
      return false;
    }

    // If linked to an opportunity, create a document record
    if (oppId) {
      await supabase.from("documents").insert({
        opportunity_id: oppId,
        file_name: doc.name,
        file_path: path,
        file_size: doc.size,
        content_type: doc.type,
        document_type: label,
        uploaded_by: user?.id,
      });
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      // Upload documents first
      const oppId = selectedOpportunityId && selectedOpportunityId !== "none" ? selectedOpportunityId : undefined;

      if (varSheet) {
        const ok = await uploadDocument(varSheet, "VAR Sheet", oppId);
        if (!ok) { setSubmitting(false); return; }
      }
      if (bankLetter) {
        const ok = await uploadDocument(bankLetter, "Bank Letter", oppId);
        if (!ok) { setSubmitting(false); return; }
      }

      const { data, error } = await supabase.functions.invoke("nmi-board-merchant", {
        body: {
          ...form,
          opportunity_id: oppId,
        },
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
        value={form[field] as string}
        onChange={(e) => update(field, e.target.value)}
        placeholder={opts?.placeholder}
        className="h-9"
      />
    </div>
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const DocUploadSlot = ({
    label,
    description,
    doc,
    onSelect,
    onRemove,
  }: {
    label: string;
    description: string;
    doc: UploadedDoc | null;
    onSelect: () => void;
    onRemove: () => void;
  }) => (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {doc ? (
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
          <FileUp className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(doc.size)}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onSelect}
          className="gap-1.5 w-full justify-center border-dashed"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload File
        </Button>
      )}
    </div>
  );

  return (
    <AppLayout pageTitle="NMI Merchant Boarding">
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
            result.success ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-destructive/40 bg-destructive/5"
          )}>
            <CardContent className="p-4 flex items-start gap-3">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium text-sm text-foreground">
                  {result.success ? "Merchant Boarded Successfully" : "Boarding Failed"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.success ? `Gateway ID: ${result.gateway_id}` : result.error}
                </p>
                {result.success && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setForm(initialFormData);
                      setResult(null);
                      setSelectedOpportunityId("");
                      setVarSheet(null);
                      setBankLetter(null);
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

        {/* Form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              {STEPS[stepIndex].icon}
              {STEPS[stepIndex].label}
            </CardTitle>
            <CardDescription className="text-xs">
              {step === "details" && "Enter the merchant's business details, contact information, and address."}
              {step === "documents" && "Upload supporting documents — VAR sheet and bank letter."}
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

                {/* Business Info */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Business Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("Company / Legal Name", "company", { required: true, placeholder: "Acme Corp" })}
                  {renderField("Doing Business As (DBA)", "dba_name", { placeholder: "Optional DBA name" })}
                </div>
                {renderField("Website", "url", { placeholder: "https://example.com" })}

                <Separator />

                {/* Contact */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Primary Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderField("First Name", "first_name", { required: true })}
                  {renderField("Last Name", "last_name", { required: true })}
                  {renderField("Email", "email", { type: "email", required: true })}
                  {renderField("Telephone", "phone", { type: "tel", required: true, placeholder: "+1 555-123-4567" })}
                </div>

                <Separator />

                {/* Address */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Business Address</p>
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

                <Separator />

                {/* Gateway Username */}
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Gateway Access</p>
                {renderField("Gateway Username", "username", { required: true, placeholder: "merchant_username" })}
              </>
            )}

            {step === "documents" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Upload the VAR sheet and bank verification letter. Accepted formats: PDF, JPG, PNG, DOC. Max 10 MB per file.
                </p>
                <DocUploadSlot
                  label="VAR Sheet"
                  description="Value Added Reseller agreement sheet"
                  doc={varSheet}
                  onSelect={() => handleFileSelect(setVarSheet)}
                  onRemove={() => setVarSheet(null)}
                />
                <DocUploadSlot
                  label="Bank Letter / Voided Cheque"
                  description="Bank verification letter or voided cheque for merchant billing"
                  doc={bankLetter}
                  onSelect={() => handleFileSelect(setBankLetter)}
                  onRemove={() => setBankLetter(null)}
                />
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {selectedOpportunityId && selectedOpportunityId !== "none" && (
                    <ReviewField label="Linked Opportunity" value={opportunities.find(o => o.id === selectedOpportunityId)?.accountName || "Yes"} />
                  )}
                  <ReviewField label="Company" value={form.company} />
                  <ReviewField label="DBA" value={form.dba_name} />
                  <ReviewField label="Contact" value={`${form.first_name} ${form.last_name}`} />
                  <ReviewField label="Email" value={form.email} />
                  <ReviewField label="Telephone" value={form.phone} />
                  <ReviewField label="Address" value={`${form.address1}${form.address2 ? `, ${form.address2}` : ''}`} />
                  <ReviewField label="City/State/ZIP" value={`${form.city}, ${form.state} ${form.zip}`} />
                  <ReviewField label="Country" value={form.country} />
                  <ReviewField label="Website" value={form.url} />
                  <ReviewField label="Username" value={form.username} />
                </div>

                <Separator />
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Documents</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <ReviewField label="VAR Sheet" value={varSheet?.name || "Not uploaded"} />
                  <ReviewField label="Bank Letter" value={bankLetter?.name || "Not uploaded"} />
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
