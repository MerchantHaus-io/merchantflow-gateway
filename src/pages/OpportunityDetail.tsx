import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { 
  ArrowLeft, 
  Building2, 
  User, 
  Briefcase, 
  FileText, 
  Activity, 
  Pencil, 
  X, 
  Trash2, 
  MessageSquare, 
  Skull, 
  ClipboardList, 
  ListChecks, 
  Zap, 
  CreditCard,
  Calendar,
  Clock,
  ExternalLink
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import { cn } from "@/lib/utils";
import { 
  Opportunity, 
  STAGE_CONFIG, 
  OpportunityStage,
  TEAM_MEMBERS,
  getServiceType,
  migrateStage 
} from "@/types/opportunity";
import ThemeToggle from "@/components/ThemeToggle";
import ActivitiesTab from "@/components/ActivitiesTab";
import { StatusBlockerPanel } from "@/components/opportunity-detail/StatusBlockerPanel";
import { StagePath } from "@/components/opportunity-detail/StagePath";
import { ApplicationProgress } from "@/components/opportunity-detail/ApplicationProgress";
import { OpportunityTasks } from "@/components/opportunity-detail/OpportunityTasks";
import { NotesSection } from "@/components/opportunity-detail/NotesSection";
import GameSplash from "@/components/GameSplash";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";

// Helper components
const InfoItem = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="space-y-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value || '-'}</p>
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
  onChange: (v: string) => void; 
  type?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="h-8"
    />
  </div>
);

// Documents component
const DocumentsSection = ({ opportunityId }: { opportunityId: string }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocs = async () => {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false });
      setDocuments(data || []);
      setLoading(false);
    };
    fetchDocs();
  }, [opportunityId]);

  if (loading) return <Skeleton className="h-20 w-full" />;
  
  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No documents uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{doc.file_name}</p>
              <p className="text-xs text-muted-foreground">{doc.document_type || 'Unassigned'}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href={doc.file_path} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
};

const OpportunityDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const { getTasksForOpportunity } = useTasks();
  
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeadDialog, setShowDeadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeathSplash, setShowDeathSplash] = useState(false);
  
  // Form state
  const [accountName, setAccountName] = useState("");
  const [website, setWebsite] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [username, setUsername] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("");

  const formData = useMemo(() => ({
    accountName, website, address1, address2, city, state, zip, country,
    firstName, lastName, email, phone, fax,
    username, referralSource, timezone, language,
  }), [accountName, website, address1, address2, city, state, zip, country,
      firstName, lastName, email, phone, fax, username, referralSource, timezone, language]);

  const fetchOpportunity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        *,
        account:accounts(*),
        contact:contacts(*),
        wizard_state:onboarding_wizard_states(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      toast.error("Failed to load opportunity");
      navigate('/opportunities');
      return;
    }

    const mapped = {
      ...data,
      stage: migrateStage(data.stage),
      wizard_state: Array.isArray(data.wizard_state) ? data.wizard_state[0] : data.wizard_state,
    };
    setOpportunity(mapped as Opportunity);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    fetchOpportunity();
  }, [fetchOpportunity]);

  const account = opportunity?.account;
  const contact = opportunity?.contact;
  const stageConfig = opportunity ? STAGE_CONFIG[opportunity.stage as OpportunityStage] : STAGE_CONFIG.application_started;
  const wizardState = opportunity?.wizard_state;
  const relatedTasks = useMemo(
    () => (opportunity ? getTasksForOpportunity(opportunity.id) : []),
    [getTasksForOpportunity, opportunity]
  );
  const serviceType = opportunity ? getServiceType(opportunity) : 'processing';

  const startEditing = () => {
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
    setUsername(opportunity?.username || "");
    setReferralSource(opportunity?.referral_source || "");
    setTimezone(opportunity?.timezone || "");
    setLanguage(opportunity?.language || "");
    setIsEditing(true);
  };

  const handleAutoSave = useCallback(async (data: typeof formData) => {
    if (!opportunity) return;
    
    if (account) {
      await supabase
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
    }

    if (contact) {
      await supabase
        .from('contacts')
        .update({
          first_name: data.firstName || null,
          last_name: data.lastName || null,
          email: data.email || null,
          phone: data.phone || null,
          fax: data.fax || null,
        })
        .eq('id', contact.id);
    }

    await supabase
      .from('opportunities')
      .update({
        username: data.username || null,
        referral_source: data.referralSource || null,
        timezone: data.timezone || null,
        language: data.language || null,
      })
      .eq('id', opportunity.id);

    fetchOpportunity();
  }, [opportunity, account, contact, fetchOpportunity]);

  const { status: saveStatus, resetInitialData } = useAutoSave({
    data: formData,
    onSave: handleAutoSave,
    delay: 800,
    enabled: isEditing && !!opportunity,
  });

  useEffect(() => {
    if (isEditing) resetInitialData();
  }, [isEditing, resetInitialData]);

  const handleOwnerChange = async (value: string) => {
    if (!opportunity) return;
    const newAssignee = value === "unassigned" ? null : value;
    
    const { error } = await supabase
      .from('opportunities')
      .update({ assigned_to: newAssignee })
      .eq('id', opportunity.id);
    
    if (error) {
      toast.error("Failed to reassign owner");
      return;
    }
    
    await supabase.from('activities').insert({
      opportunity_id: opportunity.id,
      type: 'assignment_change',
      description: `Reassigned to ${newAssignee || 'Unassigned'}`,
      user_id: user?.id,
      user_email: user?.email,
    });
    
    setOpportunity(prev => prev ? { ...prev, assigned_to: newAssignee || undefined } : null);
    toast.success(`Assigned to ${newAssignee || 'Unassigned'}`);
  };

  const handleMarkAsDead = async () => {
    if (!opportunity) return;
    
    const { error } = await supabase
      .from('opportunities')
      .update({ status: 'dead' })
      .eq('id', opportunity.id);

    if (error) {
      toast.error("Failed to mark as dead");
      return;
    }

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
      navigate('/opportunities');
    }, 2000);
  };

  const handleDelete = async () => {
    if (!opportunity) return;
    
    const { error } = await supabase
      .from('opportunities')
      .delete()
      .eq('id', opportunity.id);

    if (error) {
      toast.error("Failed to delete opportunity");
      return;
    }

    toast.success("Opportunity deleted permanently");
    navigate('/opportunities');
  };

  const handleUpdate = (updates: Partial<Opportunity>) => {
    setOpportunity(prev => prev ? { ...prev, ...updates } : null);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex-1 p-6">
          <Skeleton className="h-6 w-48 mb-6" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!opportunity) {
    return (
      <AppLayout>
        <div className="p-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/opportunities')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Opportunity not found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/opportunities')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      }
    >
      <div className="flex-1 overflow-auto">
          <div className="container max-w-7xl mx-auto p-6 space-y-6">
            {/* Hero Section */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Main Info Card */}
              <Card className="flex-1">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 text-primary p-3 rounded-lg">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl">{account?.name || 'Unknown Business'}</CardTitle>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge 
                            variant="outline" 
                            className={cn("font-medium", stageConfig.colorClass)}
                            style={{ borderColor: stageConfig.color, color: stageConfig.color }}
                          >
                            {stageConfig.label}
                          </Badge>
                          {opportunity.status === 'dead' && (
                            <Badge variant="destructive">Archived</Badge>
                          )}
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            {serviceType === 'gateway_only' ? (
                              <><Zap className="h-3 w-3 text-amber-500" /> Gateway</>
                            ) : (
                              <><CreditCard className="h-3 w-3 text-blue-500" /> Processing</>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <AutoSaveIndicator status={saveStatus} />
                          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                            <X className="h-4 w-4 mr-1" /> Done
                          </Button>
                        </>
                      ) : (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" onClick={startEditing}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          
                          {opportunity.status !== 'dead' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="text-[hsl(var(--toxic))] border-[hsl(var(--toxic))] hover:bg-[hsl(var(--toxic))]/10"
                                  onClick={() => setShowDeadDialog(true)}
                                >
                                  <Skull className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark as Dead</TooltipContent>
                            </Tooltip>
                          )}
                          
                          {isAdmin && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="destructive" 
                                  size="icon"
                                  onClick={() => setShowDeleteDialog(true)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Owner</p>
                      <Select
                        value={opportunity.assigned_to || "unassigned"}
                        onValueChange={handleOwnerChange}
                      >
                        <SelectTrigger className="h-8">
                          <User className="h-3 w-3 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {TEAM_MEMBERS.map((member) => (
                            <SelectItem key={member} value={member}>{member}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Created
                      </p>
                      <p className="text-sm font-medium">
                        {format(new Date(opportunity.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Last Updated
                      </p>
                      <p className="text-sm font-medium">
                        {formatDistanceToNow(new Date(opportunity.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Contact</p>
                      <p className="text-sm font-medium">
                        {contact?.first_name} {contact?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{contact?.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Status Panel */}
              <Card className="lg:w-80">
                <CardContent className="pt-6">
                  <StatusBlockerPanel 
                    opportunity={opportunity} 
                    wizardProgress={wizardState?.progress ?? 0}
                    onUpdate={handleUpdate}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Stage Path */}
            <Card>
              <CardContent className="pt-6">
                <StagePath opportunity={opportunity} />
              </CardContent>
            </Card>

            {/* Main Content */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left Column - Tabs */}
              <div className="lg:col-span-2">
                <Card>
                  <CardContent className="pt-6">
                    <Tabs defaultValue="overview">
                      <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="overview" className="flex items-center gap-1">
                          <ClipboardList className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Overview</span>
                        </TabsTrigger>
                        <TabsTrigger value="tasks" className="flex items-center gap-1">
                          <ListChecks className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Tasks</span>
                        </TabsTrigger>
                        <TabsTrigger value="notes" className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Notes</span>
                        </TabsTrigger>
                        <TabsTrigger value="documents" className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Docs</span>
                        </TabsTrigger>
                        <TabsTrigger value="details" className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Details</span>
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview" className="mt-6">
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

                      <TabsContent value="tasks" className="mt-6">
                        <OpportunityTasks 
                          opportunityId={opportunity.id} 
                          tasks={relatedTasks}
                        />
                      </TabsContent>

                      <TabsContent value="notes" className="mt-6">
                        <NotesSection opportunityId={opportunity.id} />
                      </TabsContent>

                      <TabsContent value="documents" className="mt-6">
                        <DocumentsSection opportunityId={opportunity.id} />
                      </TabsContent>

                      <TabsContent value="details" className="mt-6 space-y-6">
                        {/* Account Section */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                            <Building2 className="h-4 w-4" /> Account
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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <InfoItem label="Company Name" value={account?.name} />
                              <InfoItem label="Website" value={account?.website} />
                              <InfoItem label="Address" value={account?.address1} />
                              <InfoItem label="City" value={account?.city} />
                              <InfoItem label="State" value={account?.state} />
                              <InfoItem label="Zip" value={account?.zip} />
                              <InfoItem label="Country" value={account?.country} />
                            </div>
                          )}
                        </div>

                        {/* Contact Section */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                            <User className="h-4 w-4" /> Contact
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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <InfoItem label="First Name" value={contact?.first_name} />
                              <InfoItem label="Last Name" value={contact?.last_name} />
                              <InfoItem label="Email" value={contact?.email} />
                              <InfoItem label="Phone" value={contact?.phone} />
                              <InfoItem label="Fax" value={contact?.fax} />
                            </div>
                          )}
                        </div>

                        {/* Opportunity Section */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                            <Briefcase className="h-4 w-4" /> Opportunity
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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Activity */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Activity Feed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-y-auto pr-2">
                    <ActivitiesTab opportunityId={opportunity.id} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      {/* Dialogs */}
      <AlertDialog open={showDeadDialog} onOpenChange={setShowDeadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Skull className="h-5 w-5 text-[hsl(var(--toxic))]" />
              Mark as Dead?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the opportunity and remove it from the active pipeline view.
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Permanently Delete?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the opportunity
              and all associated data.
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

      <GameSplash
        type="death"
        show={showDeathSplash}
        onComplete={() => setShowDeathSplash(false)}
      />
    </AppLayout>
  );
};

export default OpportunityDetail;
