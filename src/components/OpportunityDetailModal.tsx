import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DetailSidebar } from "./opportunity-detail/DetailSidebar";
import { DetailRightPanel } from "./opportunity-detail/DetailRightPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Opportunity, STAGE_CONFIG, Account, Contact, getServiceType, EMAIL_TO_USER, TEAM_MEMBERS, OpportunityStage, PROCESSING_PIPELINE_STAGES, GATEWAY_ONLY_PIPELINE_STAGES, OutcomeStatus, OUTCOME_CONFIG } from "@/types/opportunity";
import { OutcomeSelector } from "./OutcomeSelector";
import { OutcomeDisplaySection } from "./opportunity-detail/OutcomeDisplaySection";
import { OUTCOME_REASONS, OUTCOME_STATUS_LABELS, EMAIL_TRIGGERING_OUTCOMES, PERMANENT_SUPPRESSION_REASONS, REENGAGEMENT_TASKS } from "@/config/outcomeReasons";
import { Building2, User, Briefcase, FileText, Activity, Pencil, X, Upload, Trash2, Download, MessageSquare, Skull, AlertTriangle, ClipboardList, Zap, CreditCard, Loader2, Wand2, RotateCcw, Eye, Check, ExternalLink, ArrowLeft, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";

import { sendOpportunityAssignmentEmail, sendStageChangeEmail } from "@/hooks/useEmailNotifications";
import { sendQualifiedDocsRequest } from "@/hooks/useQualifiedDocsRequest";
import ActivitiesTab from "./ActivitiesTab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { StagePath } from "./opportunity-detail/StagePath";
import { ApplicationProgress } from "./opportunity-detail/ApplicationProgress";
import { NotesSection } from "./opportunity-detail/NotesSection";
import { OverviewUnderwritingSummary } from "./opportunity-detail/OverviewUnderwritingSummary";
import { checkUnderwritingGate } from "@/lib/underwriting-gate";
import { checkDuplicateMerchant } from "@/lib/duplicate-check";
import { AIValidatePanel } from "./opportunity-detail/AIValidatePanel";
import { BeneficialOwners } from "./opportunity-detail/BeneficialOwners";
import { DocumentsTab } from "./DocumentsTab";
import GameSplash from "./GameSplash";
import CommentsTab from "./CommentsTab";
import { PortalActivationDialog } from "./opportunity-detail/PortalActivationDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EmailPreviewDialog } from "./EmailPreviewDialog";
import { buildDisqualifiedEmailTemplate, buildUwDeclinedEmailTemplate, isOutcomeBodyLocked } from "@/lib/emailTemplates";

import liveBadge from "@/assets/live-badge.webp";

interface Document {
  id: string;
  opportunity_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  document_type: string | null;
}

const DOCUMENT_TYPE_OPTIONS = [
  "Passport/Drivers License",
  "Bank Statement",
  "Transaction History",
  "Articles of Organisation",
  "Voided Check / Bank Confirmation Letter",
  "VAR/Tear Sheet",
  "EIN",
  "SSN",
  "Supporting Documents",
  "Unassigned",
];

const wizardBadgeClasses = (value: number) => {
  if (value >= 100) return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/40";
  if (value >= 10) return "bg-amber-500/10 text-amber-500 border border-amber-500/40";
  return "bg-destructive/10 text-destructive border border-destructive/40";
};

const wizardProgressColor = (value: number) => {
  if (value >= 100) return "bg-emerald-500";
  if (value >= 10) return "bg-amber-500";
  return "bg-destructive";
};

type WizardSectionKey = "business" | "legal" | "processing" | "documents";

const WIZARD_SECTIONS: { key: WizardSectionKey; label: string; fields: string[] }[] = [
  {
    key: "business",
    label: "Business profile",
    fields: [
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
      "dbaZip",
    ],
  },
  {
    key: "legal",
    label: "Legal info",
    fields: [
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
      "legalZip",
    ],
  },
  {
    key: "processing",
    label: "Processing",
    fields: [
      "monthlyVolume",
      "avgTicket",
      "highTicket",
      "swipedPct",
      "keyedPct",
      "motoPct",
      "ecomPct",
      "b2cPct",
      "b2bPct",
    ],
  },
  {
    key: "documents",
    label: "Documents",
    fields: ["documents"],
  },
];

const isWizardFieldComplete = (formState: Record<string, unknown>, field: string) => {
  const value = formState[field];

  if (field === "documents") {
    return Array.isArray(value) && value.length > 0;
  }

  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
};

const computeWizardSectionProgress = (formState: Record<string, unknown>) =>
  WIZARD_SECTIONS.map((section) => {
    const completed = section.fields.filter((field) => isWizardFieldComplete(formState, field)).length;
    const total = section.fields.length;
    const percent = Math.round((completed / total) * 100);

    return {
      ...section,
      completed,
      total,
      percent,
      done: completed === total,
    };
  });

interface OpportunityDetailModalProps {
  opportunity: Opportunity | null;
  onClose: () => void;
  onUpdate: (updates: Partial<Opportunity>) => void;
  onMarkAsDead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onConvertToGateway?: (opportunity: Opportunity) => Promise<void> | void;
  onMoveToProcessing?: (opportunity: Opportunity) => Promise<void> | void;
  hasGatewayOpportunity?: boolean;
}

// Removed 'activity' from sections — it's now always visible in right panel
const MODAL_SECTIONS = ['overview', 'underwriting', 'notes', 'documents', 'details'] as const;
type ModalSection = typeof MODAL_SECTIONS[number];

// Mobile-only: add a "context" section for activity/comments on mobile
const MOBILE_SECTIONS = [...MODAL_SECTIONS, 'context'] as const;
type MobileSection = typeof MOBILE_SECTIONS[number];

const OpportunityDetailModal = ({ opportunity, onClose, onUpdate, onMarkAsDead, onDelete, onConvertToGateway, onMoveToProcessing, hasGatewayOpportunity }: OpportunityDetailModalProps) => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeadDialog, setShowDeadDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRequestDeleteDialog, setShowRequestDeleteDialog] = useState(false);
  const [showDeathSplash, setShowDeathSplash] = useState(false);
  const [reactivateConfirm, setReactivateConfirm] = useState<{ assignee: string } | null>(null);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [activeSection, setActiveSection] = useState<ModalSection>('overview');
  const [mounted, setMounted] = useState(false);
  // Outcome email preview dialog — pops between outcome selection and send
  const [outcomeEmailPreview, setOutcomeEmailPreview] = useState<{
    open: boolean;
    subject: string;
    html: string;
    recipientEmail: string;
    recipientName: string;
    outcome: OutcomeStatus;
    reason: string;
    bodyLocked: boolean;
  } | null>(null);
  const isMobile = useIsMobile();

  // Slide-in animation
  useEffect(() => {
    if (opportunity) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [opportunity]);

  // Keyboard shortcuts for section navigation
  useEffect(() => {
    if (!opportunity) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      const currentIndex = MODAL_SECTIONS.indexOf(activeSection);
      
      if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        const newIndex = currentIndex > 0 ? currentIndex - 1 : MODAL_SECTIONS.length - 1;
        setActiveSection(MODAL_SECTIONS[newIndex]);
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        const newIndex = currentIndex < MODAL_SECTIONS.length - 1 ? currentIndex + 1 : 0;
        setActiveSection(MODAL_SECTIONS[newIndex]);
      }
      
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < MODAL_SECTIONS.length) {
          setActiveSection(MODAL_SECTIONS[idx]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [opportunity, activeSection, onClose]);
  
  // Account fields
  const [accountName, setAccountName] = useState("");
  const [website, setWebsite] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  
  // Contact fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  
  // Opportunity fields
  const [username, setUsername] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("");

  // Wizard fields
  const [wizardFields, setWizardFields] = useState<Record<string, string>>({});
  const setWizardField = useCallback((key: string, value: string) => {
    setWizardFields(prev => ({ ...prev, [key]: value }));
  }, []);

  // Combined form data for auto-save
  const formData = useMemo(() => ({
    accountName, website, address1, address2, city, state, zip, country,
    firstName, lastName, email, phone, fax,
    username, referralSource, timezone, language,
    wizardFields,
  }), [accountName, website, address1, address2, city, state, zip, country,
      firstName, lastName, email, phone, fax, username, referralSource, timezone, language, wizardFields]);

  const account = opportunity?.account;
  const contact = opportunity?.contact;
  const stageConfig = opportunity ? (STAGE_CONFIG[opportunity.stage] ?? STAGE_CONFIG.application_prep) : STAGE_CONFIG.discovery;
  const wizardState = opportunity?.wizard_state;
  const wizardFormState = useMemo(
    () => (wizardState?.form_state as Record<string, unknown> | undefined) ?? {},
    [wizardState?.form_state],
  );
  const wizardSectionProgress = useMemo(
    () => computeWizardSectionProgress(wizardFormState),
    [wizardFormState],
  );
  const assigneeOptions = useMemo(
    () =>
      Array.from(
        new Set([opportunity?.assigned_to, user?.email, "Onboarding", "Operations", "Support", "Unassigned"].filter(Boolean)),
      ) as string[],
    [opportunity?.assigned_to, user?.email],
  );

  const isGatewayCard = opportunity ? getServiceType(opportunity) === 'gateway_only' : false;

  const handleSectionSelect = useCallback((id: string) => {
    setActiveSection(id as ModalSection);
  }, []);

  // Helper: merge account/contact with wizard data, wizard takes precedence when available
  const resolvedAccount = useMemo(() => {
    if (!account) return undefined;
    const ws = wizardFormState;
    return {
      ...account,
      name: (ws.dba_name as string) || account.name,
      address1: (ws.dba_address_line1 as string) || account.address1,
      address2: account.address2,
      city: (ws.dba_city as string) || account.city,
      state: (ws.dba_state as string) || account.state,
      zip: (ws.dba_zip as string) || account.zip,
      website: (ws.website_url as string) || account.website,
    };
  }, [account, wizardFormState]);

  const resolvedContact = useMemo(() => {
    if (!contact) return undefined;
    const ws = wizardFormState;
    return {
      ...contact,
      first_name: (ws.dba_contact_first_name as string) || contact.first_name,
      last_name: (ws.dba_contact_last_name as string) || contact.last_name,
      email: (ws.dba_contact_email as string) || contact.email,
      phone: (ws.dba_contact_phone as string) || contact.phone,
    };
  }, [contact, wizardFormState]);

  const startEditing = () => {
    setAccountName(resolvedAccount?.name || "");
    setWebsite(resolvedAccount?.website || "");
    setAddress1(resolvedAccount?.address1 || "");
    setAddress2(resolvedAccount?.address2 || "");
    setCity(resolvedAccount?.city || "");
    setState(resolvedAccount?.state || "");
    setZip(resolvedAccount?.zip || "");
    setCountry(resolvedAccount?.country || "");
    
    setFirstName(resolvedContact?.first_name || "");
    setLastName(resolvedContact?.last_name || "");
    setEmail(resolvedContact?.email || "");
    setPhone(resolvedContact?.phone || "");
    setFax(resolvedContact?.fax || "");
    
    setUsername(opportunity!.username || "");
    setReferralSource(opportunity!.referral_source || "");
    setTimezone(opportunity!.timezone || "");
    setLanguage(opportunity!.language || "");

    const wf: Record<string, string> = {};
    const wizardKeys = [
      'dba_name', 'product_description', 'nature_of_business',
      'dba_contact_first_name', 'dba_contact_last_name', 'dba_contact_phone', 'dba_contact_email',
      'dba_address_line1', 'dba_city', 'dba_state', 'dba_zip',
      'legal_entity_name', 'federal_tax_id', 'ownership_type',
      'business_formation_date', 'state_incorporated',
      'legal_address_line1', 'legal_city', 'legal_state', 'legal_zip',
      'monthly_volume', 'average_transaction', 'high_ticket',
      'percent_swiped', 'percent_keyed', 'percent_moto', 'percent_ecommerce',
      'percent_b2c', 'percent_b2b', 'website_url', 'sic_mcc_code',
      'current_processor', 'username',
    ];
    for (const key of wizardKeys) {
      wf[key] = (wizardFormState[key] as string) || "";
    }
    setWizardFields(wf);
    
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleManualSave = async () => {
    cancelAutoSave();
    try {
      await handleAutoSave(formData);
      markSaved();
      toast.success("All changes saved");
      setIsEditing(false);
    } catch (err) {
      console.error("Manual save error:", err);
      toast.error("Failed to save changes");
    }
  };

  const handleConvertToGateway = async () => {
    if (!opportunity || !onConvertToGateway || hasGatewayOpportunity) return;
    setIsConverting(true);
    try {
      await onConvertToGateway(opportunity);
    } catch (error) {
      console.error('Error converting opportunity to gateway:', error);
      toast.error("Failed to create gateway card");
    }
    setIsConverting(false);
  };

  const handleMoveToProcessing = async () => {
    if (!opportunity || !onMoveToProcessing) return;
    setIsConverting(true);
    try {
      await onMoveToProcessing(opportunity);
      toast.success("Moved to Processing pipeline");
    } catch (error) {
      console.error('Error moving opportunity to processing:', error);
      toast.error("Failed to move to processing");
    }
    setIsConverting(false);
  };

  const [portalAccessLoading, setPortalAccessLoading] = useState(false);

  const handleViewPortalAccount = useCallback(async () => {
    if (!opportunity?.portal_merchant_id) return;
    setPortalAccessLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-portal-access", {
        body: { portal_merchant_id: opportunity.portal_merchant_id },
      });
      if (error) throw error;
      if (data?.access_url) {
        window.open(data.access_url, "_blank");
        toast.success("Portal access link opened");
      } else {
        toast.error(data?.error || "Failed to generate access link");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to access portal");
    } finally {
      setPortalAccessLoading(false);
    }
  }, [opportunity?.portal_merchant_id]);

  const handleDownloadDetails = useCallback(() => {
    if (!opportunity) return;

    const ws = wizardFormState;
    const serviceType = getServiceType(opportunity);
    const lines: string[] = [];
    const add = (label: string, value?: string | null) => {
      lines.push(`${label}: ${value || '—'}`);
    };
    const section = (title: string) => { lines.push(''); lines.push(`=== ${title} ===`); };

    lines.push(`Merchant Details Export — ${new Date().toLocaleDateString()}`);
    lines.push(`Service Type: ${serviceType === 'gateway_only' ? 'Gateway Only' : 'Processing'}`);
    lines.push(`Stage: ${(STAGE_CONFIG[opportunity.stage] ?? STAGE_CONFIG.application_prep).label}`);
    lines.push(`Assigned To: ${opportunity.assigned_to || '—'}`);

    section('Account');
    add('Company Name', resolvedAccount?.name);
    add('Website', resolvedAccount?.website);
    add('Address', resolvedAccount?.address1);
    add('Address 2', resolvedAccount?.address2);
    add('City', resolvedAccount?.city);
    add('State', resolvedAccount?.state);
    add('Zip', resolvedAccount?.zip);
    add('Country', resolvedAccount?.country);

    section('Contact');
    add('First Name', resolvedContact?.first_name);
    add('Last Name', resolvedContact?.last_name);
    add('Email', resolvedContact?.email);
    add('Phone', resolvedContact?.phone);
    add('Fax', resolvedContact?.fax);

    section('Opportunity');
    add('Username', opportunity.username);
    add('Referral Source', opportunity.referral_source);
    add('Timezone', opportunity.timezone);
    add('Language', opportunity.language);

    section('Business Profile');
    add('DBA Name', ws.dba_name as string);
    add('Products / Services', ws.product_description as string);
    add('Nature of Business', ws.nature_of_business as string);
    add('Contact First Name', ws.dba_contact_first_name as string);
    add('Contact Last Name', ws.dba_contact_last_name as string);
    add('Contact Phone', ws.dba_contact_phone as string);
    add('Contact Email', ws.dba_contact_email as string);
    add('DBA Address', ws.dba_address_line1 as string);
    add('DBA City', ws.dba_city as string);
    add('DBA State', ws.dba_state as string);
    add('DBA Zip', ws.dba_zip as string);

    if (serviceType !== 'gateway_only') {
      section('Legal Info');
      add('Legal Entity Name', ws.legal_entity_name as string);
      add('Federal Tax ID', ws.federal_tax_id as string);
      add('Ownership Type', ws.ownership_type as string);
      add('Formation Date', ws.business_formation_date as string);
      add('State Incorporated', ws.state_incorporated as string);
      add('Legal Address', ws.legal_address_line1 as string);
      add('Legal City', ws.legal_city as string);
      add('Legal State', ws.legal_state as string);
      add('Legal Zip', ws.legal_zip as string);

      section('Processing');
      add('Monthly Volume', ws.monthly_volume as string);
      add('Avg Transaction', ws.average_transaction as string);
      add('High Ticket', ws.high_ticket as string);
      add('% Swiped', ws.percent_swiped as string);
      add('% Keyed', ws.percent_keyed as string);
      add('% MOTO', ws.percent_moto as string);
      add('% eCommerce', ws.percent_ecommerce as string);
      add('% B2C', ws.percent_b2c as string);
      add('% B2B', ws.percent_b2b as string);
      add('Website URL', ws.website_url as string);
      add('SIC / MCC Code', ws.sic_mcc_code as string);
    }

    if (serviceType === 'gateway_only') {
      section('Gateway Details');
      add('Username', ws.username as string);
      add('Current Processor', ws.current_processor as string);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(account?.name || 'merchant').replace(/\s+/g, '_')}_details.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Details downloaded');
  }, [opportunity, resolvedAccount, resolvedContact, wizardFormState]);

  // Auto-save callback
  const handleAutoSave = useCallback(async (data: typeof formData) => {
    if (!opportunity) return;
    
    if (account) {
      const { error: accountError } = await supabase
        .from('accounts')
        .update({
          name: data.accountName,
          website: data.website || null,
          address1: data.address1 || null,
          address2: data.address2 || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null,
          country: data.country || null,
        })
        .eq('id', account.id);
      
      if (accountError) throw accountError;
    }

    if (contact) {
      const { error: contactError } = await supabase
        .from('contacts')
        .update({
          first_name: data.firstName || null,
          last_name: data.lastName || null,
          email: data.email || null,
          phone: data.phone || null,
          fax: data.fax || null,
        })
        .eq('id', contact.id);
      
      if (contactError) throw contactError;
    }

    const { error: oppError } = await supabase
      .from('opportunities')
      .update({
        username: data.username || null,
        referral_source: data.referralSource || null,
        timezone: data.timezone || null,
        language: data.language || null,
      })
      .eq('id', opportunity.id);
    
    if (oppError) throw oppError;

    const crossSyncFields: Record<string, string> = {
      ...(data.wizardFields || {}),
      dba_name: data.accountName || data.wizardFields?.dba_name || '',
      dba_address_line1: data.address1 || data.wizardFields?.dba_address_line1 || '',
      dba_city: data.city || data.wizardFields?.dba_city || '',
      dba_state: data.state || data.wizardFields?.dba_state || '',
      dba_zip: data.zip || data.wizardFields?.dba_zip || '',
      website_url: data.website || data.wizardFields?.website_url || '',
      dba_contact_first_name: data.firstName || data.wizardFields?.dba_contact_first_name || '',
      dba_contact_last_name: data.lastName || data.wizardFields?.dba_contact_last_name || '',
      dba_contact_email: data.email || data.wizardFields?.dba_contact_email || '',
      dba_contact_phone: data.phone || data.wizardFields?.dba_contact_phone || '',
    };

    const cleanedSync: Record<string, string> = {};
    for (const [k, v] of Object.entries(crossSyncFields)) {
      if (v) cleanedSync[k] = v;
    }

    if (Object.keys(cleanedSync).length > 0) {
      const { data: ws } = await supabase
        .from('onboarding_wizard_states')
        .select('id, form_state')
        .eq('opportunity_id', opportunity.id)
        .maybeSingle();

      if (ws) {
        const currentForm = (ws.form_state as Record<string, unknown>) ?? {};
        const mergedForm = { ...currentForm, ...cleanedSync };
        const { error: wizErr } = await supabase
          .from('onboarding_wizard_states')
          .update({ form_state: mergedForm as never, updated_at: new Date().toISOString() } as never)
          .eq('id', ws.id);
        if (wizErr) throw wizErr;
      } else {
        const { error: wizErr } = await supabase
          .from('onboarding_wizard_states')
          .insert({
            opportunity_id: opportunity.id,
            form_state: cleanedSync as never,
            progress: 0,
            step_index: 0,
          } as never);
        if (wizErr) throw wizErr;
      }
    }
    onUpdate({
      ...opportunity,
      username: data.username || undefined,
      referral_source: data.referralSource || undefined,
      timezone: data.timezone || undefined,
      language: data.language || undefined,
      account: account ? {
        ...account,
        name: data.accountName,
        website: data.website || undefined,
        address1: data.address1 || undefined,
        address2: data.address2 || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        zip: data.zip || undefined,
        country: data.country || undefined,
      } : undefined,
      contact: contact ? {
        ...contact,
        first_name: data.firstName || undefined,
        last_name: data.lastName || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
        fax: data.fax || undefined,
      } : undefined,
      wizard_state: opportunity.wizard_state ? {
        ...opportunity.wizard_state,
        form_state: { ...(opportunity.wizard_state.form_state as Record<string, unknown>), ...cleanedSync },
      } : undefined,
    });
  }, [opportunity, account, contact, onUpdate]);

  const { status: saveStatus, resetInitialData, cancel: cancelAutoSave, markSaved } = useAutoSave({
    data: formData,
    onSave: handleAutoSave,
    delay: 800,
    enabled: isEditing && !!opportunity,
  });

  useEffect(() => {
    if (isEditing) {
      resetInitialData();
    }
  }, [isEditing, resetInitialData]);

  const performOwnerUpdate = async (value: string, isReactivation: boolean) => {
    if (!opportunity) return;
    const newAssignee = value === "unassigned" ? null : value;

    const updatePayload: { assigned_to: string | null; status?: string } = {
      assigned_to: newAssignee,
    };

    if (isReactivation && newAssignee) {
      updatePayload.status = 'active';
    }

    const { error } = await supabase
      .from('opportunities')
      .update(updatePayload)
      .eq('id', opportunity.id);

    if (error) {
      toast.error("Failed to update owner");
      return;
    }

    await supabase.from('activities').insert({
      opportunity_id: opportunity.id,
      type: isReactivation ? 'reactivated' : 'assignment_change',
      description: isReactivation
        ? `Reactivated and assigned to ${newAssignee}`
        : `Reassigned to ${newAssignee || 'Unassigned'}`,
      user_id: user?.id,
      user_email: user?.email,
    });

    if (newAssignee) {
      sendOpportunityAssignmentEmail(
        newAssignee,
        account?.name || 'Unknown Account',
        contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : undefined,
        opportunity.stage
      ).catch(err => console.error("Failed to send assignment email:", err));
    }

    onUpdate({
      ...opportunity,
      assigned_to: newAssignee || undefined,
      ...(isReactivation ? { status: 'active' } : {}),
    });

    toast.success(
      isReactivation
        ? `Reactivated and assigned to ${newAssignee}`
        : `Assigned to ${newAssignee || 'Unassigned'}`
    );
  };

  const confirmReactivation = () => {
    if (!reactivateConfirm) return;
    performOwnerUpdate(reactivateConfirm.assignee, true);
    setReactivateConfirm(null);
  };

  const handleMarkAsDead = async () => {
    if (!opportunity) return;
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ status: 'dead', outcome_status: 'no_decision', outcome_reason: 'No response', outcome_closed_at: new Date().toISOString(), outcome_closed_by: user?.email })
        .eq('id', opportunity.id);

      if (!error) {
        await supabase
          .from('accounts')
          .update({ status: 'dead' })
          .eq('id', opportunity.account_id);
      }

      if (error) throw error;

      await supabase.from('activities').insert({
        opportunity_id: opportunity.id,
        type: 'status_change',
        description: 'Marked as Dead/Archived',
        user_id: user?.id,
        user_email: user?.email,
      });

      setShowDeadDialog(false);
      setShowDeathSplash(true);
      
      setTimeout(() => {
        setShowDeathSplash(false);
        onMarkAsDead?.(opportunity.id);
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error marking as dead:', error);
      toast.error("Failed to mark as dead");
      setShowDeadDialog(false);
    }
  };

  const handleDelete = async () => {
    if (!opportunity) return;
    try {
      const { error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', opportunity.id);

      if (error) throw error;

      toast.success("Opportunity deleted permanently");
      onDelete?.(opportunity.id);
      onClose();
    } catch (error) {
      console.error('Error deleting opportunity:', error);
      toast.error("Failed to delete opportunity");
    }
    setShowDeleteDialog(false);
  };

  const handleRequestDeletion = async () => {
    if (!opportunity) return;
    try {
      const { error } = await supabase.from('deletion_requests').insert({
        requester_id: user?.id,
        requester_email: user?.email || '',
        entity_type: 'opportunity',
        entity_id: opportunity.id,
        entity_name: account?.name || 'Unknown Opportunity',
      });

      if (error) throw error;

      toast.success("Deletion request sent to admin");
      onClose();
    } catch (error) {
      console.error('Error requesting deletion:', error);
      toast.error("Failed to send deletion request");
    }
  };

  // Stage change handler extracted for reuse
  const handleStageChange = async (newStage: OpportunityStage) => {
    if (!opportunity) return;
    const oldStage = opportunity.stage;
    
    const GATEWAY_BLOCKED_STAGES: OpportunityStage[] = ['underwriting_review', 'processor_approval'];
    if (isGatewayCard && GATEWAY_BLOCKED_STAGES.includes(newStage)) {
      toast.error("Gateway-only deals cannot enter Underwriting or Approved stages", { duration: 4000 });
      return;
    }
    
    if (newStage === 'underwriting_review') {
      const gate = await checkUnderwritingGate(opportunity.id, opportunity.service_type);
      if (!gate.allowed) {
        toast.error(gate.reason, { duration: 6000 });
        return;
      }
    }
    
    if (newStage !== 'discovery' && opportunity.stage === 'discovery') {
      const dupWarning = await checkDuplicateMerchant(opportunity.id);
      if (dupWarning) {
        toast.error(dupWarning, { duration: 8000 });
      }
    }
    
    const { error } = await supabase
      .from('opportunities')
      .update({ stage: newStage })
      .eq('id', opportunity.id);
    
    if (error) {
      toast.error("Failed to update stage");
      return;
    }
    
    await supabase.from('activities').insert({
      opportunity_id: opportunity.id,
      type: 'stage_change',
      description: `Moved from ${STAGE_CONFIG[oldStage].label} to ${STAGE_CONFIG[newStage].label}`,
      user_id: user?.id,
      user_email: user?.email,
    });
    
    if (opportunity.assigned_to) {
      sendStageChangeEmail(
        opportunity.assigned_to,
        account?.name || 'Unknown Account',
        oldStage,
        newStage,
        user?.email
      ).catch(err => console.error("Failed to send stage change email:", err));
    }
    
    if (newStage === 'qualified') {
      sendQualifiedDocsRequest(
        opportunity.id,
        opportunity.account_id,
        opportunity.contact_id
      ).catch(err => console.error("Failed to send qualified docs email:", err));
    }
    
    onUpdate({ ...opportunity, stage: newStage });
    toast.success(`Stage updated to ${STAGE_CONFIG[newStage].label}`);

    if (newStage === 'go_live_ready' && opportunity.portal_merchant_id) {
      setShowActivationDialog(true);
    }
  };

  // Outcome handler
  const handleOutcomeSelect = async (outcome: OutcomeStatus, reason: string, notes: string) => {
    if (!opportunity) return;

    // Step 0: Idempotency guard
    const { data: existing } = await supabase
      .from('opportunities')
      .select('outcome_status')
      .eq('id', opportunity.id)
      .single();
    if (existing?.outcome_status) {
      toast.error("This opportunity already has an outcome recorded. To change it, contact your administrator.");
      return;
    }

    // Step 1: Update opportunities table
    const newStatus = outcome === 'closed_won' ? 'won' : 'dead';
    const closedAt = new Date().toISOString();
    const { error } = await supabase
      .from('opportunities')
      .update({
        outcome_status: outcome,
        outcome_reason: reason,
        outcome_notes: notes || null,
        outcome_closed_at: closedAt,
        outcome_closed_by: user?.email,
        status: newStatus,
        ...(outcome === 'closed_won' ? { stage: 'closed_won' as OpportunityStage } : {}),
        updated_at: closedAt,
      })
      .eq('id', opportunity.id);

    if (error) {
      toast.error("Failed to record outcome. Please try again.");
      return;
    }

    // Step 2: Activity log
    const reasonLabel = OUTCOME_REASONS[outcome]?.find(r => r.value === reason)?.label ?? reason;
    const statusLabel = OUTCOME_STATUS_LABELS[outcome] ?? outcome;
    supabase.from('activities').insert({
      opportunity_id: opportunity.id,
      type: 'outcome_set',
      description: `Outcome set: ${statusLabel} — ${reasonLabel}`,
      user_email: user?.email,
      created_at: closedAt,
    }).then(({ error: actErr }) => {
      if (actErr) console.error('Activity log failed:', actErr);
    });

    // Step 3: Email preview (rep reviews & optionally edits before sending)
    if (EMAIL_TRIGGERING_OUTCOMES.includes(outcome) && opportunity.contact?.email) {
      const firstName = opportunity.contact?.first_name || '';
      const lastName = opportunity.contact?.last_name || '';
      const contactName = [firstName, lastName].filter(Boolean).join(' ') || 'Valued Applicant';
      const template = outcome === 'underwriting_declined'
        ? buildUwDeclinedEmailTemplate({ contactFirstName: firstName, contactEmail: opportunity.contact.email, outcomeReason: reason })
        : buildDisqualifiedEmailTemplate({ contactFirstName: firstName, contactEmail: opportunity.contact.email, outcomeReason: reason });
      setOutcomeEmailPreview({
        open: true,
        subject: template.subject,
        html: template.html,
        recipientEmail: opportunity.contact.email,
        recipientName: contactName,
        outcome,
        reason,
        bodyLocked: isOutcomeBodyLocked(outcome),
      });
    }

    // Step 4: Re-engagement task (skip for permanently suppressed reasons)
    if (!PERMANENT_SUPPRESSION_REASONS.includes(reason)) {
      const taskConfig = REENGAGEMENT_TASKS[reason];
      if (taskConfig) {
        const dueAt = new Date(Date.now() + taskConfig.days * 86400000).toISOString();
        supabase.from('activities').insert({
          opportunity_id: opportunity.id,
          type: 'task_scheduled',
          description: taskConfig.label,
          due_at: dueAt,
          assigned_to: opportunity.assigned_to || user?.email,
          user_email: 'system',
          created_at: new Date().toISOString(),
        }).then(({ error: taskErr }) => {
          if (taskErr) console.error('Re-engagement task creation failed:', taskErr);
        });
      }
    }

    // Step 5: Update local state and close
    onUpdate({
      ...opportunity,
      outcome_status: outcome,
      outcome_reason: reason,
      outcome_notes: notes || null,
      outcome_closed_at: closedAt,
      outcome_closed_by: user?.email,
      status: newStatus as 'active' | 'dead',
      ...(outcome === 'closed_won' ? { stage: 'closed_won' as OpportunityStage } : {}),
    });

    const toastMsg = EMAIL_TRIGGERING_OUTCOMES.includes(outcome)
      ? "Outcome recorded. Review the notification email before it goes out."
      : "Outcome recorded.";
    toast.success(toastMsg);

    // Close on a slight delay unless the email-preview dialog is about to open
    if (!EMAIL_TRIGGERING_OUTCOMES.includes(outcome)) {
      setTimeout(() => onClose(), 1500);
    }
  };

  // Send the outcome notification email from the preview dialog
  const handleSendOutcomeEmail = async ({ subject, bodyHtml }: { subject: string; bodyHtml: string }) => {
    if (!outcomeEmailPreview || !opportunity) return;
    const { outcome, reason } = outcomeEmailPreview;
    const { error: emailErr } = await supabase.functions.invoke('send-outcome-email', {
      body: {
        opportunity_id: opportunity.id,
        outcome_status: outcome,
        outcome_reason: reason,
        custom_subject: subject,
        custom_html: bodyHtml,
      },
    });
    if (emailErr) {
      toast.error(`Email failed to send: ${emailErr.message}. Manual follow-up required.`);
      await supabase.from('activities').insert({
        opportunity_id: opportunity.id,
        type: 'email_failed',
        description: `COMPLIANCE EMAIL FAILED — Outcome: ${outcome} — ${emailErr.message}. Manual follow-up required.`,
        user_email: 'system',
        created_at: new Date().toISOString(),
      });
      return;
    }
    toast.success("Email sent.");
    if (opportunity.contact?.email) {
      const contactName = [opportunity.contact?.first_name, opportunity.contact?.last_name].filter(Boolean).join(' ') || 'Valued Applicant';
      await supabase.from('client_interactions').insert({
        account_id: opportunity.account_id,
        subject: `Compliance notification sent — ${opportunity.account?.name || ''}`,
        interaction_type: 'email',
        channel: 'email',
        contact_name: contactName,
        contact_email: opportunity.contact?.email || '',
        notes: `Compliance notification email sent to ${opportunity.contact?.email}.`,
        status: 'closed',
        outcome: 'sent',
        created_by: user?.id,
        created_by_email: user?.email,
      });
    }
    setTimeout(() => onClose(), 800);
  };

  // Rep cancelled the preview — log it so we have an audit trail of non-sent compliance emails
  const handleCancelOutcomeEmail = async (nextOpen: boolean) => {
    if (nextOpen) return; // dialog is just opening
    if (outcomeEmailPreview && opportunity) {
      await supabase.from('activities').insert({
        opportunity_id: opportunity.id,
        type: 'email_cancelled',
        description: `Outcome notification email was cancelled by rep — Outcome: ${outcomeEmailPreview.outcome}. No email sent.`,
        user_email: user?.email || 'system',
        created_at: new Date().toISOString(),
      });
    }
    setOutcomeEmailPreview(null);
  };

  if (!opportunity) return null;

  // Mobile section pill nav items
  const mobileSections = [
    { id: 'overview', label: 'Overview' },
    ...(!isGatewayCard ? [{ id: 'underwriting', label: 'UW Review' }] : []),
    { id: 'notes', label: 'Notes' },
    { id: 'documents', label: 'Docs' },
    { id: 'details', label: 'Details' },
    { id: 'context', label: 'Activity' },
  ];

  return (
    <>
      {/* Full-screen overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background flex flex-col transition-transform duration-200 ease-out",
          mounted ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* ═══════ STICKY HEADER ═══════ */}
        <div className="flex-shrink-0 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2.5 gap-3">
            {/* Left: Back + Company Info */}
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold truncate">{account?.name || 'Unknown Business'}</h1>
                  <span className={cn(
                    "flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                    isGatewayCard
                      ? "bg-teal/10 text-teal" 
                      : "bg-primary/10 text-primary"
                  )}>
                    {isGatewayCard ? <><Zap className="h-2.5 w-2.5" /> Gateway</> : <><CreditCard className="h-2.5 w-2.5" /> Processing</>}
                  </span>
                  {opportunity.status === 'dead' && (
                    <span className="text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded shrink-0">Archived</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Stage Dropdown */}
                  <Select value={opportunity.stage} onValueChange={(v) => handleStageChange(v as OpportunityStage)}>
                    <SelectTrigger className="h-5 w-auto border-0 bg-transparent hover:bg-muted/50 px-1 text-xs gap-1 text-foreground">
                      <div className={`w-2 h-2 rounded-full ${stageConfig.colorClass}`} />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      {(isGatewayCard ? GATEWAY_ONLY_PIPELINE_STAGES : PROCESSING_PIPELINE_STAGES).map((stage) => (
                        <SelectItem key={stage} value={stage} className="text-xs">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${STAGE_CONFIG[stage].colorClass}`} />
                            {STAGE_CONFIG[stage].label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {opportunity.portal_merchant_id && opportunity.stage === 'go_live_ready' && opportunity.status !== 'dead' && (
                    <button
                      onClick={() => setShowActivationDialog(true)}
                      className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                    >
                      <Zap className="h-2.5 w-2.5" /> Pending Activation
                    </button>
                  )}

                  <span className="text-muted-foreground text-xs">•</span>

                  {/* Owner Dropdown */}
                  <Select
                    value={opportunity.assigned_to || "unassigned"}
                    onValueChange={(value) => {
                      const newAssignee = value === "unassigned" ? null : value;
                      if (opportunity.status === 'dead' && newAssignee) {
                        setReactivateConfirm({ assignee: value });
                        return;
                      }
                      performOwnerUpdate(value, false);
                    }}
                  >
                    <SelectTrigger className="h-5 w-auto border-0 bg-transparent hover:bg-muted/50 px-1 text-[11px] font-medium">
                      <User className="h-3 w-3 mr-0.5" />
                      <SelectValue placeholder="Assign owner" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                      {TEAM_MEMBERS.map((member) => (
                        <SelectItem key={member} value={member} className="text-xs">{member}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {isEditing ? (
                <>
                  <AutoSaveIndicator status={saveStatus} />
                  <Button variant="default" size="sm" onClick={handleManualSave}>
                    <Check className="h-4 w-4 mr-1" /> Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                </>
              ) : (
                <>
                  {!isMobile && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={startEditing}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>

                      <OutcomeSelector
                        currentOutcome={opportunity.outcome_status as OutcomeStatus | null}
                        currentReason={opportunity.outcome_reason}
                        disabled={!!opportunity.outcome_status}
                        onSelect={handleOutcomeSelect}
                      />

                      {!opportunity.outcome_status && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                isGatewayCard
                                  ? "text-indigo-500 border-indigo-500 hover:bg-indigo-500/10"
                                  : "text-teal-500 border-teal-500 hover:bg-teal-500/10"
                              )}
                              onClick={() => setShowMoveDialog(true)}
                              disabled={isConverting}
                            >
                              {isGatewayCard ? <CreditCard className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isGatewayCard ? 'Switch to Processing' : 'Switch to Gateway'}</TooltipContent>
                        </Tooltip>
                      )}

                      {isAdmin && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setShowDeleteDialog(true)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete Permanently</TooltipContent>
                        </Tooltip>
                      )}
                      {!isAdmin && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 text-destructive border-destructive hover:bg-destructive/10" onClick={() => setShowRequestDeleteDialog(true)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Request Deletion</TooltipContent>
                        </Tooltip>
                      )}

                      {isAdmin && opportunity.portal_merchant_id && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleViewPortalAccount} disabled={portalAccessLoading}>
                                {portalAccessLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Portal Account</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 dark:text-emerald-400" onClick={() => setShowActivationDialog(true)}>
                                <Zap className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Activate on Portal</TooltipContent>
                          </Tooltip>
                        </>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownloadDetails}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download Details</TooltipContent>
                      </Tooltip>
                    </>
                  )}

                  {/* Mobile: overflow menu */}
                  {isMobile && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="z-[60]">
                        <DropdownMenuItem onClick={startEditing}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadDetails}>
                          <Download className="h-4 w-4 mr-2" /> Download
                        </DropdownMenuItem>
                        {!opportunity.outcome_status && (
                          <DropdownMenuItem onClick={() => setShowMoveDialog(true)}>
                            {isGatewayCard ? <CreditCard className="h-4 w-4 mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                            {isGatewayCard ? 'Switch to Processing' : 'Switch to Gateway'}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {isAdmin ? (
                          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setShowRequestDeleteDialog(true)} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Request Deletion
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Live badge overlay */}
          {opportunity.outcome_status === 'closed_won' && (
            <div className="relative flex justify-center -mt-8 pointer-events-none z-10" style={{ marginBottom: '-2rem' }}>
              <img 
                src={liveBadge} 
                alt="Live Account" 
                className="h-28 w-auto drop-shadow-2xl animate-ribbon-drop" 
                style={{ filter: 'drop-shadow(0 8px 16px rgba(180, 130, 20, 0.35))' }}
              />
            </div>
          )}

          {/* Stage Path — always visible */}
          <div className="px-4 pb-2">
            {opportunity.outcome_status === 'closed_won' ? (
              <div className="rounded-lg bg-gradient-to-b from-emerald-50/60 via-emerald-100/30 to-transparent dark:from-emerald-500/10 dark:via-emerald-500/5 dark:to-transparent border border-emerald-200/40 dark:border-emerald-500/20 py-3 px-4">
                <h3 className="text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase text-sm text-center">
                  Closed Won — Live &amp; Billing
                </h3>
              </div>
            ) : (
              <StagePath opportunity={opportunity} />
            )}
          </div>

          {/* Mobile: horizontal section pills */}
          {isMobile && (
            <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-hide">
              {mobileSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id as ModalSection)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    activeSection === s.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ═══════ THREE-COLUMN BODY ═══════ */}
        <div className="flex-1 min-h-0 flex">
          {/* LEFT: Detail Sidebar (desktop only) */}
          {!isMobile && (
            <DetailSidebar
              opportunity={opportunity}
              resolvedAccount={resolvedAccount}
              resolvedContact={resolvedContact}
              wizardSectionProgress={wizardSectionProgress}
              activeSection={activeSection}
              onSelect={handleSectionSelect}
              isGatewayCard={isGatewayCard}
            />
          )}

          {/* CENTER: Primary Panel */}
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 md:px-6 py-4">
            {/* Mobile context tab: show activity/comments/status */}
            {isMobile && activeSection === ('context' as any) && (
              <DetailRightPanel
                opportunityId={opportunity.id}
                opportunity={opportunity}
                wizardProgress={wizardState?.progress ?? 0}
                onUpdate={onUpdate}
              />
            )}

            {activeSection === 'overview' && (
              <div className="space-y-6">
                {opportunity.outcome_status && (
                  <OutcomeDisplaySection opportunity={opportunity} />
                )}
                <ApplicationProgress 
                  opportunity={opportunity} 
                  wizardState={wizardState ? {
                    progress: wizardState.progress,
                    step_index: wizardState.step_index,
                    form_state: wizardState.form_state as Record<string, unknown>,
                    updated_at: wizardState.updated_at
                  } : null}
                />
                {!isGatewayCard && <BeneficialOwners opportunityId={opportunity.id} />}
                {!isGatewayCard && <OverviewUnderwritingSummary opportunityId={opportunity.id} onNavigate={() => setActiveSection('underwriting')} />}
              </div>
            )}

            {activeSection === 'underwriting' && !isGatewayCard && (
              <AIValidatePanel opportunityId={opportunity.id} />
            )}

            {activeSection === 'notes' && (
              <NotesSection opportunityId={opportunity.id} />
            )}

            {activeSection === 'documents' && (
              <DocumentsTab opportunityId={opportunity.id} serviceType={opportunity.service_type} />
            )}

            {activeSection === 'details' && (
              <div className="space-y-6">
                {/* Account */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Account
                  </h3>
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <EditField label="Company Name" value={accountName} onChange={setAccountName} />
                      <EditField label="Website" value={website} onChange={setWebsite} />
                      <EditField label="Address" value={address1} onChange={setAddress1} />
                      <EditField label="Address 2" value={address2} onChange={setAddress2} />
                      <EditField label="City" value={city} onChange={setCity} />
                      <EditField label="State" value={state} onChange={setState} />
                      <EditField label="Zip" value={zip} onChange={setZip} />
                      <EditField label="Country" value={country} onChange={setCountry} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="Company Name" value={resolvedAccount?.name} />
                      <InfoItem label="Website" value={resolvedAccount?.website} />
                      <InfoItem label="Address" value={resolvedAccount?.address1} />
                      <InfoItem label="Address 2" value={resolvedAccount?.address2} />
                      <InfoItem label="City" value={resolvedAccount?.city} />
                      <InfoItem label="State" value={resolvedAccount?.state} />
                      <InfoItem label="Zip" value={resolvedAccount?.zip} />
                      <InfoItem label="Country" value={resolvedAccount?.country} />
                    </div>
                  )}
                </div>

                {/* Contact */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <User className="h-4 w-4" /> Contact
                  </h3>
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <EditField label="First Name" value={firstName} onChange={setFirstName} />
                      <EditField label="Last Name" value={lastName} onChange={setLastName} />
                      <EditField label="Email" value={email} onChange={setEmail} type="email" />
                      <EditField label="Phone" value={phone} onChange={setPhone} type="tel" />
                      <EditField label="Fax" value={fax} onChange={setFax} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="First Name" value={resolvedContact?.first_name} />
                      <InfoItem label="Last Name" value={resolvedContact?.last_name} />
                      <InfoItem label="Email" value={resolvedContact?.email} />
                      <InfoItem label="Phone" value={resolvedContact?.phone} />
                      <InfoItem label="Fax" value={resolvedContact?.fax} />
                    </div>
                  )}
                </div>

                {/* Opportunity */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Briefcase className="h-4 w-4" /> Opportunity
                  </h3>
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="Stage" value={stageConfig.label} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Service Type</Label>
                        <Select
                          value={opportunity.service_type || 'processing'}
                          onValueChange={async (value) => {
                            const newType = value as 'processing' | 'gateway_only';
                            const GATEWAY_BLOCKED_STAGES: OpportunityStage[] = ['underwriting_review', 'processor_approval'];
                            if (newType === 'gateway_only' && GATEWAY_BLOCKED_STAGES.includes(opportunity.stage)) {
                              toast.error("Move out of Underwriting/Approved before switching to Gateway");
                              return;
                            }
                            const { error } = await supabase
                              .from('opportunities')
                              .update({ service_type: newType })
                              .eq('id', opportunity.id);
                            if (error) { toast.error("Failed to update service type"); return; }
                            await supabase.from('activities').insert({
                              opportunity_id: opportunity.id,
                              type: 'service_type_change',
                              description: `Service type changed to ${newType === 'gateway_only' ? 'Gateway Only' : 'Processing'}`,
                              user_id: user?.id,
                              user_email: user?.email,
                            });
                            onUpdate({ ...opportunity, service_type: newType });
                            toast.success(`Switched to ${newType === 'gateway_only' ? 'Gateway Only' : 'Processing'}`);
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-[60]">
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="gateway_only">Gateway Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <EditField label="Username" value={username} onChange={setUsername} />
                      <EditField label="Referral Source" value={referralSource} onChange={setReferralSource} />
                      <EditField label="Timezone" value={timezone} onChange={setTimezone} />
                      <EditField label="Language" value={language} onChange={setLanguage} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="Stage" value={stageConfig.label} />
                      <InfoItem label="Service Type" value={isGatewayCard ? 'Gateway Only' : 'Processing'} />
                      <InfoItem label="Username" value={opportunity.username} />
                      <InfoItem label="Referral Source" value={opportunity.referral_source} />
                      <InfoItem label="Timezone" value={opportunity.timezone} />
                      <InfoItem label="Language" value={opportunity.language} />
                    </div>
                  )}
                </div>

                {/* Wizard: Business Profile */}
                <div className="border-t border-border pt-4 space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Business Profile <span className="text-xs font-normal">(Wizard)</span>
                  </h3>
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <EditField label="DBA Name" value={wizardFields.dba_name || ""} onChange={v => setWizardField("dba_name", v)} />
                      <EditField label="Products / Services" value={wizardFields.product_description || ""} onChange={v => setWizardField("product_description", v)} />
                      <EditField label="Nature of Business" value={wizardFields.nature_of_business || ""} onChange={v => setWizardField("nature_of_business", v)} />
                      <EditField label="Contact First Name" value={wizardFields.dba_contact_first_name || ""} onChange={v => setWizardField("dba_contact_first_name", v)} />
                      <EditField label="Contact Last Name" value={wizardFields.dba_contact_last_name || ""} onChange={v => setWizardField("dba_contact_last_name", v)} />
                      <EditField label="Contact Phone" value={wizardFields.dba_contact_phone || ""} onChange={v => setWizardField("dba_contact_phone", v)} type="tel" />
                      <EditField label="Contact Email" value={wizardFields.dba_contact_email || ""} onChange={v => setWizardField("dba_contact_email", v)} type="email" />
                      <EditField label="DBA Address" value={wizardFields.dba_address_line1 || ""} onChange={v => setWizardField("dba_address_line1", v)} />
                      <EditField label="DBA City" value={wizardFields.dba_city || ""} onChange={v => setWizardField("dba_city", v)} />
                      <EditField label="DBA State" value={wizardFields.dba_state || ""} onChange={v => setWizardField("dba_state", v)} />
                      <EditField label="DBA Zip" value={wizardFields.dba_zip || ""} onChange={v => setWizardField("dba_zip", v)} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="DBA Name" value={wizardFormState.dba_name as string} />
                      <InfoItem label="Products / Services" value={wizardFormState.product_description as string} />
                      <InfoItem label="Nature of Business" value={wizardFormState.nature_of_business as string} />
                      <InfoItem label="Contact First Name" value={wizardFormState.dba_contact_first_name as string} />
                      <InfoItem label="Contact Last Name" value={wizardFormState.dba_contact_last_name as string} />
                      <InfoItem label="Contact Phone" value={wizardFormState.dba_contact_phone as string} />
                      <InfoItem label="Contact Email" value={wizardFormState.dba_contact_email as string} />
                      <InfoItem label="DBA Address" value={wizardFormState.dba_address_line1 as string} />
                      <InfoItem label="DBA City" value={wizardFormState.dba_city as string} />
                      <InfoItem label="DBA State" value={wizardFormState.dba_state as string} />
                      <InfoItem label="DBA Zip" value={wizardFormState.dba_zip as string} />
                    </div>
                  )}
                </div>

                {/* Wizard: Legal Info - Processing only */}
                {!isGatewayCard && (
                <div className="border-t border-border pt-4 space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Legal Info <span className="text-xs font-normal">(Wizard)</span>
                  </h3>
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <EditField label="Legal Entity Name" value={wizardFields.legal_entity_name || ""} onChange={v => setWizardField("legal_entity_name", v)} />
                      <EditField label="Federal Tax ID" value={wizardFields.federal_tax_id || ""} onChange={v => setWizardField("federal_tax_id", v)} />
                      <EditField label="Ownership Type" value={wizardFields.ownership_type || ""} onChange={v => setWizardField("ownership_type", v)} />
                      <EditField label="Formation Date" value={wizardFields.business_formation_date || ""} onChange={v => setWizardField("business_formation_date", v)} />
                      <EditField label="State Incorporated" value={wizardFields.state_incorporated || ""} onChange={v => setWizardField("state_incorporated", v)} />
                      <EditField label="Legal Address" value={wizardFields.legal_address_line1 || ""} onChange={v => setWizardField("legal_address_line1", v)} />
                      <EditField label="Legal City" value={wizardFields.legal_city || ""} onChange={v => setWizardField("legal_city", v)} />
                      <EditField label="Legal State" value={wizardFields.legal_state || ""} onChange={v => setWizardField("legal_state", v)} />
                      <EditField label="Legal Zip" value={wizardFields.legal_zip || ""} onChange={v => setWizardField("legal_zip", v)} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="Legal Entity Name" value={wizardFormState.legal_entity_name as string} />
                      <InfoItem label="Federal Tax ID" value={wizardFormState.federal_tax_id as string} />
                      <InfoItem label="Ownership Type" value={wizardFormState.ownership_type as string} />
                      <InfoItem label="Formation Date" value={wizardFormState.business_formation_date as string} />
                      <InfoItem label="State Incorporated" value={wizardFormState.state_incorporated as string} />
                      <InfoItem label="Legal Address" value={wizardFormState.legal_address_line1 as string} />
                      <InfoItem label="Legal City" value={wizardFormState.legal_city as string} />
                      <InfoItem label="Legal State" value={wizardFormState.legal_state as string} />
                      <InfoItem label="Legal Zip" value={wizardFormState.legal_zip as string} />
                    </div>
                  )}
                </div>
                )}

                {/* Wizard: Processing - Processing only */}
                {!isGatewayCard && (
                <div className="border-t border-border pt-4 space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Processing <span className="text-xs font-normal">(Wizard)</span>
                  </h3>
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <EditField label="Monthly Volume" value={wizardFields.monthly_volume || ""} onChange={v => setWizardField("monthly_volume", v)} />
                      <EditField label="Avg Transaction" value={wizardFields.average_transaction || ""} onChange={v => setWizardField("average_transaction", v)} />
                      <EditField label="High Ticket" value={wizardFields.high_ticket || ""} onChange={v => setWizardField("high_ticket", v)} />
                      <EditField label="% Swiped" value={wizardFields.percent_swiped || ""} onChange={v => setWizardField("percent_swiped", v)} />
                      <EditField label="% Keyed" value={wizardFields.percent_keyed || ""} onChange={v => setWizardField("percent_keyed", v)} />
                      <EditField label="% MOTO" value={wizardFields.percent_moto || ""} onChange={v => setWizardField("percent_moto", v)} />
                      <EditField label="% eCommerce" value={wizardFields.percent_ecommerce || ""} onChange={v => setWizardField("percent_ecommerce", v)} />
                      <EditField label="% B2C" value={wizardFields.percent_b2c || ""} onChange={v => setWizardField("percent_b2c", v)} />
                      <EditField label="% B2B" value={wizardFields.percent_b2b || ""} onChange={v => setWizardField("percent_b2b", v)} />
                      <EditField label="Website" value={wizardFields.website_url || ""} onChange={v => setWizardField("website_url", v)} />
                      <EditField label="SIC / MCC Code" value={wizardFields.sic_mcc_code || ""} onChange={v => setWizardField("sic_mcc_code", v)} />
                      <EditField label="Current Processor" value={wizardFields.current_processor || ""} onChange={v => setWizardField("current_processor", v)} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoItem label="Monthly Volume" value={wizardFormState.monthly_volume as string} />
                      <InfoItem label="Avg Transaction" value={wizardFormState.average_transaction as string} />
                      <InfoItem label="High Ticket" value={wizardFormState.high_ticket as string} />
                      <InfoItem label="% Swiped" value={wizardFormState.percent_swiped as string} />
                      <InfoItem label="% Keyed" value={wizardFormState.percent_keyed as string} />
                      <InfoItem label="% MOTO" value={wizardFormState.percent_moto as string} />
                      <InfoItem label="% eCommerce" value={wizardFormState.percent_ecommerce as string} />
                      <InfoItem label="% B2C" value={wizardFormState.percent_b2c as string} />
                      <InfoItem label="% B2B" value={wizardFormState.percent_b2b as string} />
                      <InfoItem label="Website" value={wizardFormState.website_url as string} />
                      <InfoItem label="SIC / MCC Code" value={wizardFormState.sic_mcc_code as string} />
                      <InfoItem label="Current Processor" value={wizardFormState.current_processor as string} />
                    </div>
                  )}
                </div>
                )}

                {/* Wizard: Gateway Only fields */}
                {isGatewayCard && (
                  <div className="border-t border-border pt-4 space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Gateway Details <span className="text-xs font-normal">(Wizard)</span>
                    </h3>
                    {isEditing ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <EditField label="Username" value={wizardFields.username || ""} onChange={v => setWizardField("username", v)} />
                        <EditField label="Current Processor" value={wizardFields.current_processor || ""} onChange={v => setWizardField("current_processor", v)} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <InfoItem label="Username" value={wizardFormState.username as string} />
                        <InfoItem label="Current Processor" value={wizardFormState.current_processor as string} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Context Panel (desktop only) */}
          {!isMobile && (
            <DetailRightPanel
              opportunityId={opportunity.id}
              opportunity={opportunity}
              wizardProgress={wizardState?.progress ?? 0}
              onUpdate={onUpdate}
            />
          )}
        </div>
      </div>

      {/* ═══════ ALL ALERT DIALOGS (outside overlay for correct z-index) ═══════ */}

      {/* Reactivation Confirmation */}
      <AlertDialog open={!!reactivateConfirm} onOpenChange={(open) => !open && setReactivateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Reactivate Archived Opportunity?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Assigning will reactivate this opportunity and return it to the pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReactivation}>
              Reactivate &amp; Assign to {reactivateConfirm?.assignee}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark as Dead Confirmation */}
      <AlertDialog open={showDeadDialog} onOpenChange={setShowDeadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Skull className="h-5 w-5 text-[hsl(var(--toxic))]" />
              Mark as Dead?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the opportunity and remove it from the active pipeline view.
              You can still view it in the All Accounts and Contacts sections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkAsDead} className="bg-[hsl(var(--toxic))] hover:bg-[hsl(120,100%,30%)]">
              Mark as Dead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* YOU DIED! Splash Screen */}
      <GameSplash
        type="death"
        show={showDeathSplash}
        onComplete={() => setShowDeathSplash(false)}
      />

      {/* Delete Confirmation (Admin Only) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Permanently Delete?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the opportunity
              and all associated data including documents, comments, and activities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pipeline Switch Confirmation */}
      <AlertDialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {isGatewayCard ? (
                <><CreditCard className="h-5 w-5 text-indigo-500" /> Switch to Processing?</>
              ) : (
                <><Zap className="h-5 w-5 text-teal-500" /> Switch to Gateway?</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isGatewayCard ? (
                <>This will convert <strong>{account?.name}</strong> from Gateway Only to Processing pipeline.</>
              ) : (
                <>
                  This will convert <strong>{account?.name}</strong> from Processing to Gateway Only pipeline.
                  {!['discovery', 'qualified', 'gateway_submitted', 'integration_setup', 'testing', 'go_live_ready'].includes(opportunity.stage) && (
                    <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                      ⚠ The current stage is not available on the Gateway pipeline — this deal will be reset to Discovery.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!opportunity) return;
              setIsConverting(true);
              const currentType = getServiceType(opportunity);
              const newType = currentType === 'gateway_only' ? 'processing' : 'gateway_only';
              const GATEWAY_STAGES = ['discovery', 'qualified', 'gateway_submitted', 'integration_setup', 'testing', 'go_live_ready'];
              const stageReset = (newType === 'gateway_only' && !GATEWAY_STAGES.includes(opportunity.stage)) ? 'discovery' : undefined;

              const updatePayload: Record<string, unknown> = { service_type: newType };
              if (stageReset) updatePayload.stage = stageReset;

              const { error } = await supabase
                .from('opportunities')
                .update(updatePayload)
                .eq('id', opportunity.id);

              if (error) {
                toast.error("Failed to switch pipeline");
                setIsConverting(false);
                setShowMoveDialog(false);
                return;
              }

              await supabase.from('activities').insert({
                opportunity_id: opportunity.id,
                type: 'pipeline_change',
                description: `Switched from ${currentType === 'gateway_only' ? 'Gateway' : 'Processing'} to ${newType === 'gateway_only' ? 'Gateway' : 'Processing'}${stageReset ? ' (stage reset to Discovery)' : ''}`,
                user_id: user?.id,
                user_email: user?.email,
              });

              onUpdate({
                ...opportunity,
                service_type: newType as any,
                ...(stageReset ? { stage: stageReset as any } : {}),
              });

              toast.success(`Switched to ${newType === 'gateway_only' ? 'Gateway' : 'Processing'} pipeline`);
              setIsConverting(false);
              setShowMoveDialog(false);
            }}>
              {isGatewayCard ? 'Switch to Processing' : 'Switch to Gateway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Request Deletion Confirmation */}
      <AlertDialog open={showRequestDeleteDialog} onOpenChange={setShowRequestDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Request Deletion?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will send a deletion request to the admin for review. 
              The admin will be notified and can approve or reject the request.
              You will be notified once a decision is made.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleRequestDeletion(); setShowRequestDeleteDialog(false); }} className="bg-destructive hover:bg-destructive/90">
              Request Deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Portal Activation Dialog */}
      {opportunity?.portal_merchant_id && (
        <PortalActivationDialog
          open={showActivationDialog}
          onOpenChange={setShowActivationDialog}
          opportunityId={opportunity.id}
          portalMerchantId={opportunity.portal_merchant_id}
          accountName={resolvedAccount?.name}
          onSuccess={() => {
            onUpdate({});
          }}
        />
      )}

      {/* Outcome Email Preview — rep reviews/edits before send */}
      {outcomeEmailPreview && (
        <EmailPreviewDialog
          open={outcomeEmailPreview.open}
          onOpenChange={handleCancelOutcomeEmail}
          subject={outcomeEmailPreview.subject}
          bodyHtml={outcomeEmailPreview.html}
          recipientEmail={outcomeEmailPreview.recipientEmail}
          recipientName={outcomeEmailPreview.recipientName}
          bodyLocked={outcomeEmailPreview.bodyLocked}
          lockedReason="This email is an Adverse Action Notice with federally-required disclosures (ECOA). The body cannot be edited — only the subject line."
          onSend={handleSendOutcomeEmail}
        />
      )}
    </>
  );
};

const InfoItem = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
    <p className="text-sm mt-0.5">{value || '-'}</p>
  </div>
);

const EditField = ({ 
  label, 
  value, 
  onChange, 
  type = "text" 
}: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void;
  type?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
    <Input 
      type={type}
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="h-9"
    />
  </div>
);

export default OpportunityDetailModal;
