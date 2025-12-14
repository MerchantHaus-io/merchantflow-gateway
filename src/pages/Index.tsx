import { useState, useEffect, useMemo } from "react";
import PipelineBoard from "@/components/PipelineBoard";
import NewApplicationModal, { ApplicationFormData } from "@/components/NewApplicationModal";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { OnboardingWizardState, Opportunity, OpportunityStage } from "@/types/opportunity";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import DateRangeFilter from "@/components/DateRangeFilter";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";

type WizardPrefillForm = {
  dbaName: string;
  products: string;
  natureOfBusiness: string;
  dbaContactFirst: string;
  dbaContactLast: string;
  dbaPhone: string;
  dbaEmail: string;
  dbaAddress: string;
  dbaAddress2: string;
  dbaCity: string;
  dbaState: string;
  dbaZip: string;
  legalEntityName: string;
  legalPhone: string;
  legalEmail: string;
  tin: string;
  ownershipType: string;
  formationDate: string;
  stateIncorporated: string;
  legalAddress: string;
  legalAddress2: string;
  legalCity: string;
  legalState: string;
  legalZip: string;
  monthlyVolume: string;
  avgTicket: string;
  highTicket: string;
  swipedPct: string;
  keyedPct: string;
  motoPct: string;
  ecomPct: string;
  b2cPct: string;
  b2bPct: string;
  sicMcc: string;
  website: string;
  documents: unknown[];
  notes: string;
};

const WIZARD_REQUIRED_FIELDS: Record<
  "business" | "legal" | "processing" | "documents",
  (keyof WizardPrefillForm)[]
> = {
  business: [
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
  legal: [
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
  processing: [
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
  documents: ["documents"],
};

const createWizardFormFromOpportunity = (opportunity: Opportunity): WizardPrefillForm => {
  const account = opportunity.account;
  const contact = opportunity.contact;

  return {
    dbaName: account?.name || "",
    products: "",
    natureOfBusiness: "",
    dbaContactFirst: contact?.first_name || "",
    dbaContactLast: contact?.last_name || "",
    dbaPhone: contact?.phone || "",
    dbaEmail: contact?.email || "",
    dbaAddress: account?.address1 || "",
    dbaAddress2: account?.address2 || "",
    dbaCity: account?.city || "",
    dbaState: account?.state || "",
    dbaZip: account?.zip || "",
    legalEntityName: account?.name || "",
    legalPhone: contact?.phone || "",
    legalEmail: contact?.email || "",
    tin: "",
    ownershipType: "",
    formationDate: "",
    stateIncorporated: account?.state || "",
    legalAddress: account?.address1 || "",
    legalAddress2: account?.address2 || "",
    legalCity: account?.city || "",
    legalState: account?.state || "",
    legalZip: account?.zip || "",
    monthlyVolume: "",
    avgTicket: "",
    highTicket: "",
    swipedPct: "",
    keyedPct: "",
    motoPct: "",
    ecomPct: "",
    b2cPct: "",
    b2bPct: "",
    sicMcc: "",
    website: account?.website || "",
    documents: [],
    notes: "",
  };
};

const calculateWizardProgress = (form: WizardPrefillForm) => {
  const getMissingFieldsForSection = (section: keyof typeof WIZARD_REQUIRED_FIELDS) =>
    WIZARD_REQUIRED_FIELDS[section].filter((field) => {
      const value = form[field];
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return `${value}`.trim() === "";
    });

  const missingBySection = {
    business: getMissingFieldsForSection("business"),
    legal: getMissingFieldsForSection("legal"),
    processing: getMissingFieldsForSection("processing"),
    documents: getMissingFieldsForSection("documents"),
  };

  const totalRequiredFields =
    WIZARD_REQUIRED_FIELDS.business.length +
    WIZARD_REQUIRED_FIELDS.legal.length +
    WIZARD_REQUIRED_FIELDS.processing.length +
    1;

  const completedRequiredFields =
    (WIZARD_REQUIRED_FIELDS.business.length - missingBySection.business.length) +
    (WIZARD_REQUIRED_FIELDS.legal.length - missingBySection.legal.length) +
    (WIZARD_REQUIRED_FIELDS.processing.length - missingBySection.processing.length) +
    (missingBySection.documents.length === 0 ? 1 : 0);

  return Math.round((completedRequiredFields / totalRequiredFields) * 100);
};
const Index = () => {
  const {
    user
  } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBy, setFilterBy] = useState<'created_at' | 'updated_at'>('created_at');
  const {
    toast
  } = useToast();
  const { ensureSlaTask } = useTasks();
  useEffect(() => {
    fetchOpportunities();
  }, []);
  /**
   * Retrieves active opportunities with their related account, contact, and
   * onboarding wizard state data. The result is normalized to match the
   * Opportunity TypeScript interface before being stored in component state.
   */
  const fetchOpportunities = async () => {
    setLoading(true);

    const {
      data,
      error
    } = await supabase.from('opportunities').select(`
        id,
        account_id,
        contact_id,
        stage,
        status,
        referral_source,
        username,
        processing_services,
        value_services,
        timezone,
        language,
        assigned_to,
        stage_entered_at,
        created_at,
        updated_at,
        account:accounts(id, name, status, address1, address2, city, state, zip, country, website, created_at, updated_at),
        contact:contacts(id, account_id, first_name, last_name, email, phone, fax, created_at, updated_at)
      `).eq('status', 'active').order('created_at', {
      ascending: false
    });
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load opportunities",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    let typedData = (data || []).map(item => ({
      ...item,
      stage: item.stage as OpportunityStage,
      status: item.status as 'active' | 'dead' | undefined,
      account: item.account ? {
        ...item.account,
        status: item.account.status as 'active' | 'dead' | undefined
      } : undefined
    }));

    const opportunityIds = typedData.map(item => item.id);
    if (opportunityIds.length) {
      const {
        data: wizardStates,
        error: wizardStateError
      } = await supabase.from('onboarding_wizard_states').select('id, opportunity_id, progress, step_index, form_state, created_at, updated_at').in('opportunity_id', opportunityIds);

      if (wizardStateError) {
        console.error('Error loading wizard states:', wizardStateError);
      } else {
        const wizardStateMap = new Map<string, OnboardingWizardState>();
        (wizardStates || []).forEach((state) => wizardStateMap.set(state.opportunity_id, state as unknown as OnboardingWizardState));

        const opportunitiesWithoutWizard = typedData.filter((opportunity) => !wizardStateMap.has(opportunity.id));

        if (opportunitiesWithoutWizard.length) {
          const prefilledStates = opportunitiesWithoutWizard.map((opportunity) => {
            const formState = createWizardFormFromOpportunity(opportunity);

            return {
              opportunity_id: opportunity.id,
              progress: calculateWizardProgress(formState),
              step_index: 0,
              form_state: formState,
            };
          });

          const { data: insertedStates, error: createError } = await supabase
            .from('onboarding_wizard_states')
            .upsert(prefilledStates as never, { onConflict: 'opportunity_id' })
            .select('id, opportunity_id, progress, step_index, form_state, created_at, updated_at');

          if (createError) {
            console.error('Error creating wizard states:', createError);
          } else {
            (insertedStates || []).forEach((state) => wizardStateMap.set(state.opportunity_id, state as unknown as OnboardingWizardState));
          }
        }

        typedData = typedData.map(opportunity => ({
          ...opportunity,
          wizard_state: wizardStateMap.get(opportunity.id)
        }));
      }
    }

    setOpportunities(typedData);
    setLoading(false);
  };

  useEffect(() => {
    const now = Date.now();
    opportunities.forEach(opportunity => {
      if (opportunity.stage === 'application_started') {
        const createdAt = new Date(opportunity.created_at).getTime();
        const ageInHours = (now - createdAt) / (1000 * 60 * 60);
        if (ageInHours >= 24) {
          ensureSlaTask({
            relatedOpportunityId: opportunity.id,
            title: `24h follow-up: ${opportunity.account?.name || 'Application'}`,
            description: 'Application has been waiting for review for 24 hours',
            assignee: opportunity.assigned_to || user?.email || 'Unassigned',
            source: 'sla'
          });
        }
      }
    });
  }, [ensureSlaTask, opportunities, user?.email]);

  // Filter opportunities by date range
  const filteredOpportunities = useMemo(() => {
    if (!dateRange?.from) return opportunities;
    return opportunities.filter(opp => {
      const dateValue = new Date(opp[filterBy]);
      const from = startOfDay(dateRange.from!);
      const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
      return isWithinInterval(dateValue, {
        start: from,
        end: to
      });
    });
  }, [opportunities, dateRange, filterBy]);
  const handleNewApplication = async (formData: ApplicationFormData) => {
    try {
      let accountId: string;
      let contactId: string;

      // Use existing account or create new one
      if (formData.existingAccountId) {
        accountId = formData.existingAccountId;
      } else {
        const {
          data: account,
          error: accountError
        } = await supabase.from('accounts').insert({
          name: formData.companyName,
          address1: formData.address || null,
          address2: formData.address2 || null,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          country: formData.country || null,
          website: formData.website || null
        }).select('id').single();
        if (accountError) throw accountError;
        accountId = account.id;
      }

      // Use existing contact or create new one
      if (formData.existingContactId) {
        contactId = formData.existingContactId;
      } else {
        const {
          data: contact,
          error: contactError
        } = await supabase.from('contacts').insert({
          account_id: accountId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          fax: formData.fax || null
        }).select('id').single();
        if (contactError) throw contactError;
        contactId = contact.id;
      }
      const {
        error: opportunityError
      } = await supabase.from('opportunities').insert({
        account_id: accountId,
        contact_id: contactId,
        stage: 'application_started',
        referral_source: formData.referralSource || null,
        username: formData.username || null,
        processing_services: formData.processingServices.length > 0 ? formData.processingServices : null,
        value_services: formData.valueServices ? [formData.valueServices] : null,
        timezone: formData.timezone || null,
        language: formData.language || null,
        agree_to_terms: true
      }).select('id').single();
      if (opportunityError) throw opportunityError;
      await fetchOpportunities();
      toast({
        title: "Application Added",
        description: `Application has been added to the pipeline.`
      });
    } catch (error) {
      console.error('Error creating application:', error);
      toast({
        title: "Error",
        description: "Failed to add application",
        variant: "destructive"
      });
    }
  };
  const handleUpdateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    const opportunity = opportunities.find(o => o.id === id);
    const dbUpdates: Record<string, unknown> = {};
    if (updates.stage) dbUpdates.stage = updates.stage;
    const {
      error
    } = await supabase.from('opportunities').update(dbUpdates).eq('id', id);
    if (error) {
      toast({
        title: "Error",
        description: "Failed to update opportunity",
        variant: "destructive"
      });
      return;
    }

    // Log stage change activity
    if (updates.stage && opportunity && opportunity.stage !== updates.stage) {
      await supabase.from('activities').insert({
        opportunity_id: id,
        type: 'stage_change',
        description: `Moved from ${opportunity.stage} to ${updates.stage}`,
        user_id: user?.id,
        user_email: user?.email
      });
    }
    setOpportunities(opportunities.map(o => o.id === id ? {
      ...o,
      ...updates
    } : o));
  };
  const handleAssignmentChange = (opportunityId: string, assignedTo: string | null) => {
    setOpportunities(opportunities.map(o => o.id === opportunityId ? {
      ...o,
      assigned_to: assignedTo || undefined
    } : o));
  };
  const handleMarkAsDead = (id: string) => {
    setOpportunities(opportunities.filter(o => o.id !== id));
  };
  const handleDelete = (id: string) => {
    setOpportunities(opportunities.filter(o => o.id !== id));
  };
  if (loading) {
    return <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>;
  }
  return <SidebarProvider>
      <div className="h-screen flex w-full p-4 gap-4 pb-20">
        <AppSidebar onNewApplication={() => setIsModalOpen(true)} />
        <div className="flex-1 flex flex-col overflow-hidden gap-3 max-h-[calc(100vh-7rem)]">
          <header style={{
          backgroundColor: 'hsl(217 33% 17% / 0.7)'
        }} className="h-12 flex items-center px-4 rounded-lg border shadow-lg backdrop-blur-md gap-2 flex-shrink-0 border-primary">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
            <div className="ml-auto">
              <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} filterBy={filterBy} onFilterByChange={setFilterBy} />
            </div>
          </header>
          <main className="flex-1 overflow-hidden rounded-lg border border-border/50 shadow-lg backdrop-blur-md min-h-0" style={{
          backgroundColor: 'hsl(217 33% 17% / 0.7)'
        }}>
            <PipelineBoard opportunities={filteredOpportunities} onUpdateOpportunity={handleUpdateOpportunity} onAssignmentChange={handleAssignmentChange} onAddNew={() => setIsModalOpen(true)} onMarkAsDead={handleMarkAsDead} onDelete={handleDelete} />
          </main>
        </div>
      </div>
      
      <NewApplicationModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleNewApplication} />
    </SidebarProvider>;
};
export default Index;