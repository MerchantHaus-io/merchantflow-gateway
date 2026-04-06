import { useMemo, useState, useCallback, lazy, Suspense, type InputHTMLAttributes, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Scale,
  CreditCard,
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  Info,
  Zap,
  FileText,
  Users,
  Landmark,
  Plus,
  Trash2,
} from "lucide-react";
import merchanthausLogo from "@/assets/merchanthaus-logo.png";
import cardVisa from "@/assets/card-visa.png";
import cardMastercard from "@/assets/card-mastercard.png";
import cardAmex from "@/assets/card-amex.png";
import cardDiscover from "@/assets/card-discover.png";

// ─────────────────────────────────────────────────────────────────────────────
// Types using canonical keys
// ─────────────────────────────────────────────────────────────────────────────

type ServiceType = "gateway_only" | "gateway_and_processing" | "document_submission" | null;
type PricingPlan = "flat_rate" | "interchange_plus" | "";

interface PrincipalForm {
  principal_first_name: string;
  principal_last_name: string;
  principal_title: string;
  ownership_percent: string;
  principal_phone: string;
  principal_email: string;
  principal_address_line1: string;
  principal_address_line2: string;
  principal_city: string;
  principal_state: string;
  principal_zip: string;
  principal_country: string;
  date_of_birth: string;
  ssn_full: string;
}

const emptyPrincipal: PrincipalForm = {
  principal_first_name: "",
  principal_last_name: "",
  principal_title: "",
  ownership_percent: "",
  principal_phone: "",
  principal_email: "",
  principal_address_line1: "",
  principal_address_line2: "",
  principal_city: "",
  principal_state: "",
  principal_zip: "",
  principal_country: "US",
  date_of_birth: "",
  ssn_full: "",
};

interface MerchantForm {
  // Business Profile
  dba_name: string;
  product_description: string;
  nature_of_business: string;
  dba_contact_first_name: string;
  dba_contact_last_name: string;
  dba_contact_phone: string;
  dba_contact_email: string;
  dba_address_line1: string;
  dba_address_line2: string;
  dba_city: string;
  dba_state: string;
  dba_zip: string;
  dba_country: string;

  // Legal Information
  legal_entity_name: string;
  federal_tax_id: string;
  ownership_type: string;
  business_formation_date: string;
  state_incorporated: string;
  tax_exempt: boolean;
  legal_address_line1: string;
  legal_address_line2: string;
  legal_city: string;
  legal_state: string;
  legal_zip: string;
  legal_country: string;

  // Processing Profile
  monthly_volume: string;
  average_transaction: string;
  high_ticket: string;
  percent_swiped: string;
  percent_keyed: string;
  percent_moto: string;
  percent_ecommerce: string;
  percent_b2b: string;
  percent_b2c: string;
  website_url: string;
  sic_mcc_code: string;

  // Principals
  principals: PrincipalForm[];

  // Banking
  bank_name: string;
  account_holder_name: string;
  routing_number: string;
  account_number: string;

  // Supporting Documents
  statement_docs: File[];
  void_check_docs: File[];
  general_docs: File[];
  gateway_var_docs: File[];
  gateway_void_docs: File[];

  // Agreements
  beneficial_owner_certification: boolean;
  bank_disclosure_ack: boolean;
  merchant_agreement_accepted: boolean;
  account_authorization_accepted: boolean;

  // Notes
  additional_notes: string;

  // Gateway-only
  username: string;
  current_processor: string;
  pricing_plan: PricingPlan;
}

const initialState: MerchantForm = {
  dba_name: "", product_description: "", nature_of_business: "",
  dba_contact_first_name: "", dba_contact_last_name: "",
  dba_contact_phone: "", dba_contact_email: "",
  dba_address_line1: "", dba_address_line2: "",
  dba_city: "", dba_state: "", dba_zip: "", dba_country: "US",

  legal_entity_name: "", federal_tax_id: "", ownership_type: "",
  business_formation_date: "", state_incorporated: "", tax_exempt: false,
  legal_address_line1: "", legal_address_line2: "",
  legal_city: "", legal_state: "", legal_zip: "", legal_country: "US",

  monthly_volume: "", average_transaction: "", high_ticket: "",
  percent_swiped: "", percent_keyed: "", percent_moto: "", percent_ecommerce: "",
  percent_b2b: "", percent_b2c: "", website_url: "", sic_mcc_code: "",

  principals: [{ ...emptyPrincipal }],

  bank_name: "", account_holder_name: "", routing_number: "", account_number: "",

  statement_docs: [], void_check_docs: [], general_docs: [],
  gateway_var_docs: [], gateway_void_docs: [],

  beneficial_owner_certification: false, bank_disclosure_ack: false,
  merchant_agreement_accepted: false, account_authorization_accepted: false,

  additional_notes: "",
  username: "", current_processor: "",
  pricing_plan: "interchange_plus",
};

// ─── Steps config ───

const PROCESSING_STEPS = [
  { label: "Pricing", icon: CreditCard },
  { label: "Business Profile", icon: Building2 },
  { label: "Legal Information", icon: Scale },
  { label: "Processing Info", icon: CreditCard },
  { label: "Owners & Banking", icon: Users },
  { label: "Review & Submit", icon: CheckCircle2 },
] as const;

const GATEWAY_STEPS = [
  { label: "Business Details", icon: Building2 },
  { label: "Documents & Submit", icon: FileText },
] as const;

const DOCS_STEPS = [
  { label: "Contact & Documents", icon: FileText },
] as const;

// ─── Required fields per section ───

const PROCESSING_REQUIRED: Record<string, string[]> = {
  business: [
    "dba_name", "product_description", "nature_of_business",
    "dba_contact_first_name", "dba_contact_last_name",
    "dba_contact_phone", "dba_contact_email",
    "dba_address_line1", "dba_city", "dba_state", "dba_zip",
  ],
  legal: [
    "legal_entity_name", "federal_tax_id", "ownership_type",
    "business_formation_date", "state_incorporated",
    "legal_address_line1", "legal_city", "legal_state", "legal_zip",
  ],
  processing: [
    "monthly_volume", "average_transaction", "high_ticket",
    "percent_swiped", "percent_keyed", "percent_moto", "percent_ecommerce",
  ],
  owners_banking: [
    "principal_first_name_0", "principal_last_name_0", "principal_title_0",
    "ownership_percent_0", "date_of_birth_0",
    "bank_name", "account_holder_name", "routing_number", "account_number",
  ],
};

const GATEWAY_REQUIRED: Record<string, string[]> = {
  gateway_business: [
    "dba_name", "dba_contact_first_name", "dba_contact_last_name",
    "dba_contact_phone", "dba_contact_email",
    "dba_address_line1", "dba_city", "dba_state", "dba_zip",
    "username", "current_processor",
  ],
};

const DOCS_REQUIRED: Record<string, string[]> = {
  docs_contact: [
    "dba_contact_first_name", "dba_contact_last_name", "dba_contact_email",
  ],
};

const FIELD_LABELS: Record<string, string> = {
  dba_name: "DBA Name", product_description: "Products/Services",
  nature_of_business: "Nature of Business",
  dba_contact_first_name: "First Name", dba_contact_last_name: "Last Name",
  dba_contact_phone: "Phone", dba_contact_email: "Email",
  dba_address_line1: "Address", dba_city: "City", dba_state: "State", dba_zip: "ZIP",
  legal_entity_name: "Legal Entity Name", federal_tax_id: "Federal Tax ID",
  ownership_type: "Ownership Type", business_formation_date: "Formation Date",
  state_incorporated: "State Incorporated",
  legal_address_line1: "Legal Address", legal_city: "Legal City",
  legal_state: "Legal State", legal_zip: "Legal ZIP",
  monthly_volume: "Monthly Volume", average_transaction: "Avg Transaction",
  high_ticket: "High Ticket", percent_swiped: "Swiped %",
  percent_keyed: "Keyed %", percent_moto: "MOTO %", percent_ecommerce: "eCommerce %",
  percent_b2b: "B2B %", percent_b2c: "B2C %",
  bank_name: "Bank Name", account_holder_name: "Account Holder",
  routing_number: "Routing Number", account_number: "Account Number",
  username: "Username", current_processor: "Current Processor",
};

type TouchedFields = Record<string, boolean>;

// ─── Validation ───

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email";
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone.trim()) return "Phone is required";
  if (phone.replace(/\D/g, "").length < 10) return "Invalid phone number";
  return null;
}

function validateRequired(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MerchantApply() {
  const [serviceType, setServiceType] = useState<ServiceType>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<MerchantForm>(initialState);
  const [touched, setTouched] = useState<TouchedFields>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const isGatewayOnly = serviceType === "gateway_only";
  const isDocSubmission = serviceType === "document_submission";
  const isCanadian = form.dba_country === "CA";
  const steps = isDocSubmission ? DOCS_STEPS : isGatewayOnly ? GATEWAY_STEPS : PROCESSING_STEPS;

  const allRequiredFields = useMemo(() => {
    if (isDocSubmission) return DOCS_REQUIRED.docs_contact;
    if (isGatewayOnly) return GATEWAY_REQUIRED.gateway_business;
    return [
      ...PROCESSING_REQUIRED.business,
      ...PROCESSING_REQUIRED.legal,
      ...PROCESSING_REQUIRED.processing,
      // Dynamic principal fields — SSN not required for Canadian applicants
      ...form.principals.flatMap((_, i) => [
        `principal_first_name_${i}`, `principal_last_name_${i}`,
        `principal_title_${i}`, `ownership_percent_${i}`,
        `date_of_birth_${i}`,
        ...(isCanadian ? [] : [`ssn_full_${i}`]),
      ]),
      "bank_name", "account_holder_name", "routing_number", "account_number",
    ];
  }, [isGatewayOnly, isDocSubmission, form.principals.length, isCanadian]);

  const getFieldValue = (key: string): string => {
    // Handle principal indexed fields like "principal_first_name_0"
    const principalMatch = key.match(/^(.+)_(\d+)$/);
    if (principalMatch) {
      const fieldName = principalMatch[1] as keyof PrincipalForm;
      const idx = parseInt(principalMatch[2]);
      if (form.principals[idx] && fieldName in form.principals[idx]) {
        return String(form.principals[idx][fieldName] ?? "");
      }
    }
    const val = form[key as keyof MerchantForm];
    if (typeof val === "string") return val;
    if (typeof val === "boolean") return val ? "true" : "";
    return "";
  };

  const handleChange = <K extends keyof MerchantForm>(field: K, value: MerchantForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handlePrincipalChange = (index: number, field: keyof PrincipalForm, value: string) => {
    setForm(prev => {
      const updated = [...prev.principals];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, principals: updated };
    });
  };

  const addPrincipal = () => {
    if (form.principals.length < 5) {
      setForm(prev => ({ ...prev, principals: [...prev.principals, { ...emptyPrincipal }] }));
    }
  };

  const removePrincipal = (index: number) => {
    if (form.principals.length > 1) {
      setForm(prev => ({ ...prev, principals: prev.principals.filter((_, i) => i !== index) }));
    }
  };

  const getError = (field: string): string | null => {
    if (!touched[field] && !showAllErrors) return null;
    const value = getFieldValue(field);
    const label = FIELD_LABELS[field] || field.replace(/_\d+$/, "").replace(/_/g, " ");
    if (field.includes("email")) return validateEmail(value);
    if (field.includes("phone")) return validatePhone(value);
    if (allRequiredFields.includes(field)) return validateRequired(value, label);
    return null;
  };

  const getMissing = (fields: string[]) =>
    fields.filter(f => !getFieldValue(f).trim());

  const missingBySection = useMemo(() => {
    if (isDocSubmission) {
      return { docs_contact: getMissing(DOCS_REQUIRED.docs_contact) };
    }
    if (isGatewayOnly) {
      return { gateway_business: getMissing(GATEWAY_REQUIRED.gateway_business) };
    }
    const ownersBankingFields = [
      ...form.principals.flatMap((_, i) => [
        `principal_first_name_${i}`, `principal_last_name_${i}`,
        `principal_title_${i}`, `ownership_percent_${i}`,
        `date_of_birth_${i}`,
        ...(isCanadian ? [] : [`ssn_full_${i}`]),
      ]),
      "bank_name", "account_holder_name", "routing_number", "account_number",
    ];
    return {
      business: getMissing(PROCESSING_REQUIRED.business),
      legal: getMissing(PROCESSING_REQUIRED.legal),
      processing: getMissing(PROCESSING_REQUIRED.processing),
      owners_banking: getMissing(ownersBankingFields),
    };
  }, [form, isGatewayOnly, isDocSubmission]);

  const totalRequired = allRequiredFields.length;
  const completedRequired = totalRequired - getMissing(allRequiredFields).length;
  const progress = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  const handleNextStep = () => {
    setStepIndex(prev => Math.min(steps.length - 1, prev + 1));
  };

  const handleSubmit = async () => {
    setShowAllErrors(true);
    const missing = getMissing(allRequiredFields);
    if (missing.length > 0) {
      toast({ variant: "destructive", title: "Please complete all required fields", description: `${missing.length} field(s) need attention.` });
      return;
    }

    // Validate agreement acceptance for processing applications
    if (!isGatewayOnly && !isDocSubmission) {
      if (!form.merchant_agreement_accepted || !form.account_authorization_accepted) {
        toast({ variant: "destructive", title: "Agreement Required", description: "You must accept the Merchant Agreement and authorize account creation before submitting." });
        return;
      }
    }

    // Validate percentage rules for processing
    if (!isGatewayOnly && !isDocSubmission) {
      const txMix = [form.percent_swiped, form.percent_keyed, form.percent_moto, form.percent_ecommerce]
        .map(v => parseFloat(v) || 0)
        .reduce((a, b) => a + b, 0);
      if (Math.abs(txMix - 100) > 0.01) {
        toast({ variant: "destructive", title: "Transaction mix must equal 100%", description: `Currently totals ${txMix}%` });
        return;
      }

      if (form.percent_b2b && form.percent_b2c) {
        const salesMix = (parseFloat(form.percent_b2b) || 0) + (parseFloat(form.percent_b2c) || 0);
        if (Math.abs(salesMix - 100) > 0.01) {
          toast({ variant: "destructive", title: "B2B + B2C must equal 100%", description: `Currently totals ${salesMix}%` });
          return;
        }
      }

      const ownershipTotal = form.principals.reduce((sum, p) => sum + (parseFloat(p.ownership_percent) || 0), 0);
      if (Math.abs(ownershipTotal - 100) > 0.01) {
        toast({ variant: "destructive", title: "Ownership % must total 100%", description: `Currently totals ${ownershipTotal}%` });
        return;
      }
    }

    // Validate document submission has at least 1 file
    if (isDocSubmission && form.general_docs.length === 0) {
      toast({ variant: "destructive", title: "Documents Required", description: "Please upload at least one document before submitting." });
      return;
    }

    setIsSubmitting(true);

    try {
      // Fetch client IP for audit trail
      let clientIp = 'unknown';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
        const ipData = ipRes ? await ipRes.json().catch(() => ({})) : {};
        clientIp = ipData.ip || 'unknown';
      } catch { /* non-blocking */ }

      // Helper: convert File to base64 string
      const fileToBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
            const base64 = result.split(',')[1] || '';
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

      // Collect all files with their document types
      let filesToUpload: { file: File; document_type: string }[] = [];

      if (isDocSubmission) {
        filesToUpload = form.general_docs.map(f => ({ file: f, document_type: 'General Submission' }));
      } else if (isGatewayOnly) {
        filesToUpload = [
          ...form.gateway_var_docs.map(f => ({ file: f, document_type: 'VAR Sheet' })),
          ...form.gateway_void_docs.map(f => ({ file: f, document_type: 'Voided Check / Bank Confirmation Letter' })),
        ];
      } else {
        filesToUpload = [
          ...form.statement_docs.map(f => ({ file: f, document_type: 'Bank Statement' })),
          ...form.void_check_docs.map(f => ({ file: f, document_type: 'Voided Check / Bank Confirmation Letter' })),
        ];
      }

      // Enforce total file size limit (15MB)
      const totalSize = filesToUpload.reduce((sum, f) => sum + f.file.size, 0);
      if (totalSize > 15 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Files too large", description: "Total file size must be under 15MB. Please reduce file sizes or upload fewer documents." });
        setIsSubmitting(false);
        return;
      }

      // Convert files to base64
      const encodedFiles = await Promise.all(
        filesToUpload.map(async ({ file, document_type }) => ({
          name: file.name,
          size: file.size,
          type: file.type || undefined,
          data: await fileToBase64(file),
          document_type,
        }))
      );

      // Build validated payload based on service type
      let payload: Record<string, any>;

      if (isDocSubmission) {
        payload = {
          service_type: "document_submission",
          dba_contact_first_name: form.dba_contact_first_name,
          dba_contact_last_name: form.dba_contact_last_name,
          dba_contact_email: form.dba_contact_email,
          additional_notes: form.additional_notes,
          files: encodedFiles,
        };
      } else if (isGatewayOnly) {
        payload = {
          service_type: "gateway_only",
          dba_name: form.dba_name,
          dba_contact_first_name: form.dba_contact_first_name,
          dba_contact_last_name: form.dba_contact_last_name,
          dba_contact_phone: form.dba_contact_phone,
          dba_contact_email: form.dba_contact_email,
          dba_address_line1: form.dba_address_line1,
          dba_address_line2: form.dba_address_line2,
          dba_city: form.dba_city,
          dba_state: form.dba_state,
          dba_zip: form.dba_zip,
          dba_country: form.dba_country,
          username: form.username,
          current_processor: form.current_processor,
          additional_notes: form.additional_notes,
          pricing_plan: form.pricing_plan,
          files: encodedFiles,
        };
      } else {
        payload = {
          service_type: "processing",
          dba_name: form.dba_name,
          product_description: form.product_description,
          nature_of_business: form.nature_of_business,
          dba_contact_first_name: form.dba_contact_first_name,
          dba_contact_last_name: form.dba_contact_last_name,
          dba_contact_phone: form.dba_contact_phone,
          dba_contact_email: form.dba_contact_email,
          dba_address_line1: form.dba_address_line1,
          dba_address_line2: form.dba_address_line2,
          dba_city: form.dba_city,
          dba_state: form.dba_state,
          dba_zip: form.dba_zip,
          dba_country: form.dba_country,
          legal_entity_name: form.legal_entity_name,
          federal_tax_id: form.federal_tax_id,
          ownership_type: form.ownership_type,
          business_formation_date: form.business_formation_date,
          state_incorporated: form.state_incorporated,
          tax_exempt: form.tax_exempt,
          legal_address_line1: form.legal_address_line1,
          legal_address_line2: form.legal_address_line2,
          legal_city: form.legal_city,
          legal_state: form.legal_state,
          legal_zip: form.legal_zip,
          legal_country: form.legal_country,
          monthly_volume: form.monthly_volume,
          average_transaction: form.average_transaction,
          high_ticket: form.high_ticket,
          percent_swiped: form.percent_swiped,
          percent_keyed: form.percent_keyed,
          percent_moto: form.percent_moto,
          percent_ecommerce: form.percent_ecommerce,
          percent_b2b: form.percent_b2b,
          percent_b2c: form.percent_b2c,
          website_url: form.website_url,
          sic_mcc_code: form.sic_mcc_code,
          principals: form.principals.map(p => ({
            principal_first_name: p.principal_first_name,
            principal_last_name: p.principal_last_name,
            principal_title: p.principal_title,
            ownership_percent: p.ownership_percent,
            principal_phone: p.principal_phone,
            principal_email: p.principal_email,
            principal_address_line1: p.principal_address_line1,
            principal_address_line2: p.principal_address_line2,
            principal_city: p.principal_city,
            principal_state: p.principal_state,
            principal_zip: p.principal_zip,
            principal_country: p.principal_country,
            date_of_birth: p.date_of_birth,
            ssn_full: p.ssn_full,
          })),
          bank_name: form.bank_name,
          account_holder_name: form.account_holder_name,
          routing_number: form.routing_number,
          account_number: form.account_number,
          merchant_agreement_accepted: form.merchant_agreement_accepted,
          account_authorization_accepted: form.account_authorization_accepted,
          beneficial_owner_certification: form.beneficial_owner_certification,
          additional_notes: form.additional_notes,
          pricing_plan: form.pricing_plan,
          files: encodedFiles,
        };
      }

      // Add audit metadata
      payload.client_ip = clientIp;
      payload.user_agent = navigator.userAgent;

      // Call server-side validated edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cuqjaddtmkotgvfsgcol.supabase.co';
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cWphZGR0bWtvdGd2ZnNnY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTM3NjUsImV4cCI6MjA4MDQyOTc2NX0.u1m_nORZsJ3Law0y3-xIIoNUoiRcrTXukJyW14y-AoA';
      console.log('[MerchantApply] Submitting to:', `${supabaseUrl}/functions/v1/submit-merchant-application`);
      const res = await fetch(`${supabaseUrl}/functions/v1/submit-merchant-application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned an unexpected response. Please try again shortly.");
      }

      const result = await res.json();
      console.log('[MerchantApply] Response status:', res.status, 'body:', JSON.stringify(result));

      if (!res.ok) {
        const msg = result.issues
          ? result.issues.map((i: any) => `${i.field}: ${i.message}`).join(", ")
          : result.error || "Submission failed";
        throw new Error(msg);
      }

      // Check for file upload failures and warn the user
      if (result.files && result.files.failed > 0) {
        toast({
          variant: "destructive",
          title: `${result.files.failed} document(s) failed to upload`,
          description: "Your application was submitted but some files could not be saved. Please contact us to re-submit the missing documents.",
        });
      }

      setIsSubmitted(true);
      window.location.href = "https://merchanthaus.io";
    } catch (error: any) {
      const message = error?.message || '';
      const friendly = message && message.length < 500
        ? message
        : (await import('@/lib/friendly-errors')).getFriendlyError(error);
      toast({ variant: "destructive", title: "Submission failed", description: friendly });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Service type selection ───
  if (serviceType === null) {
    return (
      <div className="merchant-form fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
          </div>
        </header>
        <div className="p-4 md:p-8">
          <div className="max-w-2xl mx-auto space-y-6 md:space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-xl md:text-3xl font-bold text-foreground">What do you need?</h1>
              <p className="text-sm md:text-base text-muted-foreground">Select the service that best fits your business requirements.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <button onClick={() => { setServiceType("gateway_only"); setStepIndex(0); }} className="group text-left bg-card rounded-2xl border-2 border-border hover:border-primary/50 p-5 md:p-6 transition-all shadow-sm hover:shadow-md space-y-3">
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center"><Zap className="w-6 h-6 text-teal-600" /></div>
                <h2 className="text-lg font-semibold text-foreground">Gateway Only</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">I already have a processor and need NMI gateway access.</p>
                <div className="text-xs text-primary font-medium">Quick setup — fewer fields required →</div>
              </button>
              <button onClick={() => { setServiceType("gateway_and_processing"); setStepIndex(0); }} className="group text-left bg-card rounded-2xl border-2 border-border hover:border-primary/50 p-5 md:p-6 transition-all shadow-sm hover:shadow-md space-y-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><CreditCard className="w-6 h-6 text-primary" /></div>
                <h2 className="text-lg font-semibold text-foreground">Gateway + Processing</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">I need both a payment processor and NMI gateway.</p>
                <div className="text-xs text-primary font-medium">Full application required →</div>
              </button>
              <button onClick={() => { setServiceType("document_submission"); setStepIndex(0); }} className="group text-left bg-card rounded-2xl border-2 border-border hover:border-primary/50 p-5 md:p-6 transition-all shadow-sm hover:shadow-md space-y-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center"><FileText className="w-6 h-6 text-amber-600" /></div>
                <h2 className="text-lg font-semibold text-foreground">Document Submission</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">Upload required documents for an existing or new application.</p>
                <div className="text-xs text-primary font-medium">Upload documents only →</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Submitted screen ───
  if (isSubmitted) {
    return (
      <div className="merchant-form fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Application Received!</h1>
          <p className="text-muted-foreground">Our team will review your application and contact you within 1-2 business days.</p>
          <a href="https://merchanthaus.io" className="inline-block mt-4 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Return to Website</a>
        </div>
      </div>
    );
  }

  // ─── Main form ───
  const currentStep = steps[stepIndex];

  return (
    <div className="merchant-form fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setServiceType(null); setStepIndex(0); setForm(initialState); setTouched({}); setShowAllErrors(false); }} className="text-xs text-muted-foreground hover:text-foreground mr-2">← Change type</button>
            <div className="h-1.5 w-20 md:h-2 md:w-32 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs md:text-sm font-medium text-foreground">{progress}%</span>
          </div>
        </div>
      </header>

      <div className="p-3 md:p-8">
        <div className="max-w-6xl mx-auto space-y-3 md:space-y-6">
          {/* Step Navigation */}
          <nav className="flex items-center justify-between gap-1 md:gap-2 overflow-x-auto pb-1 md:pb-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === stepIndex;
              const isCompleted = index < stepIndex;
              return (
                <button key={step.label} onClick={() => setStepIndex(index)} className={cn(
                  "flex items-center gap-1.5 md:gap-3 px-2 py-1.5 md:px-4 md:py-3 rounded-lg flex-1 min-w-0 transition-all border-b-2",
                  isActive ? "bg-card border-primary shadow-sm" : isCompleted ? "bg-card/50 border-primary/50" : "bg-transparent border-transparent hover:bg-card/50"
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

          {/* Main Content */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
            <section className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm overflow-visible">
              <div className="p-4 md:p-6">
                <div className="mb-4 md:mb-6">
                  <h2 className="text-base md:text-xl font-semibold text-foreground">{currentStep.label}</h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Required fields marked with <span className="text-destructive">*</span></p>
                </div>

                {isDocSubmission ? (
                  <DocumentSubmissionStep form={form} onChange={handleChange} onBlur={handleBlur} getError={getError} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
                ) : isGatewayOnly ? (
                  <>
                    {stepIndex === 0 && <GatewayBusinessStep form={form} onChange={handleChange} onBlur={handleBlur} getError={getError} />}
                    {stepIndex === 1 && <GatewayDocumentsStep form={form} onChange={handleChange} onSubmit={handleSubmit} isSubmitting={isSubmitting} progress={progress} />}
                  </>
                ) : (
                  <>
                    {stepIndex === 0 && <PricingStep form={form} onChange={handleChange} />}
                    {stepIndex === 1 && <BusinessProfileStep form={form} onChange={handleChange} onBlur={handleBlur} getError={getError} isCanadian={isCanadian} />}
                    {stepIndex === 2 && <LegalInfoStep form={form} onChange={handleChange} onBlur={handleBlur} getError={getError} isCanadian={isCanadian} />}
                    {stepIndex === 3 && <ProcessingStep form={form} onChange={handleChange} onBlur={handleBlur} getError={getError} />}
                    {stepIndex === 4 && <OwnersBankingStep form={form} onChange={handleChange} onPrincipalChange={handlePrincipalChange} addPrincipal={addPrincipal} removePrincipal={removePrincipal} onBlur={handleBlur} getError={getError} isCanadian={isCanadian} />}
                    {stepIndex === 5 && <ReviewStep form={form} onSubmit={handleSubmit} isSubmitting={isSubmitting} progress={progress} onChange={handleChange} isCanadian={isCanadian} />}
                  </>
                )}
              </div>

              {/* Navigation — hide on last step and doc submission (single step) */}
              {!isDocSubmission && ((isGatewayOnly && stepIndex < 1) || (!isGatewayOnly && stepIndex < 5)) && (
                <div className="px-4 py-3 md:px-6 md:py-4 bg-muted border-t border-border flex items-center justify-between">
                  <button type="button" className="rounded-lg border border-border bg-card px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-40" onClick={() => setStepIndex(prev => Math.max(0, prev - 1))} disabled={stepIndex === 0}>Back</button>
                  <button type="button" className="rounded-lg bg-primary px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90" onClick={handleNextStep}>Next Step</button>
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
                  {isDocSubmission ? (
                    <SectionStatus label="Contact Info" count={DOCS_REQUIRED.docs_contact.length - (missingBySection.docs_contact?.length ?? 0)} total={DOCS_REQUIRED.docs_contact.length} />
                  ) : isGatewayOnly ? (
                    <SectionStatus label="Business Details" count={GATEWAY_REQUIRED.gateway_business.length - (missingBySection.gateway_business?.length ?? 0)} total={GATEWAY_REQUIRED.gateway_business.length} />
                  ) : (
                    <>
                      <SectionStatus label="Business Profile" count={PROCESSING_REQUIRED.business.length - (missingBySection.business?.length ?? 0)} total={PROCESSING_REQUIRED.business.length} />
                      <SectionStatus label="Legal Info" count={PROCESSING_REQUIRED.legal.length - (missingBySection.legal?.length ?? 0)} total={PROCESSING_REQUIRED.legal.length} />
                      <SectionStatus label="Processing" count={PROCESSING_REQUIRED.processing.length - (missingBySection.processing?.length ?? 0)} total={PROCESSING_REQUIRED.processing.length} />
                      <SectionStatus label="Owners & Banking" count={(() => { const obFields = [...form.principals.flatMap((_, i) => [`principal_first_name_${i}`,`principal_last_name_${i}`,`principal_title_${i}`,`ownership_percent_${i}`,`date_of_birth_${i}`,...(isCanadian ? [] : [`ssn_full_${i}`])]),"bank_name","account_holder_name","routing_number","account_number"]; return obFields.length - (missingBySection.owners_banking?.length ?? obFields.length); })()} total={form.principals.length * (isCanadian ? 5 : 6) + 4} />
                    </>
                  )}
                </div>
              </div>

              <div className="bg-info/10 rounded-xl md:rounded-2xl border border-info/20 p-3 md:p-5">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Security Notice</p>
                    <p className="text-xs text-muted-foreground mt-1">{isCanadian ? "Bank account numbers are encrypted with AES-256-GCM before storage and automatically purged after underwriting." : "SSN and bank account numbers are encrypted with AES-256-GCM before storage and automatically purged after underwriting."}</p>
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
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, required, children, hint, error }: { label: string; required?: boolean; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="space-y-1 md:space-y-1.5 text-xs md:text-sm">
      <span className="flex items-center gap-1 font-medium text-foreground">
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
            ? "bg-emerald-600 text-white font-semibold border-emerald-600 focus:bg-card focus:text-foreground focus:font-normal focus:border-primary focus:ring-primary/20"
            : "bg-card text-foreground border-input focus:border-primary focus:ring-primary/20",
        props.className
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
            ? "bg-emerald-600 text-white font-semibold border-emerald-600 focus:bg-card focus:text-foreground focus:font-normal focus:border-primary focus:ring-primary/20"
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
            ? "bg-emerald-600 text-white font-semibold border-emerald-600 focus:bg-card focus:text-foreground focus:font-normal focus:border-primary focus:ring-primary/20"
            : "bg-card text-foreground border-input focus:ring-primary/20",
      )}
    />
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
      <div className="relative flex justify-start"><span className="bg-card pr-3 text-sm font-medium text-muted-foreground">{label}</span></div>
    </div>
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
        <div className={cn("h-full transition-all", count === total ? "bg-primary" : "bg-primary/70")} style={{ width: `${(count / total) * 100}%` }} />
      </div>
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-medium">{value || <span className="text-muted-foreground font-normal italic">Not provided</span>}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Gateway Business Details
// ─────────────────────────────────────────────────────────────────────────────

interface StepProps {
  form: MerchantForm;
  onChange: <K extends keyof MerchantForm>(field: K, value: MerchantForm[K]) => void;
  onBlur: (field: string) => void;
  getError: (field: string) => string | null;
  isCanadian?: boolean;
}

function GatewayBusinessStep({ form, onChange, onBlur, getError }: StepProps) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Field label="Business / DBA Name" required error={getError("dba_name")}>
        <Input value={form.dba_name} onChange={e => onChange("dba_name", e.target.value)} onBlur={() => onBlur("dba_name")} hasError={!!getError("dba_name")} />
      </Field>
      <Divider label="Contact Information" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="First Name" required error={getError("dba_contact_first_name")}>
          <Input value={form.dba_contact_first_name} onChange={e => onChange("dba_contact_first_name", e.target.value)} onBlur={() => onBlur("dba_contact_first_name")} hasError={!!getError("dba_contact_first_name")} />
        </Field>
        <Field label="Last Name" required error={getError("dba_contact_last_name")}>
          <Input value={form.dba_contact_last_name} onChange={e => onChange("dba_contact_last_name", e.target.value)} onBlur={() => onBlur("dba_contact_last_name")} hasError={!!getError("dba_contact_last_name")} />
        </Field>
        <Field label="Phone" required error={getError("dba_contact_phone")}>
          <Input value={form.dba_contact_phone} onChange={e => onChange("dba_contact_phone", e.target.value)} onBlur={() => onBlur("dba_contact_phone")} placeholder="+1 (555) 000-0000" hasError={!!getError("dba_contact_phone")} />
        </Field>
        <Field label="Email" required error={getError("dba_contact_email")}>
          <Input type="email" value={form.dba_contact_email} onChange={e => onChange("dba_contact_email", e.target.value)} onBlur={() => onBlur("dba_contact_email")} hasError={!!getError("dba_contact_email")} />
        </Field>
      </div>
      <Divider label="Location" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Address" required error={getError("dba_address_line1")}>
          <Input value={form.dba_address_line1} onChange={e => onChange("dba_address_line1", e.target.value)} onBlur={() => onBlur("dba_address_line1")} hasError={!!getError("dba_address_line1")} />
        </Field>
        <Field label="Address Line 2">
          <Input value={form.dba_address_line2} onChange={e => onChange("dba_address_line2", e.target.value)} />
        </Field>
        <Field label="City" required error={getError("dba_city")}>
          <Input value={form.dba_city} onChange={e => onChange("dba_city", e.target.value)} onBlur={() => onBlur("dba_city")} hasError={!!getError("dba_city")} />
        </Field>
        <Field label="State" required error={getError("dba_state")}>
          <Input value={form.dba_state} onChange={e => onChange("dba_state", e.target.value)} onBlur={() => onBlur("dba_state")} hasError={!!getError("dba_state")} />
        </Field>
        <Field label="ZIP Code" required error={getError("dba_zip")}>
          <Input value={form.dba_zip} onChange={e => onChange("dba_zip", e.target.value)} onBlur={() => onBlur("dba_zip")} hasError={!!getError("dba_zip")} />
        </Field>
      </div>
      <Divider label="Gateway Details" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Preferred NMI Username" required error={getError("username")}>
          <Input value={form.username} onChange={e => onChange("username", e.target.value)} onBlur={() => onBlur("username")} placeholder="e.g. jsmith_gateway" hasError={!!getError("username")} />
        </Field>
        <Field label="Current Processor" required error={getError("current_processor")}>
          <Input value={form.current_processor} onChange={e => onChange("current_processor", e.target.value)} onBlur={() => onBlur("current_processor")} placeholder="e.g. First Data, TSYS" hasError={!!getError("current_processor")} />
        </Field>
      </div>
      <Field label="Additional Notes">
        <Textarea value={form.additional_notes} onChange={e => onChange("additional_notes", e.target.value)} placeholder="Anything else..." />
      </Field>
    </div>
  );
}

// ─── Gateway Documents & Submit ───

function GatewayDocumentsStep({ form, onChange, onSubmit, isSubmitting, progress }: { form: MerchantForm; onChange: <K extends keyof MerchantForm>(field: K, value: MerchantForm[K]) => void; onSubmit: () => void; isSubmitting: boolean; progress: number }) {
  const allComplete = progress === 100;
  const hasFiles = form.gateway_var_docs.length > 0 || form.gateway_void_docs.length > 0;
  return (
    <div className="space-y-6">
      {/* VAR Sheet Upload */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> VAR Sheet
        </h3>
        <p className="text-xs text-muted-foreground">From your current processor. This document shows your current rates and processing details.</p>
        <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card p-4 cursor-pointer transition-all group text-center">
          <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
          <span className="text-xs font-medium text-foreground">Upload VAR Sheet</span>
          <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC</span>
          <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tiff,.tif" onChange={e => {
            const files = Array.from(e.target.files ?? []);
            onChange("gateway_var_docs", [...form.gateway_var_docs, ...files] as any);
          }} />
        </label>
        {form.gateway_var_docs.length > 0 && (
          <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
            {form.gateway_var_docs.map((f, i) => (
              <div key={`var-${i}`} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate">📄 {f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                <button type="button" onClick={() => onChange("gateway_var_docs", form.gateway_var_docs.filter((_, j) => j !== i) as any)} className="text-destructive hover:text-destructive/80 ml-2"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voided Check Upload */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Voided Check or Bank Confirmation Letter
        </h3>
        <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card p-4 cursor-pointer transition-all group text-center">
          <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
          <span className="text-xs font-medium text-foreground">Upload Voided Check / Bank Letter</span>
          <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC</span>
          <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tiff,.tif" onChange={e => {
            const files = Array.from(e.target.files ?? []);
            onChange("gateway_void_docs", [...form.gateway_void_docs, ...files] as any);
          }} />
        </label>
        {form.gateway_void_docs.length > 0 && (
          <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
            {form.gateway_void_docs.map((f, i) => (
              <div key={`void-${i}`} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate">📄 {f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                <button type="button" onClick={() => onChange("gateway_void_docs", form.gateway_void_docs.filter((_, j) => j !== i) as any)} className="text-destructive hover:text-destructive/80 ml-2"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-muted p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Application Summary</h3>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <DataItem label="Business Name" value={form.dba_name} />
          <DataItem label="Contact" value={`${form.dba_contact_first_name} ${form.dba_contact_last_name}`} />
          <DataItem label="Email" value={form.dba_contact_email} />
          <DataItem label="Phone" value={form.dba_contact_phone} />
          <DataItem label="Username" value={form.username} />
          <DataItem label="Current Processor" value={form.current_processor} />
          <DataItem label="Documents" value={`${form.gateway_var_docs.length + form.gateway_void_docs.length} file(s) attached`} />
        </dl>
      </div>
      {allComplete ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 mt-0.5" /><div><p className="font-medium">Ready to Submit!</p></div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" /><div><p className="font-medium">Please complete all required fields.</p></div>
        </div>
      )}
      <div className="pt-4 border-t border-border space-y-3">
        <button type="button" className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground flex items-center justify-center gap-2" onClick={onSubmit} disabled={!allComplete || isSubmitting}>
          {isSubmitting ? "Submitting..." : <><CheckCircle className="w-4 h-4" />Submit Gateway Application</>}
        </button>
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          By submitting this application, you acknowledge that we collect your IP address and browser information for fraud prevention and audit purposes in accordance with applicable law.
        </p>
      </div>
    </div>
  );
}

// ─── Document Submission Step ───

const DOC_TYPES = [
  "Articles of Organization",
  "Tax Document (EIN)",
  "Bank Confirmation Letter",
  "Voided Check",
  "Passport / Drivers License",
  "Bank Statement",
  "Processing Statement",
  "Other",
] as const;

function DocumentSubmissionStep({ form, onChange, onBlur, getError, onSubmit, isSubmitting }: {
  form: MerchantForm;
  onChange: <K extends keyof MerchantForm>(field: K, value: MerchantForm[K]) => void;
  onBlur: (field: string) => void;
  getError: (field: string) => string | null;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const hasFiles = form.general_docs.length > 0;
  const contactComplete = form.dba_contact_first_name.trim() && form.dba_contact_last_name.trim() && form.dba_contact_email.trim();
  const canSubmit = hasFiles && contactComplete;

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-foreground">Please fill out the email address associated with your submission.</p>
          <p className="text-muted-foreground mt-1">This allows us to match your documents to the correct application.</p>
        </div>
      </div>

      {/* Contact Fields */}
      <div className="grid gap-3 md:gap-4 md:grid-cols-3">
        <Field label="First Name" required error={getError("dba_contact_first_name")}>
          <Input value={form.dba_contact_first_name} onChange={e => onChange("dba_contact_first_name", e.target.value)} onBlur={() => onBlur("dba_contact_first_name")} placeholder="First name" hasError={!!getError("dba_contact_first_name")} />
        </Field>
        <Field label="Last Name" required error={getError("dba_contact_last_name")}>
          <Input value={form.dba_contact_last_name} onChange={e => onChange("dba_contact_last_name", e.target.value)} onBlur={() => onBlur("dba_contact_last_name")} placeholder="Last name" hasError={!!getError("dba_contact_last_name")} />
        </Field>
        <Field label="Email Address" required error={getError("dba_contact_email")}>
          <Input type="email" value={form.dba_contact_email} onChange={e => onChange("dba_contact_email", e.target.value)} onBlur={() => onBlur("dba_contact_email")} placeholder="email@example.com" hasError={!!getError("dba_contact_email")} />
        </Field>
      </div>

      {/* Document Types Reference */}
      <div className="rounded-xl border border-border bg-muted p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Accepted Document Types</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {DOC_TYPES.map(dt => (
            <div key={dt} className="flex items-center gap-2 text-sm text-foreground">
              <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              {dt}
            </div>
          ))}
        </div>
      </div>

      {/* File Upload */}
      <div>
        <label className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card p-6 cursor-pointer transition-all group text-center">
          <Plus className="w-8 h-8 text-muted-foreground group-hover:text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Upload Documents</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, DOC — multiple files allowed</p>
          </div>
          <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tiff,.tif" onChange={e => {
            const files = Array.from(e.target.files ?? []);
            onChange("general_docs", [...form.general_docs, ...files] as any);
          }} />
        </label>
      </div>

      {/* Uploaded Files List */}
      {form.general_docs.length > 0 && (
        <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">{form.general_docs.length} file(s) selected</p>
          {form.general_docs.map((f, i) => (
            <div key={`gd-${i}`} className="flex items-center justify-between text-xs">
              <span className="text-foreground truncate">📄 {f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
              <button type="button" onClick={() => onChange("general_docs", form.general_docs.filter((_, j) => j !== i) as any)} className="text-destructive hover:text-destructive/80 ml-2"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-border space-y-3">
        <button type="button" className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground flex items-center justify-center gap-2" onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Submitting..." : <><CheckCircle className="w-4 h-4" />Submit Documents</>}
        </button>
        {!hasFiles && <p className="text-xs text-muted-foreground text-center mt-2">Please upload at least one document.</p>}
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          By submitting, you acknowledge that we collect your IP address and browser information for fraud prevention and audit purposes in accordance with applicable law.
        </p>
      </div>
    </div>
  );
}

// ─── Pricing Step ───

const CARD_LOGOS = [cardVisa, cardMastercard, cardAmex, cardDiscover];

function PricingStep({ form, onChange }: { form: MerchantForm; onChange: <K extends keyof MerchantForm>(field: K, value: MerchantForm[K]) => void }) {
  const selected = form.pricing_plan;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Select the pricing model for your merchant account. This determines how processing fees are calculated.</p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Flat Rate */}
        <button
          type="button"
          onClick={() => onChange("pricing_plan", "flat_rate")}
          className={cn(
            "text-left rounded-xl border-2 p-5 transition-all space-y-4",
            selected === "flat_rate" ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40 bg-card"
          )}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Flat Rate</h3>
            {selected === "flat_rate" && <CheckCircle className="w-5 h-5 text-primary" />}
          </div>
          <div className="flex items-center gap-1.5">
            {CARD_LOGOS.map((logo, i) => <img key={i} src={logo} alt="" className="h-6 w-auto rounded-sm" />)}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left py-1 font-medium text-muted-foreground"></th><th className="text-right py-1 font-medium text-muted-foreground">Percent</th><th className="text-right py-1 font-medium text-muted-foreground">Per Item</th></tr></thead>
            <tbody>
              <tr className="border-b border-border/50"><td className="py-1.5 text-foreground">Visa, Mastercard, Discover</td><td className="text-right text-foreground">2.90%</td><td className="text-right text-foreground">$0.30</td></tr>
              <tr><td className="py-1.5 text-foreground">Non Swiped Fee</td><td className="text-right text-foreground">0.70%</td><td className="text-right text-foreground">$0.30</td></tr>
            </tbody>
          </table>
        </button>

        {/* Interchange Plus */}
        <button
          type="button"
          onClick={() => onChange("pricing_plan", "interchange_plus")}
          className={cn(
            "text-left rounded-xl border-2 p-5 transition-all space-y-4",
            selected === "interchange_plus" ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40 bg-card"
          )}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Interchange Plus</h3>
            {selected === "interchange_plus" && <CheckCircle className="w-5 h-5 text-primary" />}
          </div>
          <div className="flex items-center gap-1.5">
            {CARD_LOGOS.map((logo, i) => <img key={i} src={logo} alt="" className="h-6 w-auto rounded-sm" />)}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left py-1 font-medium text-muted-foreground"></th><th className="text-right py-1 font-medium text-muted-foreground">Percent</th><th className="text-right py-1 font-medium text-muted-foreground">Per Item</th></tr></thead>
            <tbody>
              <tr className="border-b border-border/50"><td className="py-1.5 text-foreground">Visa, Mastercard, Discover</td><td className="text-right text-foreground">0.50%</td><td className="text-right text-foreground">$0.25</td></tr>
              <tr><td className="py-1.5 text-foreground">American Express Rate</td><td className="text-right text-foreground">0.50%</td><td className="text-right text-foreground">$0.25</td></tr>
            </tbody>
          </table>
        </button>
      </div>

      {/* Additional Fees — shown for both plans */}
      {selected && (
        <div className="rounded-xl border border-border bg-muted p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Additional Fees</h4>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left py-1 font-medium text-muted-foreground">Fee</th><th className="text-right py-1 font-medium text-muted-foreground">Per Item</th></tr></thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/30"><td className="py-1.5">Monthly Fee</td><td className="text-right">$7.95</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Voice Auth Fee</td><td className="text-right">$0.95</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Address Verification (AVS) Fee</td><td className="text-right">$0.07</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Batch Fee</td><td className="text-right">$0.25</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">ACH Return Fee</td><td className="text-right">$25.00</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Chargeback Fee</td><td className="text-right">$25.00</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Retrieval Request Fee</td><td className="text-right">$10.00</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Regulatory/1099 Fee</td><td className="text-right">$6.95</td></tr>
              <tr className="border-b border-border/30"><td className="py-1.5">Monthly Minimum</td><td className="text-right">$10.00</td></tr>
              <tr><td className="py-1.5">Annual Fee</td><td className="text-right">$99.00</td></tr>
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-3">
            Terms and Conditions will apply. *All Interchange, Card Brand Fees, Dues and Assessments will be passed through to the merchant on the monthly billing statement. **PCI/DSS Compliance is regulated and monitored by the Major Card Brands (Visa, Mastercard, Discover, and American Express).
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Business Profile ───

function BusinessProfileStep({ form, onChange, onBlur, getError, isCanadian }: StepProps) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Field label="DBA Name (Doing Business As)" required error={getError("dba_name")}>
        <Input value={form.dba_name} onChange={e => onChange("dba_name", e.target.value)} onBlur={() => onBlur("dba_name")} hasError={!!getError("dba_name")} />
      </Field>
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Describe Products or Services" required error={getError("product_description")}>
          <Input value={form.product_description} onChange={e => onChange("product_description", e.target.value)} onBlur={() => onBlur("product_description")} placeholder="e.g. Shoes, Consulting" hasError={!!getError("product_description")} />
        </Field>
        <Field label="Nature of Business" required error={getError("nature_of_business")}>
          <Input value={form.nature_of_business} onChange={e => onChange("nature_of_business", e.target.value)} onBlur={() => onBlur("nature_of_business")} placeholder="e.g. Retail, eCommerce" hasError={!!getError("nature_of_business")} />
        </Field>
      </div>
      <Divider label="DBA Contact" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="First Name" required error={getError("dba_contact_first_name")}>
          <Input value={form.dba_contact_first_name} onChange={e => onChange("dba_contact_first_name", e.target.value)} onBlur={() => onBlur("dba_contact_first_name")} hasError={!!getError("dba_contact_first_name")} />
        </Field>
        <Field label="Last Name" required error={getError("dba_contact_last_name")}>
          <Input value={form.dba_contact_last_name} onChange={e => onChange("dba_contact_last_name", e.target.value)} onBlur={() => onBlur("dba_contact_last_name")} hasError={!!getError("dba_contact_last_name")} />
        </Field>
        <Field label="Phone" required error={getError("dba_contact_phone")}>
          <Input value={form.dba_contact_phone} onChange={e => onChange("dba_contact_phone", e.target.value)} onBlur={() => onBlur("dba_contact_phone")} placeholder="+1 (555) 000-0000" hasError={!!getError("dba_contact_phone")} />
        </Field>
        <Field label="Email" required error={getError("dba_contact_email")}>
          <Input type="email" value={form.dba_contact_email} onChange={e => onChange("dba_contact_email", e.target.value)} onBlur={() => onBlur("dba_contact_email")} hasError={!!getError("dba_contact_email")} />
        </Field>
      </div>
      <Divider label="DBA Address" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Address" required error={getError("dba_address_line1")}>
          <Input value={form.dba_address_line1} onChange={e => onChange("dba_address_line1", e.target.value)} onBlur={() => onBlur("dba_address_line1")} hasError={!!getError("dba_address_line1")} />
        </Field>
        <Field label="Address Line 2"><Input value={form.dba_address_line2} onChange={e => onChange("dba_address_line2", e.target.value)} /></Field>
        <Field label="City" required error={getError("dba_city")}>
          <Input value={form.dba_city} onChange={e => onChange("dba_city", e.target.value)} onBlur={() => onBlur("dba_city")} hasError={!!getError("dba_city")} />
        </Field>
        <Field label={isCanadian ? "Province" : "State"} required error={getError("dba_state")}>
          <Input value={form.dba_state} onChange={e => onChange("dba_state", e.target.value)} onBlur={() => onBlur("dba_state")} hasError={!!getError("dba_state")} />
        </Field>
        <Field label={isCanadian ? "Postal Code" : "ZIP Code"} required error={getError("dba_zip")}>
          <Input value={form.dba_zip} onChange={e => onChange("dba_zip", e.target.value)} onBlur={() => onBlur("dba_zip")} hasError={!!getError("dba_zip")} />
        </Field>
        <Field label="Country">
          <SelectInput value={form.dba_country} onChange={e => onChange("dba_country", e.target.value)}>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </SelectInput>
        </Field>
      </div>
    </div>
  );
}

// ─── Legal Information ───

function LegalInfoStep({ form, onChange, onBlur, getError, isCanadian }: StepProps) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Field label="Legal Entity Name" required error={getError("legal_entity_name")}>
        <Input value={form.legal_entity_name} onChange={e => onChange("legal_entity_name", e.target.value)} onBlur={() => onBlur("legal_entity_name")} placeholder="As registered with state/IRS" hasError={!!getError("legal_entity_name")} />
      </Field>
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Federal Tax ID (TIN/EIN)" required error={getError("federal_tax_id")}>
          <Input value={form.federal_tax_id} onChange={e => onChange("federal_tax_id", e.target.value)} onBlur={() => onBlur("federal_tax_id")} placeholder="XX-XXXXXXX" hasError={!!getError("federal_tax_id")} />
        </Field>
        <Field label="Business Ownership Type" required error={getError("ownership_type")}>
          <SelectInput value={form.ownership_type} onChange={e => onChange("ownership_type", e.target.value)} onBlur={() => onBlur("ownership_type")} hasError={!!getError("ownership_type")}>
            <option value="">Select type...</option>
            <option value="sole_proprietor">Sole Proprietor</option>
            <option value="llc">LLC</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="nonprofit">Non-Profit</option>
          </SelectInput>
        </Field>
        <Field label="Business Formation Date" required error={getError("business_formation_date")}>
          <Input type="date" value={form.business_formation_date} onChange={e => onChange("business_formation_date", e.target.value)} onBlur={() => onBlur("business_formation_date")} hasError={!!getError("business_formation_date")} />
        </Field>
        <Field label="State Incorporated" required error={getError("state_incorporated")}>
          <Input value={form.state_incorporated} onChange={e => onChange("state_incorporated", e.target.value)} onBlur={() => onBlur("state_incorporated")} hasError={!!getError("state_incorporated")} />
        </Field>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input type="checkbox" id="tax_exempt" checked={form.tax_exempt} onChange={e => onChange("tax_exempt", e.target.checked)} className="rounded border-border" />
        <label htmlFor="tax_exempt" className="text-sm text-foreground">Tax Exempt</label>
      </div>
      <Divider label="Legal Address" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Address" required error={getError("legal_address_line1")}>
          <Input value={form.legal_address_line1} onChange={e => onChange("legal_address_line1", e.target.value)} onBlur={() => onBlur("legal_address_line1")} hasError={!!getError("legal_address_line1")} />
        </Field>
        <Field label="Address Line 2"><Input value={form.legal_address_line2} onChange={e => onChange("legal_address_line2", e.target.value)} /></Field>
        <Field label="City" required error={getError("legal_city")}>
          <Input value={form.legal_city} onChange={e => onChange("legal_city", e.target.value)} onBlur={() => onBlur("legal_city")} hasError={!!getError("legal_city")} />
        </Field>
        <Field label="State" required error={getError("legal_state")}>
          <Input value={form.legal_state} onChange={e => onChange("legal_state", e.target.value)} onBlur={() => onBlur("legal_state")} hasError={!!getError("legal_state")} />
        </Field>
        <Field label="ZIP Code" required error={getError("legal_zip")}>
          <Input value={form.legal_zip} onChange={e => onChange("legal_zip", e.target.value)} onBlur={() => onBlur("legal_zip")} hasError={!!getError("legal_zip")} />
        </Field>
        <Field label="Country"><Input value={form.legal_country} onChange={e => onChange("legal_country", e.target.value)} placeholder="US" /></Field>
      </div>
    </div>
  );
}

// ─── Processing Info ───

function ProcessingStep({ form, onChange, onBlur, getError }: StepProps) {
  return (
    <div className="space-y-3 md:space-y-4">
      <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-3">
        <Field label="Monthly Volume ($)" required error={getError("monthly_volume")}>
          <NumberInput value={form.monthly_volume} onChange={e => onChange("monthly_volume", e.target.value)} onBlur={() => onBlur("monthly_volume")} placeholder="50000" hasError={!!getError("monthly_volume")} />
        </Field>
        <Field label="Average Transaction ($)" required error={getError("average_transaction")}>
          <NumberInput value={form.average_transaction} onChange={e => onChange("average_transaction", e.target.value)} onBlur={() => onBlur("average_transaction")} placeholder="75" hasError={!!getError("average_transaction")} />
        </Field>
        <Field label="High Ticket ($)" required error={getError("high_ticket")}>
          <NumberInput value={form.high_ticket} onChange={e => onChange("high_ticket", e.target.value)} onBlur={() => onBlur("high_ticket")} placeholder="500" hasError={!!getError("high_ticket")} />
        </Field>
      </div>
      <Divider label="Transaction Mix (must total 100%)" />
      <p className="text-xs text-muted-foreground -mt-1 mb-1">All four fields must add up to 100%. Set any unused method to 0.</p>
      <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
        <Field label="Swiped %" required error={getError("percent_swiped")}>
          <NumberInput value={form.percent_swiped} onChange={e => onChange("percent_swiped", e.target.value)} onBlur={() => onBlur("percent_swiped")} hasError={!!getError("percent_swiped")} />
        </Field>
        <Field label="Keyed %" required error={getError("percent_keyed")}>
          <NumberInput value={form.percent_keyed} onChange={e => onChange("percent_keyed", e.target.value)} onBlur={() => onBlur("percent_keyed")} hasError={!!getError("percent_keyed")} />
        </Field>
        <Field label="MOTO %" required error={getError("percent_moto")}>
          <NumberInput value={form.percent_moto} onChange={e => onChange("percent_moto", e.target.value)} onBlur={() => onBlur("percent_moto")} hasError={!!getError("percent_moto")} />
        </Field>
        <Field label="eCommerce %" required error={getError("percent_ecommerce")}>
          <NumberInput value={form.percent_ecommerce} onChange={e => onChange("percent_ecommerce", e.target.value)} onBlur={() => onBlur("percent_ecommerce")} hasError={!!getError("percent_ecommerce")} />
        </Field>
      </div>
      <Divider label="Sales Mix (must total 100%)" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="B2C %" hint="Business-to-Consumer">
          <NumberInput value={form.percent_b2c} onChange={e => onChange("percent_b2c", e.target.value)} />
        </Field>
        <Field label="B2B %" hint="Business-to-Business">
          <NumberInput value={form.percent_b2b} onChange={e => onChange("percent_b2b", e.target.value)} />
        </Field>
      </div>
      <Divider label="Additional" />
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <Field label="Website URL"><Input value={form.website_url} onChange={e => onChange("website_url", e.target.value)} placeholder="https://" /></Field>
        <Field label="SIC/MCC Code"><Input value={form.sic_mcc_code} onChange={e => onChange("sic_mcc_code", e.target.value)} placeholder="MCC if known" /></Field>
      </div>

      <Divider label="Supporting Documents" />
      <p className="text-xs text-muted-foreground -mt-1 mb-2">
        If your average ticket is &gt; $1,000 or High Ticket &gt; $2,500, we will need 3 months of Bank or Merchant Processing Statements to review with your application. You can upload them now to save time. Provide a Void Check or Bank Letter to assist us in validating your bank account to speed up application review.
      </p>
      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card p-4 cursor-pointer transition-all group">
          <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
          <div className="text-xs md:text-sm font-semibold text-foreground uppercase tracking-wide">Bank or Processing Statements</div>
          <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => {
            const files = Array.from(e.target.files ?? []);
            onChange("statement_docs", [...form.statement_docs, ...files] as any);
          }} />
        </label>
        <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card p-4 cursor-pointer transition-all group">
          <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
          <div className="text-xs md:text-sm font-semibold text-foreground uppercase tracking-wide">Void Check or Bank Letter</div>
          <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => {
            const files = Array.from(e.target.files ?? []);
            onChange("void_check_docs", [...form.void_check_docs, ...files] as any);
          }} />
        </label>
      </div>
      {(form.statement_docs.length > 0 || form.void_check_docs.length > 0) && (
        <div className="rounded-lg border border-border bg-muted p-3 text-xs space-y-1">
          {form.statement_docs.map((f, i) => (
            <div key={`s-${i}`} className="flex items-center justify-between">
              <span className="text-foreground">📄 {f.name}</span>
              <button type="button" onClick={() => onChange("statement_docs", form.statement_docs.filter((_, j) => j !== i) as any)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          {form.void_check_docs.map((f, i) => (
            <div key={`v-${i}`} className="flex items-center justify-between">
              <span className="text-foreground">📄 {f.name}</span>
              <button type="button" onClick={() => onChange("void_check_docs", form.void_check_docs.filter((_, j) => j !== i) as any)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Owners & Banking ───

interface OwnersBankingStepProps extends StepProps {
  onPrincipalChange: (index: number, field: keyof PrincipalForm, value: string) => void;
  addPrincipal: () => void;
  removePrincipal: (index: number) => void;
  isCanadian?: boolean;
}

function OwnersBankingStep({ form, onChange, onPrincipalChange, addPrincipal, removePrincipal, onBlur, getError, isCanadian }: OwnersBankingStepProps) {
  const [sameAsDba, setSameAsDba] = useState<Record<number, boolean>>({});

  const handleSameAsDba = (idx: number, checked: boolean) => {
    setSameAsDba(prev => ({ ...prev, [idx]: checked }));
    if (checked) {
      onPrincipalChange(idx, "principal_first_name", form.dba_contact_first_name);
      onPrincipalChange(idx, "principal_last_name", form.dba_contact_last_name);
      onPrincipalChange(idx, "principal_phone", form.dba_contact_phone);
      onPrincipalChange(idx, "principal_email", form.dba_contact_email);
      onPrincipalChange(idx, "principal_address_line1", form.dba_address_line1);
      onPrincipalChange(idx, "principal_address_line2", form.dba_address_line2);
      onPrincipalChange(idx, "principal_city", form.dba_city);
      onPrincipalChange(idx, "principal_state", form.dba_state);
      onPrincipalChange(idx, "principal_zip", form.dba_zip);
      onPrincipalChange(idx, "principal_country", form.dba_country);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="w-5 h-5 text-primary" />
          Principal Owners / Beneficial Owners
        </div>
        {form.principals.length < 5 && (
          <button type="button" onClick={addPrincipal} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium">
            <Plus className="w-3 h-3" /> Add Owner
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">At least 1 principal is required. Ownership percentages must total 100%.</p>

      {form.principals.map((principal, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Owner {idx + 1}</h4>
            {form.principals.length > 1 && (
              <button type="button" onClick={() => removePrincipal(idx)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`same_as_dba_${idx}`}
              checked={!!sameAsDba[idx]}
              onChange={e => handleSameAsDba(idx, e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor={`same_as_dba_${idx}`} className="text-xs text-muted-foreground cursor-pointer">
              Same as DBA Contact
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="First Name" required error={getError(`principal_first_name_${idx}`)}>
              <Input value={principal.principal_first_name} onChange={e => onPrincipalChange(idx, "principal_first_name", e.target.value)} onBlur={() => onBlur(`principal_first_name_${idx}`)} hasError={!!getError(`principal_first_name_${idx}`)} />
            </Field>
            <Field label="Last Name" required error={getError(`principal_last_name_${idx}`)}>
              <Input value={principal.principal_last_name} onChange={e => onPrincipalChange(idx, "principal_last_name", e.target.value)} onBlur={() => onBlur(`principal_last_name_${idx}`)} hasError={!!getError(`principal_last_name_${idx}`)} />
            </Field>
            <Field label="Title" required error={getError(`principal_title_${idx}`)}>
              <Input value={principal.principal_title} onChange={e => onPrincipalChange(idx, "principal_title", e.target.value)} onBlur={() => onBlur(`principal_title_${idx}`)} placeholder="CEO, Owner, etc." hasError={!!getError(`principal_title_${idx}`)} />
            </Field>
            <Field label="Ownership %" required error={getError(`ownership_percent_${idx}`)}>
              <NumberInput value={principal.ownership_percent} onChange={e => onPrincipalChange(idx, "ownership_percent", e.target.value)} onBlur={() => onBlur(`ownership_percent_${idx}`)} placeholder="100" hasError={!!getError(`ownership_percent_${idx}`)} />
            </Field>
            <Field label="Date of Birth" required error={getError(`date_of_birth_${idx}`)}>
              <Input type="date" value={principal.date_of_birth} onChange={e => onPrincipalChange(idx, "date_of_birth", e.target.value)} onBlur={() => onBlur(`date_of_birth_${idx}`)} hasError={!!getError(`date_of_birth_${idx}`)} />
            </Field>
            <Field label="Full SSN" required hint="🔒 Securely stored and automatically deleted after review. Please double-check for accuracy — if incorrect, we may request a scanned copy of an identity document (Passport or Driver's License)." error={getError(`ssn_full_${idx}`)}>
              <Input type="password" value={principal.ssn_full} onChange={e => onPrincipalChange(idx, "ssn_full", e.target.value)} onBlur={() => onBlur(`ssn_full_${idx}`)} placeholder="XXX-XX-XXXX" maxLength={11} hasError={!!getError(`ssn_full_${idx}`)} />
            </Field>
            <Field label="Phone"><Input value={principal.principal_phone} onChange={e => onPrincipalChange(idx, "principal_phone", e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={principal.principal_email} onChange={e => onPrincipalChange(idx, "principal_email", e.target.value)} /></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Address"><Input value={principal.principal_address_line1} onChange={e => onPrincipalChange(idx, "principal_address_line1", e.target.value)} /></Field>
            <Field label="City"><Input value={principal.principal_city} onChange={e => onPrincipalChange(idx, "principal_city", e.target.value)} /></Field>
            <Field label="State"><Input value={principal.principal_state} onChange={e => onPrincipalChange(idx, "principal_state", e.target.value)} /></Field>
            <Field label="ZIP"><Input value={principal.principal_zip} onChange={e => onPrincipalChange(idx, "principal_zip", e.target.value)} /></Field>
          </div>
        </div>
      ))}

      <Divider label="Banking Information" />
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
        <Landmark className="w-5 h-5 text-primary" />
        Settlement Account
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Bank Name" required error={getError("bank_name")}>
          <Input value={form.bank_name} onChange={e => onChange("bank_name", e.target.value)} onBlur={() => onBlur("bank_name")} hasError={!!getError("bank_name")} />
        </Field>
        <Field label="Name on Account" required error={getError("account_holder_name")}>
          <Input value={form.account_holder_name} onChange={e => onChange("account_holder_name", e.target.value)} onBlur={() => onBlur("account_holder_name")} hasError={!!getError("account_holder_name")} />
        </Field>
        <Field label="Routing Number" required hint="Encrypted — purged after underwriting" error={getError("routing_number")}>
          <Input type="password" value={form.routing_number} onChange={e => onChange("routing_number", e.target.value)} onBlur={() => onBlur("routing_number")} placeholder="9 digits" maxLength={9} hasError={!!getError("routing_number")} />
        </Field>
        <Field label="Account Number" required hint="Encrypted — purged after underwriting" error={getError("account_number")}>
          <Input type="password" value={form.account_number} onChange={e => onChange("account_number", e.target.value)} onBlur={() => onBlur("account_number")} placeholder="Account number" hasError={!!getError("account_number")} />
        </Field>
      </div>

      <Divider label="Certification of Beneficial Ownership" />
      <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2 max-h-64 overflow-y-auto">
          <p>To help the government fight financial crime, Federal regulation requires certain financial institutions to obtain, verify, and record information about the beneficial owners of legal entity customers.</p>
          <p>Legal entities can be abused to disguise involvement in terrorist financing, money laundering, tax evasion, corruption, fraud, and other financial crimes. Requiring the disclosure of key individuals who own or control a legal entity (i.e., the beneficial owners) helps law enforcement investigate and prosecute these crimes.</p>
          <p>By signing below, I attest that I have accurately provided the name, address, date of birth and Social Security Number (SSN) for the following individuals (i.e. the beneficial owners):</p>
          <p className="pl-4">(i) Each individual, if any, who owns directly or indirectly, 25 percent or more of the equity interests of the legal entity customer (e.g., each natural person that owns 25 percent or more of the shares of a corporation); and</p>
          <p className="pl-4">(ii) An individual with significant responsibility for managing the legal entity customer (e.g., a Chief Executive Officer, Chief Financial Officer, Chief Operating Officer, Managing Member, General Partner, President, Vice President, or Treasurer).</p>
          <p>The number of individuals that satisfy this definition of "beneficial owner" may vary. Under section (i), depending on the factual circumstances, up to four individuals (but as few as zero) may need to be identified. Regardless of the number of individuals identified under section (i), you must provide the identifying information of one individual under section (ii). It is possible that in some circumstances the same individual might be identified under both sections (e.g., the President of Acme, Inc. who also holds a 30% equity interest). Thus, a completed form will contain the identifying information of at least one individual (under section (ii)), and up to five individuals (i.e., one individual under section (ii) and four 25 percent equity holders under section (i)).</p>
        </div>
        <div className="flex items-start gap-2 pt-2 border-t border-border">
          <input type="checkbox" id="beneficial_cert" checked={form.beneficial_owner_certification} onChange={e => onChange("beneficial_owner_certification", e.target.checked)} className="mt-1 rounded border-border" />
          <label htmlFor="beneficial_cert" className="text-sm font-medium text-foreground">I have read and agree to the Certification of Beneficial Ownership <span className="text-destructive">*</span></label>
        </div>
      </div>

      <div className="space-y-3 mt-3">
        <div className="flex items-start gap-2">
          <input type="checkbox" id="bank_disclosure" checked={form.bank_disclosure_ack} onChange={e => onChange("bank_disclosure_ack", e.target.checked)} className="mt-1 rounded border-border" />
          <label htmlFor="bank_disclosure" className="text-sm text-foreground">I acknowledge the bank disclosure and authorize debits/credits to the account provided.</label>
        </div>
      </div>

      <Field label="Additional Notes">
        <Textarea value={form.additional_notes} onChange={e => onChange("additional_notes", e.target.value)} placeholder="Any other information..." />
      </Field>
    </div>
  );
}

// ─── Terms Dialog ───

const LazyTermsContent = lazy(() => import("./TermsProcessing").then(m => ({ default: m.TermsContent ?? m.default })));

function TermsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); setOpen(true); }} className="text-primary hover:underline font-medium">
        Merchant Terms and Conditions
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Merchant Terms and Conditions</DialogTitle>
          </DialogHeader>
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Loading terms…</div>}>
            <LazyTermsContent />
          </Suspense>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Review & Submit ───

function ReviewStep({ form, onSubmit, isSubmitting, progress, onChange, isCanadian = false }: { form: MerchantForm; onSubmit: () => void; isSubmitting: boolean; progress: number; onChange: <K extends keyof MerchantForm>(field: K, value: MerchantForm[K]) => void; isCanadian?: boolean }) {
  const allComplete = progress === 100;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CheckCircle2 className="w-5 h-5 text-primary" />
        Application Review
      </div>
      {allComplete ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 mt-0.5" /><div><p className="font-medium">Ready to Submit!</p><p className="mt-1">Review your information below and click Submit.</p></div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" /><div><p className="font-medium">Missing Required Information</p><p className="mt-1">Please go back and complete all required fields.</p></div>
        </div>
      )}
      <div className="space-y-4">
        {/* Pricing Summary */}
        {form.pricing_plan && (
          <div className="rounded-xl border border-border bg-muted p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Pricing Plan</h3>
            <div className="flex items-center gap-1.5 mb-3">
              {CARD_LOGOS.map((logo, i) => <img key={i} src={logo} alt="" className="h-5 w-auto rounded-sm" />)}
            </div>
            {form.pricing_plan === "flat_rate" ? (
              <>
                <p className="text-sm font-medium text-foreground mb-2">Flat Rate</p>
                <div className="text-sm text-foreground space-y-0.5">
                  <p>Visa, Mastercard, Discover — 2.90% + $0.30</p>
                  <p>Non Swiped Fee — 0.70% + $0.30</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground mb-2">Interchange Plus</p>
                <div className="text-sm text-foreground space-y-0.5">
                  <p>Visa, Mastercard, Discover — IC + 0.50% + $0.25</p>
                  <p>American Express — IC + 0.50% + $0.25</p>
                </div>
              </>
            )}
            <div className="mt-3 text-[10px] text-muted-foreground leading-relaxed space-y-0.5">
              <p>Monthly Fee: $7.95 · Batch Fee: $0.25 · AVS Fee: $0.07 · Voice Auth: $0.95</p>
              <p>ACH Return: $25.00 · Chargeback: $25.00 · Retrieval: $10.00</p>
              <p>Regulatory/1099: $6.95 · Monthly Minimum: $10.00 · Annual Fee: $99.00</p>
              <p className="mt-1 italic">*All Interchange, Card Brand Fees, Dues and Assessments are passed through on the monthly billing statement. **PCI/DSS Compliance is regulated by the Major Card Brands.</p>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-muted p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Business Profile</h3>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <DataItem label="DBA Name" value={form.dba_name} />
            <DataItem label="Products/Services" value={form.product_description} />
            <DataItem label="Nature of Business" value={form.nature_of_business} />
            <DataItem label="Contact" value={`${form.dba_contact_first_name} ${form.dba_contact_last_name}`} />
            <DataItem label="Email" value={form.dba_contact_email} />
            <DataItem label="Phone" value={form.dba_contact_phone} />
            <DataItem label="Address" value={[form.dba_address_line1, form.dba_address_line2, form.dba_city, form.dba_state, form.dba_zip].filter(Boolean).join(", ")} />
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-muted p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Legal Information</h3>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <DataItem label="Legal Entity" value={form.legal_entity_name} />
            <DataItem label="Federal Tax ID" value={form.federal_tax_id ? "••••••" + form.federal_tax_id.slice(-4) : ""} />
            <DataItem label="Ownership Type" value={form.ownership_type} />
            <DataItem label="Formation Date" value={form.business_formation_date} />
            <DataItem label="State Incorporated" value={form.state_incorporated} />
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-muted p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Processing</h3>
          <dl className="grid gap-2 text-sm md:grid-cols-3">
            <DataItem label="Monthly Volume" value={form.monthly_volume ? `$${form.monthly_volume}` : ""} />
            <DataItem label="Avg Transaction" value={form.average_transaction ? `$${form.average_transaction}` : ""} />
            <DataItem label="High Ticket" value={form.high_ticket ? `$${form.high_ticket}` : ""} />
            <DataItem label="Swiped/Keyed/MOTO/eCom" value={`${form.percent_swiped}/${form.percent_keyed}/${form.percent_moto}/${form.percent_ecommerce}%`} />
          </dl>
        </div>
        {(form.statement_docs.length > 0 || form.void_check_docs.length > 0) && (
          <div className="rounded-xl border border-border bg-muted p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Supporting Documents ({form.statement_docs.length + form.void_check_docs.length})</h3>
            {form.statement_docs.map((f, i) => <p key={`rs-${i}`} className="text-sm text-foreground">📄 {f.name} <span className="text-muted-foreground">(Statement)</span></p>)}
            {form.void_check_docs.map((f, i) => <p key={`rv-${i}`} className="text-sm text-foreground">📄 {f.name} <span className="text-muted-foreground">(Void Check/Bank Letter)</span></p>)}
          </div>
        )}
        <div className="rounded-xl border border-border bg-muted p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Principals ({form.principals.length})</h3>
          {form.principals.map((p, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3 mb-2 last:mb-0">
              <p className="text-sm font-semibold text-foreground">{p.principal_first_name} {p.principal_last_name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {p.principal_title} · {p.ownership_percent}% ownership · SSN: ••••{p.ssn_full.slice(-4)}
              </p>
              {(p.principal_email || p.principal_phone) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.principal_email}{p.principal_email && p.principal_phone ? " · " : ""}{p.principal_phone}
                </p>
              )}
              {p.principal_address_line1 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[p.principal_address_line1, p.principal_city, p.principal_state, p.principal_zip].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-muted p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Banking</h3>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <DataItem label="Bank" value={form.bank_name} />
            <DataItem label="Account Holder" value={form.account_holder_name} />
            <DataItem label="Routing" value={form.routing_number ? "•••••" + form.routing_number.slice(-4) : ""} />
            <DataItem label="Account" value={form.account_number ? "•••••" + form.account_number.slice(-4) : ""} />
          </dl>
        </div>
      </div>

      {/* ─── Disclosure & Agreement ─── */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-4 md:p-6 space-y-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Disclosure</h3>

        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Merchant Application and Agreement Acceptance</h4>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-3 max-h-64 overflow-y-auto pr-2">
            <p><strong>IMPORTANT INFORMATION ABOUT PROCEDURES FOR OPENING A NEW ACCOUNT:</strong> To help the government fight the funding of terrorism and money laundering activities, Federal law requires all financial institutions to obtain, verify, and record information that identifies each person who opens an account. What this means for you: When you open an account, we will ask for your name, address, date of birth, and other information that will allow us to identify you. We may also ask to see your driver's license or other identifying documents.</p>
            <p><strong>MERCHANT APPLICATION AND AGREEMENT ACCEPTANCE</strong> (Capitalized terms not defined in the Acceptance section have the meaning set forth below in the Terms and Conditions section). By executing this Merchant Application on behalf of the merchant described above ("Merchant"), the undersigned individual(s) represent(s), warrant(s), and acknowledge(s) that:</p>
            <p>(1) All information contained in this Merchant Application ("Application") is true, correct and complete as of the date of this Application;</p>
            <p>(ii) If the Merchant is a corporation, limited liability company, or partnership, the individual(s) executing this Application have the requisite legal power and authority to complete and submit this Application on behalf of the Merchant and to make and provide the acknowledgments, authorizations and agreements set forth herein on behalf of the Merchant and individually;</p>
            <p>(iii) The information contained in this Application is provided for the purpose of obtaining, or maintaining, a merchant account for the Merchant with the Member Bank ("BANK") and BANK will rely on the information provided herein in its approved process and in settling the applicable Discount Rate, Approved Average Ticket, and Approved Monthly Card Volume;</p>
            <p>(iv) BANK is authorized to investigate, either through its own agents or through credit bureaus/agencies, the credit of the Merchant and each person listed on this Application;</p>
            <p>(v) BANK will determine all rates, fees and charges and notify Merchant of the approved fees and by Merchant's submission and acceptance of Merchant's first settled transaction, Merchant agrees to pay such approved fees;</p>
            <p>(vi) The Merchant Agreement will not take effect until Merchant has been approved by BANK and a merchant number has been issued to merchant; and</p>
            <p>(vii) The undersigned has received, read, understood the Merchant Agreement, which is incorporated herein by reference thereto, and agrees on behalf of the Merchant to be bound by all terms and conditions thereof.</p>
            <p>The merchant on whose behalf this Application is being submitted acknowledges that if this Application is being submitted to Merrick Bank as the Member Bank, MerchantHaus / NMI Payments may also be a party to this Merchant Agreement. In such case, Merchant acknowledges that MerchantHaus / NMI Payments will rely on the representations and warranties set forth in this application for Merchant Agreement and unless otherwise specified or prohibited by Association of applicable law, MerchantHaus / NMI Payments will have all the rights of BANK under this Application and Agreement.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <input type="checkbox" id="review_account_auth" checked={form.account_authorization_accepted} onChange={e => onChange("account_authorization_accepted", e.target.checked)} className="mt-1 rounded border-border accent-primary h-4 w-4" />
            <label htmlFor="review_account_auth" className="text-sm text-foreground">
              By checking this box, you authorize the creation of your account <span className="text-destructive">*</span>
            </label>
          </div>

          <div className="flex items-start gap-3">
            <input type="checkbox" id="review_merchant_agreement" checked={form.merchant_agreement_accepted} onChange={e => onChange("merchant_agreement_accepted", e.target.checked)} className="mt-1 rounded border-border accent-primary h-4 w-4" />
            <label htmlFor="review_merchant_agreement" className="text-sm text-foreground">
              I acknowledge I have read and agree to the{" "}
              <TermsDialog />
              <span className="text-destructive"> *</span>
            </label>
          </div>
        </div>

        {(!form.merchant_agreement_accepted || !form.account_authorization_accepted) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>You must accept both agreements above before you can submit your application.</span>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-border space-y-3">
        <button type="button" className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground flex items-center justify-center gap-2" onClick={onSubmit} disabled={!allComplete || isSubmitting || !form.merchant_agreement_accepted || !form.account_authorization_accepted}>
          {isSubmitting ? "Submitting..." : <><CheckCircle className="w-4 h-4" />Submit Application</>}
        </button>
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          By submitting this application, you acknowledge that we collect your IP address and browser information for fraud prevention and audit purposes in accordance with applicable law.
        </p>
      </div>
    </div>
  );
}
