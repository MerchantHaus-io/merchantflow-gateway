import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Opportunity, STAGE_CONFIG, Account, Contact, getServiceType, EMAIL_TO_USER, TEAM_MEMBERS, OpportunityStage, PROCESSING_PIPELINE_STAGES, GATEWAY_ONLY_PIPELINE_STAGES } from "@/types/opportunity";
import { Building2, User, Briefcase, FileText, Activity, Pencil, X, Upload, Trash2, Download, MessageSquare, Skull, AlertTriangle, ClipboardList, ListChecks, Zap, CreditCard, Maximize2, Minimize2, Loader2, Wand2, RotateCcw } from "lucide-react";
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

const MODAL_TABS = ['overview', 'tasks', 'notes', 'documents', 'details'] as const;
type ModalTab = typeof MODAL_TABS[number];

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
  const [activeTab, setActiveTab] = useState<ModalTab>('overview');
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("Unassigned");
  const [taskComments, setTaskComments] = useState("");
  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    if (!opportunity) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const currentIndex = MODAL_TABS.indexOf(activeTab);
      
      // Arrow keys or [ ] for tab navigation
      if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        const newIndex = currentIndex > 0 ? currentIndex - 1 : MODAL_TABS.length - 1;
        setActiveTab(MODAL_TABS[newIndex]);
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        const newIndex = currentIndex < MODAL_TABS.length - 1 ? currentIndex + 1 : 0;
        setActiveTab(MODAL_TABS[newIndex]);
      }
      
      // Number keys 1-5 for direct tab access
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabIndex < MODAL_TABS.length) {
          setActiveTab(MODAL_TABS[tabIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [opportunity, activeTab]);
  
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

  // Combined form data for auto-save
  const formData = useMemo(() => ({
    accountName, website, address1, address2, city, state, zip, country,
    firstName, lastName, email, phone, fax,
    username, referralSource, timezone, language,
  }), [accountName, website, address1, address2, city, state, zip, country,
      firstName, lastName, email, phone, fax, username, referralSource, timezone, language]);

  const account = opportunity?.account;
  const contact = opportunity?.contact;
  const stageConfig = opportunity ? STAGE_CONFIG[opportunity.stage] : STAGE_CONFIG.application_started;
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

  useEffect(() => {
    if (!opportunity) return;
    setTaskAssignee(opportunity.assigned_to || user?.email || "Unassigned");
    setTaskTitle(`Follow up on ${opportunity.account?.name || "this application"}`);
    setTaskComments("");
  }, [opportunity, user?.email]);

  const handleTaskSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!opportunity) return;
    addTask({
      title: taskTitle || "Application follow-up",
      assignee: taskAssignee,
      comments: taskComments,
      description: taskComments,
      relatedOpportunityId: opportunity.id,
      createdBy: user?.email || "System",
      source: "manual",
    });
    setTaskComments("");
  };

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
    
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
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
    });
  }, [opportunity, account, contact, onUpdate]);

  const { status: saveStatus, resetInitialData } = useAutoSave({
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
        .update({ status: 'dead' })
        .eq('id', opportunity.id);

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
              ? "sm:max-w-[95vw] h-[95vh]" 
              : "sm:max-w-2xl h-[90vh]"
          )}
          aria-describedby={undefined}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary p-2 rounded">
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
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>
                      <X className="h-4 w-4 mr-1" />
                      Close
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

          {/* MVP: Status & Blockers Panel - Always visible at top */}
          <div className="mt-4 space-y-4">
            <StatusBlockerPanel 
              opportunity={opportunity} 
              wizardProgress={wizardState?.progress ?? 0}
              onUpdate={onUpdate}
            />
            
            {/* Stage Path */}
            <StagePath opportunity={opportunity} />
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ModalTab)} className="mt-4 flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="overview" className="flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Overview</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Press 1</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="tasks" className="flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Tasks</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Press 2</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="notes" className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Notes</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Press 3</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="documents" className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Docs</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Press 4</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="details" className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Details</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Press 5</TooltipContent>
              </Tooltip>
            </TabsList>

              {/* Overview Tab - Application Progress */}
              <TabsContent value="overview" className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2 space-y-4">
                <ApplicationProgress 
                  opportunity={opportunity} 
                  wizardState={wizardState ? {
                    progress: wizardState.progress,
                    step_index: wizardState.step_index,
                    form_state: wizardState.form_state as Record<string, unknown>,
                    updated_at: wizardState.updated_at
                  } : null}
                />
              </TabsContent>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2">
                <OpportunityTasks 
                  opportunityId={opportunity.id} 
                  tasks={relatedTasks}
                />
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2">
                <NotesSection opportunityId={opportunity.id} />
              </TabsContent>

              <TabsContent value="documents" className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2">
                <DocumentsTab opportunityId={opportunity.id} />
              </TabsContent>

              {/* Details Tab - Account, Contact, Opportunity info */}
              <TabsContent value="details" className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2 space-y-6">
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
              </TabsContent>
          </Tabs>

          {/* Activity Section - Always visible below tabs */}
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Activity Feed
              </h3>
            </div>
            <div className="max-h-[150px] overflow-y-auto pr-2">
              <ActivitiesTab opportunityId={opportunity.id} compact />
            </div>
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

const DocumentsTab = ({ opportunityId }: { opportunityId: string }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedDocType, setSelectedDocType] = useState("Unassigned");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
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
    fetchDocuments();
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
      fetchDocuments();
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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button 
          size="sm" 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="h-4 w-4 mr-1" />
          {isUploading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>

      {/* Upload Dialog */}
      <AlertDialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Document Type</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a document type for {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''}: {pendingFiles.map((f) => f.name).join(', ')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="doc-type">Document Type</Label>
            <Select value={selectedDocType} onValueChange={setSelectedDocType}>
              <SelectTrigger id="doc-type" className="mt-2">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelUpload}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpload}>Upload</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg gap-2">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="h-8 w-8 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No documents yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div 
              key={doc.id} 
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg gap-2"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)}
                  </p>
                </div>
              </div>
              <Select
                value={doc.document_type || "Unassigned"}
                onValueChange={(value) => handleUpdateDocType(doc.id, value)}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(doc)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OpportunityDetailModal;
