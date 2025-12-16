import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface NewApplicationModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ApplicationFormData) => void;
}

export interface ApplicationFormData {
  // Selection mode
  existingAccountId?: string;
  existingContactId?: string;
  serviceType: 'processing' | 'gateway_only';
  // Account fields
  companyName: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  website: string;
  // Contact fields
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fax: string;
  // Opportunity fields
  username: string;
  processingServices: string[];
  valueServices: string;
  referralSource: string;
  timezone: string;
  language: string;
}

interface AccountOption {
  id: string;
  name: string;
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  account_id: string;
}

const PROCESSING_SERVICES = [
  'Credit Card',
  'ACH / eCheck',
  'Wire Transfer',
  'Cryptocurrency',
];

const NewApplicationModal = ({ open, onClose, onSubmit }: NewApplicationModalProps) => {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactOption[]>([]);
  const [useExistingAccount, setUseExistingAccount] = useState(false);
  const [useExistingContact, setUseExistingContact] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const isGatewayApplication = formData.serviceType === 'gateway_only';

  const [formData, setFormData] = useState<ApplicationFormData>({
    serviceType: 'processing',
    companyName: '',
    address: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    website: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    fax: '',
    username: '',
    processingServices: [],
    valueServices: '',
    referralSource: '',
    timezone: '',
    language: '',
  });

  useEffect(() => {
    if (open) {
      fetchAccounts();
      fetchContacts();
    }
  }, [open]);

  useEffect(() => {
    // Filter contacts by selected account
    if (selectedAccountId) {
      setFilteredContacts(contacts.filter(c => c.account_id === selectedAccountId));
    } else {
      setFilteredContacts(contacts);
    }
  }, [selectedAccountId, contacts]);

  const fetchAccounts = async () => {
    const { data } = await supabase
      .from('accounts')
      .select('id, name')
      .order('name', { ascending: true });
    if (data) setAccounts(data);
  };

  const fetchContacts = async () => {
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, account_id')
      .order('first_name', { ascending: true });
    if (data) setContacts(data);
  };

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setFormData(prev => ({ ...prev, companyName: account.name }));
    }
    // Reset contact selection when account changes
    setSelectedContactId('');
    setUseExistingContact(false);
  };

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId);
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      setFormData(prev => ({
        ...prev,
        firstName: contact.first_name || '',
        lastName: contact.last_name || '',
        email: contact.email || '',
      }));
      // Also select the account if not already selected
      if (!selectedAccountId && contact.account_id) {
        setSelectedAccountId(contact.account_id);
        setUseExistingAccount(true);
        const account = accounts.find(a => a.id === contact.account_id);
        if (account) {
          setFormData(prev => ({ ...prev, companyName: account.name }));
        }
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      existingAccountId: useExistingAccount ? selectedAccountId : undefined,
      existingContactId: useExistingContact ? selectedContactId : undefined,
    });
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setFormData({
      serviceType: 'processing',
      companyName: '',
      address: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      website: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      fax: '',
      username: '',
      processingServices: [],
      valueServices: '',
      referralSource: '',
      timezone: '',
      language: '',
    });
    setUseExistingAccount(false);
    setUseExistingContact(false);
    setSelectedAccountId('');
    setSelectedContactId('');
  };

  const toggleProcessingService = (service: string) => {
    setFormData(prev => ({
      ...prev,
      processingServices: prev.processingServices.includes(service)
        ? prev.processingServices.filter(s => s !== service)
        : [...prev.processingServices, service]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>New Merchant Application</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Application Type</Label>
                <span className="text-xs text-muted-foreground">
                  Choose whether this is a processing or gateway-only submission
                </span>
              </div>
              <Select
                value={formData.serviceType}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, serviceType: value as 'processing' | 'gateway_only' }))
                }
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Select application type" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="processing">Processing Application</SelectItem>
                  <SelectItem value="gateway_only">Gateway Application</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Account Information */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Account Information</h3>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setUseExistingAccount(!useExistingAccount);
                    if (useExistingAccount) {
                      setSelectedAccountId('');
                      setFormData(prev => ({ ...prev, companyName: '' }));
                    }
                  }}
                >
                  {useExistingAccount ? '+ Create new account' : 'Select existing account'}
                </Button>
              </div>

              {useExistingAccount ? (
                <div className="space-y-2">
                  <Label>Select Account *</Label>
                  <Select value={selectedAccountId} onValueChange={handleAccountSelect}>
                    <SelectTrigger className="bg-secondary">
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="New Age Digital LLC"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="1095 Sugar View Dr STE 500"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="address2">Address 2</Label>
                    <Input
                      id="address2"
                      value={formData.address2}
                      onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
                      placeholder="Suite, Unit, Building, etc."
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Sheridan"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="Wyoming"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zip">Zip</Label>
                      <Input
                        id="zip"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        placeholder="82801"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="USA"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Contact Information */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setUseExistingContact(!useExistingContact);
                    if (useExistingContact) {
                      setSelectedContactId('');
                      setFormData(prev => ({ ...prev, firstName: '', lastName: '', email: '' }));
                    }
                  }}
                >
                  {useExistingContact ? '+ Create new contact' : 'Select existing contact'}
                </Button>
              </div>

              {useExistingContact ? (
                <div className="space-y-2">
                  <Label>Select Contact *</Label>
                  <Select value={selectedContactId} onValueChange={handleContactSelect}>
                    <SelectTrigger className="bg-secondary">
                      <SelectValue placeholder="Choose a contact" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {(selectedAccountId ? filteredContacts : contacts).map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.first_name} {contact.last_name} {contact.email ? `(${contact.email})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedAccountId && filteredContacts.length === 0 && (
                    <p className="text-xs text-muted-foreground">No contacts found for this account</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        placeholder="Prateek"
                        required={!useExistingContact}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        placeholder="Godika"
                        required={!useExistingContact}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="prateek@example.com"
                        required={!useExistingContact}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="8668616317"
                        required={!useExistingContact}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="fax">Fax</Label>
                    <Input
                      id="fax"
                      value={formData.fax}
                      onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}
            </div>
            
            {/* Opportunity Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Opportunity Details</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Portal Username</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="recovathlete"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referralSource">Referral Source</Label>
                  <Input
                    id="referralSource"
                    value={formData.referralSource}
                    onChange={(e) => setFormData({ ...formData, referralSource: e.target.value })}
                    placeholder="Partner, Website, etc."
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Processing Services</Label>
                {isGatewayApplication ? (
                  <p className="text-sm text-muted-foreground">
                    Gateway applications skip processing services by default.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {PROCESSING_SERVICES.map((service) => (
                      <div key={service} className="flex items-center space-x-2">
                        <Checkbox
                          id={service}
                          checked={formData.processingServices.includes(service)}
                          onCheckedChange={() => toggleProcessingService(service)}
                        />
                        <Label htmlFor={service} className="text-sm font-normal cursor-pointer">
                          {service}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="valueServices">Value Services</Label>
                <Input
                  id="valueServices"
                  value={formData.valueServices}
                  onChange={(e) => setFormData({ ...formData, valueServices: e.target.value })}
                  placeholder="Additional services..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    placeholder="America/New_York"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    placeholder="English"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                Add Application
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default NewApplicationModal;