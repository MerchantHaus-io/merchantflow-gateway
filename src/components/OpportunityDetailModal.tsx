import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { IconRail, IconRailItem } from "./opportunity-detail/IconRail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Opportunity, STAGE_CONFIG, Account, Contact, getServiceType, EMAIL_TO_USER, TEAM_MEMBERS, OpportunityStage, PROCESSING_PIPELINE_STAGES, GATEWAY_ONLY_PIPELINE_STAGES } from "@/types/opportunity";
import { Building2, User, Briefcase, FileText, Activity, Pencil, X, Upload, Trash2, Download, MessageSquare, Skull, AlertTriangle, ClipboardList, ListChecks, Zap, CreditCard, Maximize2, Minimize2, Loader2, Wand2, RotateCcw, Eye, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import { sendOpportunityAssignmentEmail, sendStageChangeEmail } from "@/hooks/useEmailNotifications";
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
import { StatusBlockerPanel } from "./opportunity-detail/StatusBlockerPanel";
import { StagePath } from "./opportunity-detail/StagePath";
import { ApplicationProgress } from "./opportunity-detail/ApplicationProgress";
import { OpportunityTasks } from "./opportunity-detail/OpportunityTasks";
import { NotesSection } from "./opportunity-detail/NotesSection";
import GameSplash from "./GameSplash";
import CommentsTab from "./CommentsTab";
import { Task } from "@/types/task";
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
  "EIN",
  "SSN",
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

const MODAL_SECTIONS = ['overview', 'tasks', 'notes', 'documents', 'details', 'activity'] as const;
type ModalSection = typeof MODAL_SECTIONS[number];

const OpportunityDetailModal = ({ opportunity, onClose, onUpdate, onMarkAsDead, onDelete, onConvertToGateway, onMoveToProcessing, hasGatewayOpportunity }: OpportunityDetailModalProps) => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const { getTasksForOpportunity, addTask, updateTaskStatus } = useTasks();
  const [isEditing, setIsEditing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeadDialog, setShowDeadDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRequestDeleteDialog, setShowRequestDeleteDialog] = useState(false);
  const [showDeathSplash, setShowDeathSplash] = useState(false);
  const [reactivateConfirm, setReactivateConfirm] = useState<{ assignee: string } | null>(null);
  const [activeSection, setActiveSection] = useState<ModalSection>('overview');
  const isMobile = useIsMobile();
  // Keyboard shortcuts for section navigation
  useEffect(() => {
    if (!opportunity) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const currentIndex = MODAL_SECTIONS.indexOf(activeSection);
      
      // Arrow keys or [ ] for section navigation
      if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        const newIndex = currentIndex > 0 ? currentIndex - 1 : MODAL_SECTIONS.length - 1;
        setActiveSection(MODAL_SECTIONS[newIndex]);
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        const newIndex = currentIndex < MODAL_SECTIONS.length - 1 ? currentIndex + 1 : 0;
        setActiveSection(MODAL_SECTIONS[newIndex]);
      }
      
      // Number keys 1-6 for direct section access
      if (e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < MODAL_SECTIONS.length) {
          setActiveSection(MODAL_SECTIONS[idx]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [opportunity, activeSection]);
  
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
  const stageConfig = opportunity ? (STAGE_CONFIG[opportunity.stage] ?? STAGE_CONFIG.application_prep) : STAGE_CONFIG.application_started;
  const wizardState = opportunity?.wizard_state;
  const wizardFormState = useMemo(
    () => (wizardState?.form_state as Record<string, unknown> | undefined) ?? {},
    [wizardState?.form_state],
  );
  const wizardSectionProgress = useMemo(
    () => computeWizardSectionProgress(wizardFormState),
    [wizardFormState],
  );
  const relatedTasks = useMemo(
    () => (opportunity ? getTasksForOpportunity(opportunity.id) : []),
    [getTasksForOpportunity, opportunity],
  );
  const assigneeOptions = useMemo(
    () =>
      Array.from(
        new Set([opportunity?.assigned_to, user?.email, "Onboarding", "Operations", "Support", "Unassigned"].filter(Boolean)),
      ) as string[],
    [opportunity?.assigned_to, user?.email],
  );

  // Icon rail items for section navigation
  const iconRailItems: IconRailItem[] = useMemo(() => {
    const openTaskCount = relatedTasks.filter(t => t.status !== 'done').length;
    return [
      { id: 'overview', icon: <ClipboardList className="h-4 w-4" />, label: 'Overview' },
      { id: 'tasks', icon: <ListChecks className="h-4 w-4" />, label: 'Tasks', badge: openTaskCount || undefined, badgeVariant: openTaskCount > 0 ? 'default' as const : undefined },
      { id: 'notes', icon: <MessageSquare className="h-4 w-4" />, label: 'Notes' },
      { id: 'documents', icon: <FileText className="h-4 w-4" />, label: 'Docs' },
      { id: 'details', icon: <Building2 className="h-4 w-4" />, label: 'Details' },
      { id: 'activity', icon: <Activity className="h-4 w-4" />, label: 'Activity' },
    ];
  }, [relatedTasks]);

  const handleSectionSelect = useCallback((id: string) => {
    setActiveSection(id as ModalSection);
  }, []);

  const startEditing = () => {
    // Populate form with current values
    setAccountName(account?.name || "");
    setWebsite(account?.website || "");
    setAddress1(account?.address1 || "");
    setAddress2(account?.address2 || "");
    setCity(account?.city || "");
    setState(account?.state || "");
    setZip(account?.zip || "");
    setCountry(account?.country || "");
    
    setFirstName(contact?.first_name || "");
    setLastName(contact?.last_name || "");
    setEmail(contact?.email || "");
    setPhone(contact?.phone || "");
    setFax(contact?.fax || "");
    
    setUsername(opportunity.username || "");
    setReferralSource(opportunity.referral_source || "");
    setTimezone(opportunity.timezone || "");
    setLanguage(opportunity.language || "");

    // Populate wizard fields
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
    // Cancel any pending auto-save to avoid race conditions
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

  const isGatewayCard = opportunity ? getServiceType(opportunity) === 'gateway_only' : false;

  // Auto-save callback
  const handleAutoSave = useCallback(async (data: typeof formData) => {
    if (!opportunity) return;
    
    // Update account
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

    // Update contact
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

    // Update opportunity
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

    // Update wizard state if wizard fields changed
    if (data.wizardFields && Object.keys(data.wizardFields).length > 0) {
      const { data: ws } = await supabase
        .from('onboarding_wizard_states')
        .select('id, form_state')
        .eq('opportunity_id', opportunity.id)
        .maybeSingle();

      if (ws) {
        const currentForm = (ws.form_state as Record<string, unknown>) ?? {};
        const mergedForm = { ...currentForm, ...data.wizardFields };
        const { error: wizErr } = await supabase
          .from('onboarding_wizard_states')
          .update({ form_state: mergedForm as never, updated_at: new Date().toISOString() } as never)
          .eq('id', ws.id);
        if (wizErr) throw wizErr;
      } else {
        // Create wizard state if it doesn't exist
        const { error: wizErr } = await supabase
          .from('onboarding_wizard_states')
          .insert({
            opportunity_id: opportunity.id,
            form_state: data.wizardFields as never,
            progress: 0,
            step_index: 0,
          } as never);
        if (wizErr) throw wizErr;
      }
    }

    // Update local state
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
        form_state: { ...(opportunity.wizard_state.form_state as Record<string, unknown>), ...data.wizardFields },
      } : undefined,
    });
  }, [opportunity, account, contact, onUpdate]);

  const { status: saveStatus, resetInitialData, cancel: cancelAutoSave, markSaved } = useAutoSave({
    data: formData,
    onSave: handleAutoSave,
    delay: 800,
    enabled: isEditing && !!opportunity,
  });

  // Reset auto-save state when entering edit mode
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

    // Log activity
    await supabase.from('activities').insert({
      opportunity_id: opportunity.id,
      type: isReactivation ? 'reactivated' : 'assignment_change',
      description: isReactivation
        ? `Reactivated and assigned to ${newAssignee}`
        : `Reassigned to ${newAssignee || 'Unassigned'}`,
      user_id: user?.id,
      user_email: user?.email,
    });

    // Send email notification for opportunity assignment
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
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ status: 'dead', stage: 'closed_lost' })
        .eq('id', opportunity.id);

      if (!error) {
        // Also mark the account as dead
        await supabase
          .from('accounts')
          .update({ status: 'dead' })
          .eq('id', opportunity.account_id);
      }

      if (error) throw error;

      // Log activity
      await supabase.from('activities').insert({
        opportunity_id: opportunity.id,
        type: 'status_change',
        description: 'Marked as Dead/Archived',
        user_id: user?.id,
        user_email: user?.email,
      });

      setShowDeadDialog(false);
      setShowDeathSplash(true);
      
      // Show splash for 2 seconds then close
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

  if (!opportunity) return null;

  return (
    <>
      <Dialog open={!!opportunity} onOpenChange={onClose}>
        <DialogContent
          className={cn(
            "flex flex-col transition-all duration-200",
            isMaximized
              ? "sm:max-w-[95vw] max-h-[95vh]"
              : "sm:max-w-2xl max-h-[90vh]"
          )}
          aria-describedby={undefined}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded",
                  opportunity.stage === 'live_activated'
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-primary/10 text-primary"
                )}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle>{account?.name || 'Unknown Business'}</DialogTitle>
                    <span className={cn(
                      "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                      getServiceType(opportunity) === 'gateway_only' 
                        ? "bg-teal/10 text-teal" 
                        : "bg-primary/10 text-primary"
                    )}>
                      {getServiceType(opportunity) === 'gateway_only' ? (
                        <>
                          <Zap className="h-3 w-3" />
                          Gateway
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-3 w-3" />
                          Processing
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Editable Stage Dropdown */}
                    <Select
                      value={opportunity.stage}
                      onValueChange={async (value) => {
                        const newStage = value as OpportunityStage;
                        const oldStage = opportunity.stage;
                        
                        const { error } = await supabase
                          .from('opportunities')
                          .update({ stage: newStage })
                          .eq('id', opportunity.id);
                        
                        if (error) {
                          toast.error("Failed to update stage");
                          return;
                        }
                        
                        // Log activity
                        await supabase.from('activities').insert({
                          opportunity_id: opportunity.id,
                          type: 'stage_change',
                          description: `Moved from ${STAGE_CONFIG[oldStage].label} to ${STAGE_CONFIG[newStage].label}`,
                          user_id: user?.id,
                          user_email: user?.email,
                        });
                        
                        // Send email notification
                        if (opportunity.assigned_to) {
                          sendStageChangeEmail(
                            opportunity.assigned_to,
                            account?.name || 'Unknown Account',
                            oldStage,
                            newStage,
                            user?.email
                          ).catch(err => console.error("Failed to send stage change email:", err));
                        }
                        
                        onUpdate({ ...opportunity, stage: newStage });
                        toast.success(`Stage updated to ${STAGE_CONFIG[newStage].label}`);
                      }}
                    >
                      <SelectTrigger className="h-6 w-auto border-0 bg-transparent hover:bg-muted/50 px-2 text-sm gap-1">
                        <div className={`w-2 h-2 rounded-full ${stageConfig.colorClass}`} />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
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
                    {opportunity.status === 'dead' && (
                      <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                        Archived
                      </span>
                    )}
                    <span className="text-muted-foreground">•</span>
                    {/* Primary Owner Dropdown */}
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
                      <SelectTrigger className="h-6 w-auto border-0 bg-transparent hover:bg-muted/50 px-2 text-xs font-medium">
                        <User className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Assign owner" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                        {TEAM_MEMBERS.map((member) => (
                          <SelectItem key={member} value={member} className="text-xs">
                            {member}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <AutoSaveIndicator status={saveStatus} />
                    <Button variant="default" size="sm" onClick={handleManualSave}>
                      <Check className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={startEditing}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                    
                    {/* Pipeline toggle button - Lightning bolt for conversion */}
                    {isGatewayCard ? (
                      onMoveToProcessing && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-amber-500 border-amber-500 hover:bg-amber-500/10"
                              onClick={() => setShowMoveDialog(true)}
                              disabled={isConverting}
                            >
                              <CreditCard className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Move to Processing</TooltipContent>
                        </Tooltip>
                      )
                    ) : (
                      onConvertToGateway && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-amber-500 border-amber-500 hover:bg-amber-500/10"
                              onClick={handleConvertToGateway}
                              disabled={isConverting || hasGatewayOpportunity}
                            >
                              <Zap className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hasGatewayOpportunity ? 'Gateway Added' : 'Add to Gateway'}
                          </TooltipContent>
                        </Tooltip>
                      )
                    )}
                    
                    {/* Mark as Dead - Skull icon */}
                    {opportunity.status !== 'dead' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline" 
                            size="icon"
                            className="h-8 w-8 text-[hsl(var(--toxic))] border-[hsl(var(--toxic))] hover:bg-[hsl(var(--toxic))]/10"
                            onClick={() => setShowDeadDialog(true)}
                          >
                            <Skull className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Mark as Dead</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* Delete - admin only, Request Deletion for others */}
                    {isAdmin ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="destructive" 
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setShowDeleteDialog(true)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete Permanently</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-8 w-8 text-destructive border-destructive hover:bg-destructive/10"
                            onClick={() => setShowRequestDeleteDialog(true)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Request Deletion</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* Maximize/Minimize */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setIsMaximized(!isMaximized)}
                        >
                          {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isMaximized ? 'Minimize' : 'Maximize'}</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Live badge overlay - medallion in header area, ribbons drape over next section */}
          {opportunity.stage === 'live_activated' && (
            <div className="relative flex justify-center -mt-14 pointer-events-none z-10" style={{ marginBottom: '-3.5rem' }}>
              <img 
                src={liveBadge} 
                alt="Live Account" 
                className="h-40 w-auto drop-shadow-2xl animate-ribbon-drop" 
                style={{ filter: 'drop-shadow(0 8px 16px rgba(180, 130, 20, 0.35))' }}
              />
            </div>
          )}

          {/* Compact status strip */}
          <div className="mt-2 space-y-2 flex-shrink-0">
            {opportunity.stage === 'live_activated' ? (
              <div className="rounded-lg bg-gradient-to-b from-amber-50/60 via-amber-100/30 to-transparent dark:from-amber-500/10 dark:via-amber-500/5 dark:to-transparent border border-amber-200/40 dark:border-amber-500/20 py-4 px-4">
                <h3 className="text-amber-600 dark:text-amber-400 font-bold tracking-widest uppercase text-sm text-center">
                  Live Account
                </h3>
              </div>
            ) : (
              <>
                <StatusBlockerPanel 
                  opportunity={opportunity} 
                  wizardProgress={wizardState?.progress ?? 0}
                  onUpdate={onUpdate}
                  compact={activeSection !== 'overview'}
                />
                {activeSection === 'overview' && <StagePath opportunity={opportunity} />}
              </>
            )}
          </div>

          {/* Icon Rail + Dynamic Panel Layout */}
          <div className={cn(
            "flex-1 min-h-0 flex mt-2",
            isMobile ? "flex-col" : "flex-row"
          )}>
            {/* Desktop: vertical icon rail on left */}
            {!isMobile && (
              <IconRail
                items={iconRailItems}
                activeId={activeSection}
                onSelect={handleSectionSelect}
              />
            )}

            {/* Primary Panel - takes full remaining space */}
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto px-3 py-2">
              {activeSection === 'overview' && (
                <ApplicationProgress 
                  opportunity={opportunity} 
                  wizardState={wizardState ? {
                    progress: wizardState.progress,
                    step_index: wizardState.step_index,
                    form_state: wizardState.form_state as Record<string, unknown>,
                    updated_at: wizardState.updated_at
                  } : null}
                />
              )}

              {activeSection === 'tasks' && (
                <OpportunityTasks 
                  opportunityId={opportunity.id} 
                  tasks={relatedTasks}
                />
              )}

              {activeSection === 'notes' && (
                <NotesSection opportunityId={opportunity.id} />
              )}

              {activeSection === 'documents' && (
                <DocumentsTab opportunityId={opportunity.id} />
              )}

              {activeSection === 'details' && (
                <div className="space-y-6">
                  {/* Account */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Account
                    </h3>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-4">
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
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="Company Name" value={account?.name} />
                        <InfoItem label="Website" value={account?.website} />
                        <InfoItem label="Address" value={account?.address1} />
                        <InfoItem label="Address 2" value={account?.address2} />
                        <InfoItem label="City" value={account?.city} />
                        <InfoItem label="State" value={account?.state} />
                        <InfoItem label="Zip" value={account?.zip} />
                        <InfoItem label="Country" value={account?.country} />
                      </div>
                    )}
                  </div>

                  {/* Contact */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contact
                    </h3>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-4">
                        <EditField label="First Name" value={firstName} onChange={setFirstName} />
                        <EditField label="Last Name" value={lastName} onChange={setLastName} />
                        <EditField label="Email" value={email} onChange={setEmail} type="email" />
                        <EditField label="Phone" value={phone} onChange={setPhone} type="tel" />
                        <EditField label="Fax" value={fax} onChange={setFax} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="First Name" value={contact?.first_name} />
                        <InfoItem label="Last Name" value={contact?.last_name} />
                        <InfoItem label="Email" value={contact?.email} />
                        <InfoItem label="Phone" value={contact?.phone} />
                        <InfoItem label="Fax" value={contact?.fax} />
                      </div>
                    )}
                  </div>

                  {/* Opportunity */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Opportunity
                    </h3>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="Stage" value={stageConfig.label} />
                        <EditField label="Username" value={username} onChange={setUsername} />
                        <EditField label="Referral Source" value={referralSource} onChange={setReferralSource} />
                        <EditField label="Timezone" value={timezone} onChange={setTimezone} />
                        <EditField label="Language" value={language} onChange={setLanguage} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="Stage" value={stageConfig.label} />
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
                      <div className="grid grid-cols-2 gap-4">
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
                      <div className="grid grid-cols-2 gap-4">
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

                  {/* Wizard: Legal Info */}
                  <div className="border-t border-border pt-4 space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      Legal Info <span className="text-xs font-normal">(Wizard)</span>
                    </h3>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-4">
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
                      <div className="grid grid-cols-2 gap-4">
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

                  {/* Wizard: Processing */}
                  <div className="border-t border-border pt-4 space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Processing <span className="text-xs font-normal">(Wizard)</span>
                    </h3>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-4">
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
                      <div className="grid grid-cols-2 gap-4">
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

                  {/* Wizard: Gateway Only fields */}
                  {opportunity.service_type === 'gateway_only' && (
                    <div className="border-t border-border pt-4 space-y-4">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Gateway Details <span className="text-xs font-normal">(Wizard)</span>
                      </h3>
                      {isEditing ? (
                        <div className="grid grid-cols-2 gap-4">
                          <EditField label="Username" value={wizardFields.username || ""} onChange={v => setWizardField("username", v)} />
                          <EditField label="Current Processor" value={wizardFields.current_processor || ""} onChange={v => setWizardField("current_processor", v)} />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <InfoItem label="Username" value={wizardFormState.username as string} />
                          <InfoItem label="Current Processor" value={wizardFormState.current_processor as string} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'activity' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Activity Feed
                    </h3>
                  </div>
                  <ActivitiesTab opportunityId={opportunity.id} />
                </div>
              )}
            </div>

            {/* Mobile: horizontal icon rail at bottom */}
            {isMobile && (
              <IconRail
                items={iconRailItems}
                activeId={activeSection}
                onSelect={handleSectionSelect}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Move to Processing Confirmation */}
      <AlertDialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Move to Processing Pipeline?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will move the opportunity from the Gateway pipeline to the Processing pipeline.
              The opportunity will be assigned default processing services (Credit Card).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleMoveToProcessing(); setShowMoveDialog(false); }}>
              Move to Processing
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

interface ValidationReport {
  id?: string;
  readiness_score: string;
  summary: string;
  document_completeness: { document: string; status: string; note?: string }[];
  classification_issues: { file_name: string; issue: string }[];
  data_gaps: string[];
  risk_flags: { flag: string; severity: string }[];
  recommended_actions: string[];
  triggered_by?: string;
  created_at?: string;
}

const READINESS_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  ready: { label: "Ready to Submit", emoji: "🟢", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  needs_attention: { label: "Needs Attention", emoji: "🟡", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  not_ready: { label: "Not Ready", emoji: "🔴", color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  unknown: { label: "Unknown", emoji: "⚪", color: "text-muted-foreground", bg: "bg-muted border-border" },
};

const DOC_STATUS_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  present: { icon: <Check className="h-3.5 w-3.5" />, color: "text-emerald-500" },
  missing: { icon: <X className="h-3.5 w-3.5" />, color: "text-destructive" },
  unverified: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "text-amber-500" },
};

const ValidationReportCard = ({ report, onDismiss, opportunityId }: { report: ValidationReport; onDismiss?: () => void; opportunityId?: string }) => {
  const readiness = READINESS_CONFIG[report.readiness_score] || READINESS_CONFIG.unknown;
  const { user } = useAuth();
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const handleSaveAsNote = async () => {
    if (!opportunityId || !user) return;
    setIsSavingNote(true);
    try {
      // Build a concise text summary
      const lines: string[] = [
        `AI Validation — ${readiness.emoji} ${readiness.label}`,
      ];
      if (report.summary) lines.push(report.summary);
      if (report.data_gaps?.length) lines.push(`Missing data: ${report.data_gaps.join(", ")}`);
      if (report.risk_flags?.length) lines.push(`Risk flags: ${report.risk_flags.map(r => `${r.flag} (${r.severity})`).join("; ")}`);
      if (report.recommended_actions?.length) lines.push(`Actions: ${report.recommended_actions.join("; ")}`);

      const noteContent = lines.join("\n");

      const { error } = await supabase.from("comments").insert({
        opportunity_id: opportunityId,
        content: noteContent,
        user_id: user.id,
        user_email: user.email,
      });
      if (error) throw error;

      await supabase.from("activities").insert({
        opportunity_id: opportunityId,
        type: "note_added",
        description: `AI Validation report saved as note (${readiness.label})`,
        user_id: user.id,
        user_email: user.email,
      });

      setNoteSaved(true);
      toast.success("Validation saved as note");
    } catch (err) {
      console.error("Failed to save note:", err);
      toast.error("Failed to save as note");
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className={cn("px-4 py-3 flex items-center justify-between border-b", readiness.bg)}>
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">AI Validation Report</span>
          {report.created_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(report.created_at).toLocaleDateString()} {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", readiness.color)}>
            {readiness.emoji} {readiness.label}
          </Badge>
          {onDismiss && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onDismiss}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary */}
        {report.summary && (
          <p className="text-sm text-foreground/80 italic">{report.summary}</p>
        )}

        {/* Document Completeness */}
        {report.document_completeness.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Document Checklist</h5>
            <div className="grid gap-1.5">
              {report.document_completeness.map((doc, i) => {
                const statusInfo = DOC_STATUS_ICON[doc.status] || DOC_STATUS_ICON.unverified;
                return (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={cn("mt-0.5 shrink-0", statusInfo.color)}>{statusInfo.icon}</span>
                    <span className="font-medium">{doc.document}</span>
                    {doc.note && <span className="text-muted-foreground">— {doc.note}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Classification Issues */}
        {report.classification_issues && report.classification_issues.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Classification Issues</h5>
            <div className="grid gap-1.5">
              {report.classification_issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span><span className="font-medium">{issue.file_name}</span> — {issue.issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Gaps */}
        {report.data_gaps && report.data_gaps.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Missing Application Data</h5>
            <div className="flex flex-wrap gap-1.5">
              {report.data_gaps.map((gap, i) => (
                <Badge key={i} variant="outline" className="text-xs text-destructive border-destructive/30">{gap}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Risk Flags */}
        {report.risk_flags && report.risk_flags.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Risk Flags</h5>
            <div className="grid gap-1.5">
              {report.risk_flags.map((rf, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className={cn("text-[10px] px-1.5",
                    rf.severity === "high" ? "text-destructive border-destructive/30" :
                    rf.severity === "medium" ? "text-amber-500 border-amber-500/30" :
                    "text-muted-foreground border-border"
                  )}>
                    {rf.severity}
                  </Badge>
                  <span>{rf.flag}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Actions */}
        {report.recommended_actions.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recommended Actions</h5>
            <ol className="list-decimal list-inside space-y-1">
              {report.recommended_actions.map((action, i) => (
                <li key={i} className="text-sm text-foreground/80">{action}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Footer: triggered by + save as note */}
        <div className="flex items-center justify-between pt-1 border-t">
          {report.triggered_by ? (
            <p className="text-[11px] text-muted-foreground">
              Run by {report.triggered_by}
            </p>
          ) : <span />}
          {opportunityId && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={handleSaveAsNote}
              disabled={isSavingNote || noteSaved}
            >
              {noteSaved ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Saved
                </>
              ) : isSavingNote ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Add as Note
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const DocumentsTab = ({ opportunityId }: { opportunityId: string }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedDocType, setSelectedDocType] = useState("Unassigned");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [pastReports, setPastReports] = useState<ValidationReport[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Sync document list into the wizard's form_state so ApplicationProgress stays accurate */
  const syncDocsToWizard = async (docs: Document[]) => {
    const docRefs = docs.map((d) => ({ id: d.id, file_name: d.file_name, document_type: (d as any).document_type ?? 'Unassigned' }));
    const { data: ws } = await supabase
      .from('onboarding_wizard_states')
      .select('id, form_state')
      .eq('opportunity_id', opportunityId)
      .maybeSingle();
    if (!ws) return;
    const currentForm = (ws.form_state as Record<string, unknown>) ?? {};
    await supabase
      .from('onboarding_wizard_states')
      .update({ form_state: { ...currentForm, documents: docRefs }, updated_at: new Date().toISOString() } as never)
      .eq('id', ws.id);
  };

  const fetchPastReports = async () => {
    const { data } = await supabase
      .from('validation_reports')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setPastReports(data as unknown as ValidationReport[]);
  };

  useEffect(() => {
    fetchDocuments();
    fetchPastReports();
  }, [opportunityId]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select('id, opportunity_id, file_name, file_path, file_size, content_type, uploaded_by, created_at, document_type')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDocuments(data);
    }
    setIsLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setPendingFiles(Array.from(files));
    setSelectedDocType("Unassigned");
    setShowUploadDialog(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmUpload = async () => {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);
    setShowUploadDialog(false);
    
    for (const file of pendingFiles) {
      const filePath = `${opportunityId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('opportunity-documents')
        .upload(filePath, file);

      if (uploadError) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }

      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          opportunity_id: opportunityId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          content_type: file.type,
          document_type: selectedDocType,
        });

      if (dbError) {
        toast.error(`Failed to save ${file.name}`);
      }
    }

    toast.success('Documents uploaded');
    const { data: updatedDocs } = await supabase
      .from('documents')
      .select('id, opportunity_id, file_name, file_path, file_size, content_type, uploaded_by, created_at, document_type')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    if (updatedDocs) {
      setDocuments(updatedDocs);
      syncDocsToWizard(updatedDocs);
    }
    setIsUploading(false);
    setPendingFiles([]);
  };

  const cancelUpload = () => {
    setShowUploadDialog(false);
    setPendingFiles([]);
  };

  const handleUpdateDocType = async (docId: string, newType: string) => {
    const { error } = await supabase
      .from('documents')
      .update({ document_type: newType })
      .eq('id', docId);

    if (error) {
      toast.error('Failed to update document type');
      return;
    }

    setDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, document_type: newType } : doc))
    );
    toast.success('Document type updated');
  };

  const handleDelete = async (doc: Document) => {
    const { error: storageError } = await supabase.storage
      .from('opportunity-documents')
      .remove([doc.file_path]);

    if (storageError) {
      toast.error('Failed to delete file');
      return;
    }

    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', doc.id);

    if (!dbError) {
      toast.success('Document deleted');
      const { data: updatedDocs } = await supabase
        .from('documents')
        .select('id, opportunity_id, file_name, file_path, file_size, content_type, uploaded_by, created_at, document_type')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });
      if (updatedDocs) {
        setDocuments(updatedDocs);
        syncDocsToWizard(updatedDocs);
      } else {
        fetchDocuments();
      }
    }
  };

  const handlePreview = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('opportunity-documents')
        .download(doc.file_path);

      if (error || !data) {
        toast.error('Unable to open file');
        return;
      }

      const contentType = doc.content_type || 'application/octet-stream';
      const blob = new Blob([data], { type: contentType });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      toast.error('Unable to open file');
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('opportunity-documents')
        .download(doc.file_path);

      if (error || !data) {
        toast.error('Unable to download file');
        return;
      }

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Unable to download file');
    }
  };

  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleDownloadAll = async () => {
    if (documents.length === 0) return;
    setIsDownloadingAll(true);

    for (const doc of documents) {
      try {
        const { data, error } = await supabase.storage
          .from('opportunity-documents')
          .download(doc.file_path);

        if (error || !data) {
          toast.error(`Failed to download ${doc.file_name}`);
          continue;
        }

        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        await new Promise((r) => setTimeout(r, 300));
      } catch {
        toast.error(`Failed to download ${doc.file_name}`);
      }
    }

    setIsDownloadingAll(false);
    toast.success('Downloads complete');
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleValidateDocuments = async () => {
    setIsValidating(true);
    setValidationReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "validate-documents", opportunityId },
      });
      if (error) throw error;
      const report = data?.report as ValidationReport;
      if (report) {
        setValidationReport(report);
        fetchPastReports(); // refresh history
      } else {
        toast.error("No report generated");
      }
    } catch (err) {
      console.error("Validation error:", err);
      toast.error("Failed to validate documents");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        {pastReports.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {showHistory ? "Hide History" : `History (${pastReports.length})`}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleValidateDocuments}
          disabled={isValidating || documents.length === 0}
          className="text-primary border-primary/30 hover:bg-primary/10"
        >
          <Wand2 className="h-4 w-4 mr-1" />
          {isValidating ? 'Validating...' : 'AI Validate'}
        </Button>
        {documents.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadAll}
            disabled={isDownloadingAll}
          >
            <Download className="h-4 w-4 mr-1" />
            {isDownloadingAll ? 'Downloading...' : 'Download all'}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="h-4 w-4 mr-1" />
          {isUploading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>

      {/* AI Validation Report — Current */}
      {isValidating && (
        <div className="border rounded-lg p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing documents and application data...
          </div>
        </div>
      )}

      {validationReport && !isValidating && (
        <ValidationReportCard report={validationReport} onDismiss={() => setValidationReport(null)} opportunityId={opportunityId} />
      )}

      {/* Past reports history */}
      {showHistory && pastReports.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Reports</h4>
          {pastReports.map((report) => (
            <ValidationReportCard key={report.id} report={report} opportunityId={opportunityId} />
          ))}
        </div>
      )}

      {/* Inline Upload Panel */}
      {showUploadDialog && pendingFiles.length > 0 && (
        <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Select Document Type</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''}: {pendingFiles.map((f) => f.name).join(', ')}
            </p>
          </div>
          <Select value={selectedDocType} onValueChange={setSelectedDocType}>
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={cancelUpload}>Cancel</Button>
            <Button size="sm" onClick={confirmUpload}>Upload</Button>
          </div>
        </div>
      )}

      {/* Document List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No documents uploaded yet
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatFileSize(doc.file_size)}
                  {doc.uploaded_by && <span>by {doc.uploaded_by}</span>}
                </div>
              </div>
              <Select
                value={doc.document_type || "Unassigned"}
                onValueChange={(val) => handleUpdateDocType(doc.id, val)}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handlePreview(doc)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Preview</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(doc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default OpportunityDetailModal;
