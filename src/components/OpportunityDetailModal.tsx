import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Opportunity, STAGE_CONFIG, Account, Contact } from "@/types/opportunity";
import { Building2, User, Briefcase, FileText, Activity, Pencil, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OpportunityDetailModalProps {
  opportunity: Opportunity | null;
  onClose: () => void;
  onUpdate: (updates: Partial<Opportunity>) => void;
}

const OpportunityDetailModal = ({ opportunity, onClose, onUpdate }: OpportunityDetailModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
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

  return (
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
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="account" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
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
            <TabsTrigger value="documents" className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Activities</span>
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

            <TabsContent value="documents" className="mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No documents yet</p>
              </div>
            </TabsContent>

            <TabsContent value="activities" className="mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No activities yet</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
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
