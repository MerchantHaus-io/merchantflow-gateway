import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, User, MapPin, Globe, CreditCard, Send, Loader2, CheckCircle, AlertCircle, ArrowLeft, FileText, Upload, X, FileCheck, LinkIcon, Settings2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MCC_CODES, MCC_CATEGORIES, PROCESSING_PLATFORMS } from "@/lib/mcc-codes";

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
  // Processing config
  processing_platform: string;
  processor_name: string;
  // Processor-specific info (World Pay, First Data, etc.)
  proc_merchant_number: string;
  proc_terminal_number: string;
  proc_check_digit: string;
  proc_device_id: string;
  mcc_code: string;
  classification: string;
  payment_visa: boolean;
  payment_mc: boolean;
  payment_amex: boolean;
  payment_discover: boolean;
  payment_diners: boolean;
  payment_jcb: boolean;
  max_monthly_volume: string;
  max_ticket_amount: string;
  limit_all_types: boolean;
  avs_cvv_method: string;
  duplicate_checking: boolean;
  duplicate_merchant_override: boolean;
  duplicate_time_limit: string;
  // Required fields config
  req_cvv: string;
  // Merchant's Required Fields
  req_name: boolean;
  req_company: boolean;
  req_address: boolean;
  req_city: boolean;
  req_state: boolean;
  req_zip: boolean;
  req_country: boolean;
  req_phone: boolean;
  req_email: boolean;
  req_drivers_license: boolean;
  req_dl_state: boolean;
  req_dl_dob: boolean;
  req_ssn: boolean;
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
  // Processing config defaults
  processing_platform: "",
  processor_name: "",
  proc_merchant_number: "",
  proc_terminal_number: "",
  proc_check_digit: "",
  proc_device_id: "",
  mcc_code: "",
  classification: "ecommerce",
  payment_visa: true,
  payment_mc: true,
  payment_amex: true,
  payment_discover: true,
  payment_diners: false,
  payment_jcb: false,
  max_monthly_volume: "0.00",
  max_ticket_amount: "0.00",
  limit_all_types: true,
  avs_cvv_method: "void",
  duplicate_checking: true,
  duplicate_merchant_override: true,
  duplicate_time_limit: "1200",
  req_cvv: "not_required",
  // Merchant's Required Fields defaults
  req_name: false,
  req_company: false,
  req_address: false,
  req_city: false,
  req_state: false,
  req_zip: false,
  req_country: false,
  req_phone: false,
  req_email: false,
  req_drivers_license: false,
  req_dl_state: false,
  req_dl_dob: false,
  req_ssn: false,
};

type Step = "details" | "address" | "settings" | "processing" | "banking" | "review";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "details", label: "Business Info", icon: <Building2 className="h-4 w-4" /> },
  { key: "address", label: "Address", icon: <MapPin className="h-4 w-4" /> },
  { key: "settings", label: "Gateway Settings", icon: <Globe className="h-4 w-4" /> },
  { key: "processing", label: "Processing", icon: <Settings2 className="h-4 w-4" /> },
  { key: "banking", label: "Banking", icon: <CreditCard className="h-4 w-4" /> },
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("");
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [mccSearch, setMccSearch] = useState("");
  const [mccCategory, setMccCategory] = useState("All Categories");

  const filteredMCCs = useMemo(() => {
    let codes = MCC_CODES;
    if (mccCategory !== "All Categories") {
      codes = codes.filter((c) => c.category === mccCategory);
    }
    if (mccSearch) {
      const q = mccSearch.toLowerCase();
      codes = codes.filter(
        (c) => c.code.includes(q) || c.description.toLowerCase().includes(q)
      );
    }
    return codes.slice(0, 50); // limit display for performance
  }, [mccSearch, mccCategory]);

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


  const update = (field: keyof FormData, value: string | boolean) =>
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
        return true;
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
        value={form[field] as string}
        onChange={(e) => update(field, e.target.value)}
        placeholder={opts?.placeholder}
        className="h-9"
      />
    </div>
  );

  const selectedMcc = MCC_CODES.find((m) => m.code === form.mcc_code);

  const paymentTypes = [
    { key: "payment_visa" as const, label: "Visa" },
    { key: "payment_mc" as const, label: "Mastercard" },
    { key: "payment_amex" as const, label: "American Express" },
    { key: "payment_discover" as const, label: "Discover" },
    { key: "payment_diners" as const, label: "Diner's Club" },
    { key: "payment_jcb" as const, label: "JCB" },
  ];

  return (
    <AppLayout pageTitle="NMI Merchant Boarding">
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
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
              {step === "processing" && "Configure processing platform, MCC, payment types, and account rules."}
              {step === "banking" && "Banking information for merchant billing (optional)."}
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
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es_ES">Spanish (Spain)</SelectItem>
                      <SelectItem value="es_CR">Spanish (Costa Rica)</SelectItem>
                      <SelectItem value="es_PA">Spanish (Panama)</SelectItem>
                      <SelectItem value="fr_CA">French (Canada)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ===== PROCESSING CONFIG STEP ===== */}
            {step === "processing" && (
              <div className="space-y-5">
                {/* Processing Platform */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Processing Platform</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Select a Processor</Label>
                      <Select value={form.processing_platform} onValueChange={(v) => update("processing_platform", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select a Processor" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROCESSING_PLATFORMS.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {renderField("Processor Name", "processor_name", { placeholder: "Displayed as processor in merchant panel" })}
                  </div>
                </div>

                {/* Processor-Specific Information (shown when a processor is selected) */}
                {form.processing_platform && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                        {form.processing_platform} Processor Information
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                          {renderField("Merchant Number", "proc_merchant_number", { placeholder: "15 Digits" })}
                        </div>
                        <div>
                          {renderField("Terminal Number", "proc_terminal_number", { placeholder: "6 Digits" })}
                        </div>
                        <div>
                          {renderField("Check-Digit", "proc_check_digit", { placeholder: "1 Digit" })}
                        </div>
                        <div>
                          {renderField("Device Identification", "proc_device_id", { placeholder: "2 Digits" })}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* MCC Code */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Merchant Category Code (MCC)</p>
                  {selectedMcc && (
                    <div className="mb-3 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-mono">{selectedMcc.code}</Badge>
                      <span className="text-sm text-foreground">{selectedMcc.description}</span>
                      <button onClick={() => update("mcc_code", "")} className="text-muted-foreground hover:text-destructive ml-auto">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={mccSearch}
                        onChange={(e) => setMccSearch(e.target.value)}
                        placeholder="Search MCC code or description…"
                        className="h-9 pl-8 text-xs"
                      />
                    </div>
                    <Select value={mccCategory} onValueChange={setMccCategory}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MCC_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                    {filteredMCCs.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">No matching MCC codes found</p>
                    ) : (
                      filteredMCCs.map((mcc) => (
                        <button
                          key={mcc.code}
                          onClick={() => { update("mcc_code", mcc.code); setMccSearch(""); }}
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0",
                            form.mcc_code === mcc.code && "bg-primary/10 text-primary"
                          )}
                        >
                          <span className="font-mono text-muted-foreground shrink-0 w-10">{mcc.code}</span>
                          <span className="text-foreground truncate">{mcc.description}</span>
                          <Badge variant="outline" className="ml-auto text-[10px] shrink-0 hidden sm:inline-flex">{mcc.category}</Badge>
                        </button>
                      ))
                    )}
                  </div>
                  {filteredMCCs.length === 50 && (
                    <p className="text-[10px] text-muted-foreground mt-1">Showing first 50 results. Refine your search to see more.</p>
                  )}
                </div>

                <Separator />

                {/* Account Classification */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Account Classification</p>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Selecting "Retail" or "Restaurant" will prevent AVS or CVV rejection rules.
                  </p>
                  <Select value={form.classification} onValueChange={(v) => update("classification", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ecommerce">E-Commerce</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                      <SelectItem value="moto">MOTO (Mail Order / Telephone Order)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Payment Types */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Payment Types Allowed</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {paymentTypes.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={form[key] as boolean}
                          onCheckedChange={(v) => update(key, !!v)}
                        />
                        <span className="text-sm text-foreground group-hover:text-primary transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Account Limitations */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Account Limitations</p>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Hard limits on gateway volume. "0.00" means unlimited.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderField("Max Monthly Volume ($)", "max_monthly_volume", { placeholder: "0.00" })}
                    {renderField("Max Ticket Amount ($)", "max_ticket_amount", { placeholder: "0.00" })}
                  </div>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <Checkbox
                      checked={form.limit_all_types}
                      onCheckedChange={(v) => update("limit_all_types", !!v)}
                    />
                    <span className="text-xs text-muted-foreground">Include all payment types within these limits</span>
                  </label>
                </div>

                <Separator />

                {/* AVS/CVV Pre-Check Method */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">AVS/CVV Pre-Check Method</p>
                  <Select value={form.avs_cvv_method} onValueChange={(v) => update("avs_cvv_method", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="void">Void on Decline</SelectItem>
                      <SelectItem value="preauth">Separate Pre-auth Transaction</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {form.avs_cvv_method === "void"
                      ? "Transaction is attempted; if AVS/CVV rules block it, the gateway sends a void to release held funds."
                      : "An account validation is performed first. If it passes, the full transaction proceeds."}
                  </p>
                </div>

                <Separator />

                {/* Duplicate Velocity Controls */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Duplicate Velocity Controls</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">Enable Duplicate Checking</p>
                        <p className="text-[10px] text-muted-foreground">Prevents duplicate transactions (same card, same amount)</p>
                      </div>
                      <Switch
                        checked={form.duplicate_checking}
                        onCheckedChange={(v) => update("duplicate_checking", v)}
                      />
                    </div>
                    {form.duplicate_checking && (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-foreground">Allow Merchant Override</p>
                            <p className="text-[10px] text-muted-foreground">Adds override checkbox to Virtual Terminal</p>
                          </div>
                          <Switch
                            checked={form.duplicate_merchant_override}
                            onCheckedChange={(v) => update("duplicate_merchant_override", v)}
                          />
                        </div>
                        {renderField("Duplicate Time Limit (seconds)", "duplicate_time_limit", { placeholder: "1200" })}
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                {/* CVV Requirement */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Card Security Code (CVV)</p>
                  <Select value={form.req_cvv} onValueChange={(v) => update("req_cvv", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_required">Not Required</SelectItem>
                      <SelectItem value="always">Always Required</SelectItem>
                      <SelectItem value="first_txn">Required on First Transaction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Merchant's Required Fields */}
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Merchant's Required Fields</p>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Select which fields should be required when the merchant processes transactions.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {([
                      { key: "req_name" as const, label: "Name" },
                      { key: "req_company" as const, label: "Company" },
                      { key: "req_address" as const, label: "Address" },
                      { key: "req_city" as const, label: "City" },
                      { key: "req_state" as const, label: "State" },
                      { key: "req_zip" as const, label: "Zip Code" },
                      { key: "req_country" as const, label: "Country" },
                      { key: "req_phone" as const, label: "Phone Number" },
                      { key: "req_email" as const, label: "Email Address" },
                      { key: "req_drivers_license" as const, label: "Driver's License" },
                      { key: "req_dl_state" as const, label: "Driver's License State" },
                      { key: "req_dl_dob" as const, label: "Driver's License DOB" },
                      { key: "req_ssn" as const, label: "Social Security Number" },
                    ]).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={form[key] as boolean}
                          onCheckedChange={(v) => update(key, !!v)}
                        />
                        <span className="text-sm text-foreground group-hover:text-primary transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
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

            {step === "review" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {selectedOpportunityId && selectedOpportunityId !== "none" && (
                    <ReviewField label="Linked Opportunity" value={opportunities.find(o => o.id === selectedOpportunityId)?.accountName || "Yes"} />
                  )}
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
                  <ReviewField label="Language" value={form.language} />
                  <ReviewField label="Website" value={form.url} />
                  {form.bank_name && <ReviewField label="Bank" value={form.bank_name} />}
                  {form.routing_number && <ReviewField label="Routing" value={`···${form.routing_number.slice(-4)}`} />}
                  {form.account_number && <ReviewField label="Account" value={`···${form.account_number.slice(-4)}`} />}
                </div>

                {/* Processing Config Review */}
                <Separator />
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Processing Configuration</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <ReviewField label="Platform" value={form.processing_platform} />
                  <ReviewField label="Processor Name" value={form.processor_name} />
                  <ReviewField label="MCC Code" value={selectedMcc ? `${selectedMcc.code} — ${selectedMcc.description}` : form.mcc_code} />
                  <ReviewField label="Classification" value={form.classification.toUpperCase()} />
                  <ReviewField
                    label="Payment Types"
                    value={paymentTypes.filter(({ key }) => form[key]).map(({ label }) => label).join(", ") || "None"}
                  />
                  <ReviewField label="Max Monthly Volume" value={form.max_monthly_volume === "0.00" ? "Unlimited" : `$${form.max_monthly_volume}`} />
                  <ReviewField label="Max Ticket" value={form.max_ticket_amount === "0.00" ? "Unlimited" : `$${form.max_ticket_amount}`} />
                  <ReviewField label="AVS/CVV Method" value={form.avs_cvv_method === "void" ? "Void on Decline" : "Separate Pre-auth"} />
                  <ReviewField label="Duplicate Checking" value={form.duplicate_checking ? `Enabled (${form.duplicate_time_limit}s)` : "Disabled"} />
                  <ReviewField label="CVV Requirement" value={form.req_cvv === "always" ? "Always Required" : form.req_cvv === "first_txn" ? "Required on First Txn" : "Not Required"} />
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
