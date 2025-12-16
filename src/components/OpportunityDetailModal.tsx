import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Opportunity, STAGE_CONFIG, Account, Contact, getServiceType } from "@/types/opportunity";
import { Building2, User, Briefcase, FileText, Activity, Pencil, Save, X, Upload, Trash2, Download, MessageSquare, Skull, AlertTriangle, ClipboardList, ListChecks, Zap, CreditCard, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import CommentsTab from "./CommentsTab";
import GameSplash from "./GameSplash";
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
  "Tax Confirmation",
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

const OpportunityDetailModal = ({ opportunity, onClose, onUpdate, onMarkAsDead, onDelete, onConvertToGateway, onMoveToProcessing, hasGatewayOpportunity }: OpportunityDetailModalProps) => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const { getTasksForOpportunity, addTask, updateTaskStatus } = useTasks();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeadDialog, setShowDeadDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRequestDeleteDialog, setShowRequestDeleteDialog] = useState(false);
  const [showDeathSplash, setShowDeathSplash] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("Unassigned");
  const [taskComments, setTaskComments] = useState("");
  
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

  if (!opportunity) return null;

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

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      // Update account
      if (account) {
        const { error: accountError } = await supabase
          .from('accounts')
          .update({
            name: accountName,
            website: website || null,
            address1: address1 || null,
            address2: address2 || null,
            city: city || null,
            state: state || null,
            zip: zip || null,
            country: country || null,
          })
          .eq('id', account.id);
        
        if (accountError) throw accountError;
      }

      // Update contact
      if (contact) {
        const { error: contactError } = await supabase
          .from('contacts')
          .update({
            first_name: firstName || null,
            last_name: lastName || null,
            email: email || null,
            phone: phone || null,
            fax: fax || null,
          })
          .eq('id', contact.id);
        
        if (contactError) throw contactError;
      }

      // Update opportunity
      const { error: oppError } = await supabase
        .from('opportunities')
        .update({
          username: username || null,
          referral_source: referralSource || null,
          timezone: timezone || null,
          language: language || null,
        })
        .eq('id', opportunity.id);
      
      if (oppError) throw oppError;

      // Update local state
      onUpdate({
        ...opportunity,
        username: username || undefined,
        referral_source: referralSource || undefined,
        timezone: timezone || undefined,
        language: language || undefined,
        account: account ? {
          ...account,
          name: accountName,
          website: website || undefined,
          address1: address1 || undefined,
          address2: address2 || undefined,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
          country: country || undefined,
        } : undefined,
        contact: contact ? {
          ...contact,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
          fax: fax || undefined,
        } : undefined,
      });

      toast.success("Changes saved successfully");
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
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

  return (
    <>
      <Dialog open={!!opportunity} onOpenChange={onClose}>
        <DialogContent className={cn(
          "overflow-hidden transition-all duration-200",
          isMaximized 
            ? "sm:max-w-[95vw] max-h-[95vh]" 
            : "sm:max-w-2xl max-h-[90vh]"
        )}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary p-2 rounded">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle>{account?.name || 'Unknown Business'}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${stageConfig.colorClass}`} />
                    <span className="text-sm text-muted-foreground">{stageConfig.label}</span>
                    {opportunity.status === 'dead' && (
                      <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={isSaving}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveChanges} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-1" />
                      {isSaving ? "Saving..." : "Save"}
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
                    
                    {/* Pipeline toggle button */}
                    {isGatewayCard ? (
                      onMoveToProcessing && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
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
                              className="h-8 w-8"
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
                    
                    {/* Mark as Dead - available to all users */}
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

          <Tabs defaultValue="account" className="mt-4">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="account" className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Account</span>
              </TabsTrigger>
              <TabsTrigger value="contact" className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Contact</span>
              </TabsTrigger>
              <TabsTrigger value="opportunity" className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Opportunity</span>
              </TabsTrigger>
              <TabsTrigger value="wizard" className="flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Wizard</span>
              </TabsTrigger>
              <TabsTrigger value="comments" className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Comments</span>
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Docs</span>
              </TabsTrigger>
              <TabsTrigger value="activities" className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Activity</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tasks</span>
              </TabsTrigger>
            </TabsList>

            <div className={cn(
              "overflow-y-auto pr-2",
              isMaximized ? "max-h-[75vh]" : "max-h-[60vh]"
            )}>
              <TabsContent value="account" className="mt-4 space-y-4">
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
              </TabsContent>

              <TabsContent value="contact" className="mt-4 space-y-4">
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
              </TabsContent>

              <TabsContent value="opportunity" className="mt-4 space-y-4">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem label="Stage" value={stageConfig.label} />
                    <EditField label="Username" value={username} onChange={setUsername} />
                    <EditField label="Referral Source" value={referralSource} onChange={setReferralSource} />
                    <EditField label="Timezone" value={timezone} onChange={setTimezone} />
                    <EditField label="Language" value={language} onChange={setLanguage} />
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Processing Services</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {opportunity.processing_services?.map((service) => (
                          <span 
                            key={service}
                            className="text-sm bg-muted px-2 py-1 rounded"
                          >
                            {service}
                          </span>
                        )) || <span className="text-sm text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <InfoItem label="Stage" value={stageConfig.label} />
                    <InfoItem label="Username" value={opportunity.username} />
                    <InfoItem label="Referral Source" value={opportunity.referral_source} />
                    <InfoItem label="Timezone" value={opportunity.timezone} />
                    <InfoItem label="Language" value={opportunity.language} />
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Processing Services</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {opportunity.processing_services?.map((service) => (
                          <span 
                            key={service}
                            className="text-sm bg-muted px-2 py-1 rounded"
                          >
                            {service}
                          </span>
                        )) || <span className="text-sm text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="wizard" className="mt-4 space-y-4">
                <div className="rounded-lg border bg-muted/10 border-border/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs", wizardBadgeClasses(wizardState?.progress ?? 0))}>
                        <span className="h-2 w-2 rounded-full bg-current" />
                        <span>{wizardState ? `${wizardState.progress}% complete` : "Not started"}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">Status window</span>
                    </div>
                    <a
                      className="text-sm font-semibold text-primary hover:underline"
                      href={`/tools/preboarding-wizard?opportunityId=${opportunity.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open wizard
                    </a>
                  </div>

                  {wizardState ? (
                    <div className="space-y-2">
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full transition-all", wizardProgressColor(wizardState.progress))}
                          style={{ width: `${Math.min(wizardState.progress, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Wizard progress saved for this application.</span>
                        <span>Step {wizardState.step_index + 1}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {wizardSectionProgress.map((section) => (
                          <div key={section.key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{section.label}</span>
                              <span>
                                {section.completed}/{section.total} · {section.percent}% {section.done ? "✓" : ""}
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full", section.done ? "bg-emerald-500" : "bg-amber-500")}
                                style={{ width: `${section.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No wizard data saved yet. Attach the preboarding wizard to this account and save progress to surface the status here.
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="comments" className="mt-4">
                <CommentsTab opportunityId={opportunity.id} />
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <DocumentsTab opportunityId={opportunity.id} />
              </TabsContent>

              <TabsContent value="activities" className="mt-4">
                <ActivitiesTab opportunityId={opportunity.id} />
              </TabsContent>

              <TabsContent value="tasks" className="mt-4 space-y-4">
                <form onSubmit={handleTaskSubmit} className="grid gap-3 rounded-lg border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="task-title">Task title</Label>
                    <Input
                      id="task-title"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Follow up on application"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="task-assignee">Assign to</Label>
                      <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                        <SelectTrigger id="task-assignee">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assigneeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-comments">Comments</Label>
                      <Textarea
                        id="task-comments"
                        value={taskComments}
                        onChange={(e) => setTaskComments(e.target.value)}
                        placeholder="What needs to happen next?"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="justify-self-start">
                    Add task
                  </Button>
                </form>

                <div className="space-y-3">
                  {relatedTasks.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tasks yet. Create one to track follow-ups.</p>
                  )}
                  {relatedTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium leading-none">{task.title}</p>
                            {task.source === "sla" && <Badge variant="destructive">24h SLA</Badge>}
                          </div>
                          {task.comments && <p className="text-sm text-muted-foreground">{task.comments}</p>}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">Assignee: {task.assignee}</Badge>
                            <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <Select value={task.status} onValueChange={(value) => updateTaskStatus(task.id, value as Task["status"])}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

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
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedDocType, setSelectedDocType] = useState("Unassigned");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, [opportunityId]);

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, opportunity_id, file_name, file_path, file_size, content_type, uploaded_by, created_at, document_type')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDocuments(data);
    }
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

      {documents.length === 0 ? (
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
