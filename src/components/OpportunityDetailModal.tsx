import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Opportunity, STAGE_CONFIG, Account, Contact } from "@/types/opportunity";
import { Building2, User, Briefcase, FileText, Activity, Pencil, Save, X, Upload, Trash2, Download, MessageSquare, Skull, AlertTriangle, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import CommentsTab from "./CommentsTab";
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

interface Document {
  id: string;
  opportunity_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

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

interface OpportunityDetailModalProps {
  opportunity: Opportunity | null;
  onClose: () => void;
  onUpdate: (updates: Partial<Opportunity>) => void;
  onMarkAsDead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const OpportunityDetailModal = ({ opportunity, onClose, onUpdate, onMarkAsDead, onDelete }: OpportunityDetailModalProps) => {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeadDialog, setShowDeadDialog] = useState(false);
  
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

  if (!opportunity) return null;

  const account = opportunity.account;
  const contact = opportunity.contact;
  const stageConfig = STAGE_CONFIG[opportunity.stage];
  const wizardState = opportunity.wizard_state;

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

      toast.success("Opportunity marked as dead");
      onMarkAsDead?.(opportunity.id);
      onClose();
    } catch (error) {
      console.error('Error marking as dead:', error);
      toast.error("Failed to mark as dead");
    }
    setShowDeadDialog(false);
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

  return (
    <>
      <Dialog open={!!opportunity} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
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
              <div className="flex items-center gap-2">
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
                    <Button variant="outline" size="sm" onClick={startEditing}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    {/* Mark as Dead - available to all users */}
                    {opportunity.status !== 'dead' && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-amber-600 border-amber-600 hover:bg-amber-50"
                        onClick={() => setShowDeadDialog(true)}
                      >
                        <Skull className="h-4 w-4 mr-1" />
                        Mark Dead
                      </Button>
                    )}
                    {/* Delete - admin only */}
                    {isAdmin && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          <Tabs defaultValue="account" className="mt-4">
            <TabsList className="grid w-full grid-cols-7">
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
            </TabsList>

            <div className="overflow-y-auto max-h-[50vh] pr-2">
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
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Mark as Dead Confirmation */}
      <AlertDialog open={showDeadDialog} onOpenChange={setShowDeadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Mark as Dead?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the opportunity and remove it from the active pipeline view.
              You can still view it in the All Accounts and Contacts sections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkAsDead} className="bg-amber-600 hover:bg-amber-700">
              Mark as Dead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, [opportunityId]);

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDocuments(data);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    for (const file of Array.from(files)) {
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
        });

      if (dbError) {
        toast.error(`Failed to save ${file.name}`);
      }
    }

    toast.success('Documents uploaded');
    fetchDocuments();
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const handleDownload = (doc: Document) => {
    const { data } = supabase.storage
      .from('opportunity-documents')
      .getPublicUrl(doc.file_path);
    
    window.open(data.publicUrl, '_blank');
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
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)}
                  </p>
                </div>
              </div>
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
