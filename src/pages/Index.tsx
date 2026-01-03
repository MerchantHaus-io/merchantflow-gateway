import { useState, useEffect, useMemo, useCallback } from "react";
import DualPipelineBoard from "@/components/DualPipelineBoard";
import NewApplicationModal, { ApplicationFormData } from "@/components/NewApplicationModal";
import { AppLayout } from "@/components/AppLayout";
import { getServiceType, OnboardingWizardState, Opportunity, OpportunityStage, migrateStage, EMAIL_TO_USER, TEAM_MEMBERS } from "@/types/opportunity";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import DateRangeFilter from "@/components/DateRangeFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "lucide-react";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
import GameSplash from "@/components/GameSplash";
import { sendStageChangeEmail } from "@/hooks/useEmailNotifications";

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
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [splashType, setSplashType] = useState<"1up" | "level-up" | null>(null);
  const {
    toast
  } = useToast();
  const { ensureSlaTask } = useTasks();
  
  // Get current user's display name for filtering
  const currentUserDisplayName = EMAIL_TO_USER[user?.email?.toLowerCase() || ''] || user?.email?.split('@')[0] || '';

  const hasGatewayForAccount = (accountId: string) =>
    opportunities.some((opportunity) =>
      opportunity.account_id === accountId && getServiceType(opportunity) === 'gateway_only'
    );

  // Fetch a single opportunity with all relations for real-time updates
  const fetchSingleOpportunity = async (opportunityId: string) => {
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
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
        sla_status,
        created_at,
        updated_at,
        account:accounts(id, name, status, address1, address2, city, state, zip, country, website, created_at, updated_at),
        contact:contacts(id, account_id, first_name, last_name, email, phone, fax, created_at, updated_at)
      `)
      .eq('id', opportunityId)
      .single();

    if (error || !data) {
      console.error('Error fetching single opportunity:', error);
      return;
    }

    const typedOpportunity: Opportunity = {
      ...data,
      stage: migrateStage(data.stage) as OpportunityStage,
      status: data.status as 'active' | 'dead' | undefined,
      sla_status: data.sla_status as 'green' | 'amber' | 'red' | null | undefined,
      account: data.account ? {
        ...data.account,
        status: data.account.status as 'active' | 'dead' | undefined
      } : undefined,
      contact: data.contact || undefined,
    };

    // Only add if status is active
    if (typedOpportunity.status === 'active') {
      setOpportunities(prev => {
        // Check if already exists (avoid duplicates)
        if (prev.some(opp => opp.id === opportunityId)) {
          return prev;
        }
        return [typedOpportunity, ...prev];
      });
    }
  };
  useEffect(() => {
    fetchOpportunities();

    // Subscribe to real-time changes on opportunities table
    const channel = supabase
      .channel('opportunities-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'opportunities'
        },
        (payload) => {
          console.log('Real-time opportunity update:', payload);
          
          if (payload.eventType === 'INSERT') {
            // Fetch the full opportunity with relations
            fetchSingleOpportunity(payload.new.id);
          } else if (payload.eventType === 'UPDATE') {
            // Update the existing opportunity in state
            setOpportunities(prev => prev.map(opp => {
              if (opp.id === payload.new.id) {
                return {
                  ...opp,
                  stage: migrateStage(payload.new.stage) as OpportunityStage,
                  status: payload.new.status as 'active' | 'dead' | undefined,
                  assigned_to: payload.new.assigned_to,
                  sla_status: payload.new.sla_status as 'green' | 'amber' | 'red' | null | undefined,
                  stage_entered_at: payload.new.stage_entered_at,
                  updated_at: payload.new.updated_at,
                };
              }
              return opp;
            }));
          } else if (payload.eventType === 'DELETE') {
            setOpportunities(prev => prev.filter(opp => opp.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const createGatewayOpportunity = async (baseOpportunity: Opportunity) => {
    const { data, error } = await supabase
      .from('opportunities')
      .insert({
        account_id: baseOpportunity.account_id,
        contact_id: baseOpportunity.contact_id,
        stage: 'application_started',
        status: 'active',
        referral_source: baseOpportunity.referral_source || null,
        username: baseOpportunity.username || null,
        processing_services: null,
        value_services: baseOpportunity.value_services?.length ? baseOpportunity.value_services : ['Gateway'],
        timezone: baseOpportunity.timezone || null,
        language: baseOpportunity.language || null,
        agree_to_terms: true,
      })
      .select(`
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
      `)
      .single();

    if (error) throw error;

    const typedOpportunity: Opportunity = {
      ...data,
      stage: migrateStage(data.stage) as OpportunityStage,
      status: data.status as 'active' | 'dead' | undefined,
      account: data.account
        ? {
            ...data.account,
            status: data.account.status as 'active' | 'dead' | undefined,
          }
        : undefined,
      contact: data.contact || undefined,
    };

    setOpportunities((prev) => [typedOpportunity, ...prev]);
    return typedOpportunity;
  };

  const handleConvertToGatewayTrack = async (opportunity: Opportunity) => {
    if (hasGatewayForAccount(opportunity.account_id)) {
      toast({
        title: "Gateway card already exists",
        description: "This account already has an opportunity on the gateway pipeline.",
      });
      return;
    }

    try {
      await createGatewayOpportunity(opportunity);
      toast({
        title: "Gateway card created",
        description: "A new gateway application was added to the pipeline.",
      });
    } catch (error) {
      console.error('Error creating gateway opportunity:', error);
      toast({
        title: "Error",
        description: "Failed to create gateway application",
        variant: "destructive",
      });
    }
  };
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
        sla_status,
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
      // Apply stage migration: 'opportunities' -> 'application_prep'
      stage: migrateStage(item.stage) as OpportunityStage,
      status: item.status as 'active' | 'dead' | undefined,
      sla_status: item.sla_status as 'green' | 'amber' | 'red' | null | undefined,
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

  // Filter opportunities by date range and assignee
  const filteredOpportunities = useMemo(() => {
    let filtered = opportunities;
    
    // Filter by assignee
    if (assigneeFilter === 'mine') {
      filtered = filtered.filter(opp => opp.assigned_to === currentUserDisplayName);
    } else if (assigneeFilter !== 'all') {
      filtered = filtered.filter(opp => opp.assigned_to === assigneeFilter);
    }
    
    // Filter by date range
    if (dateRange?.from) {
      filtered = filtered.filter(opp => {
        const dateValue = new Date(opp[filterBy]);
        const from = startOfDay(dateRange.from!);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
        return isWithinInterval(dateValue, {
          start: from,
          end: to
        });
      });
    }
    
    return filtered;
  }, [opportunities, dateRange, filterBy, assigneeFilter, currentUserDisplayName]);
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
        processing_services: formData.serviceType === 'processing' && formData.processingServices.length > 0
          ? formData.processingServices
          : formData.serviceType === 'gateway_only' ? [] : null,
        value_services: formData.valueServices
          ? [formData.valueServices]
          : formData.serviceType === 'gateway_only'
            ? ['Gateway']
            : null,
        timezone: formData.timezone || null,
        language: formData.language || null,
        agree_to_terms: true
      }).select('id').single();
      if (opportunityError) throw opportunityError;
      
      // Log opportunity creation activity
      const { data: oppData } = await supabase
        .from('opportunities')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (oppData) {
        await supabase.from('activities').insert({
          opportunity_id: oppData.id,
          type: 'opportunity_created',
          description: `Opportunity created for ${formData.companyName}`,
          user_id: user?.id,
          user_email: user?.email,
        });
      }
      
      await fetchOpportunities();
      setSplashType("1up");
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
    if (updates.service_type) dbUpdates.service_type = updates.service_type;
    if (updates.processing_services !== undefined) dbUpdates.processing_services = updates.processing_services;
    if (updates.value_services !== undefined) dbUpdates.value_services = updates.value_services;
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

    // Log stage change activity and show level up splash
    if (updates.stage && opportunity && opportunity.stage !== updates.stage) {
      setSplashType("level-up");
      await supabase.from('activities').insert({
        opportunity_id: id,
        type: 'stage_change',
        description: `Moved from ${opportunity.stage} to ${updates.stage}`,
        user_id: user?.id,
        user_email: user?.email
      });

      // Send email notification for stage change
      if (opportunity.assigned_to) {
        sendStageChangeEmail(
          opportunity.assigned_to,
          opportunity.account?.name || 'Unknown Account',
          opportunity.stage,
          updates.stage,
          user?.email
        ).catch(err => console.error("Failed to send stage change email:", err));
      }
    }

    if (
      updates.stage === 'processor_approval' &&
      opportunity &&
      !hasGatewayForAccount(opportunity.account_id)
    ) {
      try {
        await createGatewayOpportunity(opportunity);
        toast({
          title: "Gateway card created",
          description: "Approved processing deals now start in the gateway pipeline.",
        });
      } catch (creationError) {
        console.error('Error auto-creating gateway opportunity:', creationError);
        toast({
          title: "Gateway card not created",
          description: "Failed to add the gateway application for this approval.",
          variant: "destructive",
        });
      }
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
  const handleSlaStatusChange = (opportunityId: string, slaStatus: string | null) => {
    setOpportunities(opportunities.map(o => o.id === opportunityId ? {
      ...o,
      sla_status: slaStatus as 'green' | 'amber' | 'red' | null
    } : o));
  };
  const handleMarkAsDead = (id: string) => {
    setOpportunities(opportunities.filter(o => o.id !== id));
  };
  const handleDelete = (id: string) => {
    setOpportunities(opportunities.filter(o => o.id !== id));
  };
  
  const handleMoveToProcessing = async (opportunity: Opportunity) => {
    try {
      // Update to processing pipeline by setting processing_services
      const { error } = await supabase
        .from('opportunities')
        .update({ processing_services: ['Credit Card'] })
        .eq('id', opportunity.id);
      
      if (error) throw error;
      
      // Log activity
      await supabase.from('activities').insert({
        opportunity_id: opportunity.id,
        type: 'pipeline_change',
        description: 'Moved from Gateway to Processing pipeline',
        user_id: user?.id,
        user_email: user?.email,
      });
      
      // Update local state
      setOpportunities(opportunities.map(o => 
        o.id === opportunity.id 
          ? { ...o, processing_services: ['Credit Card'] }
          : o
      ));
    } catch (error) {
      console.error('Error moving to processing:', error);
      toast({
        title: "Error",
        description: "Failed to move to processing pipeline",
        variant: "destructive",
      });
    }
  };
  if (loading) {
    return <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>;
  }
  return (
    <AppLayout onNewApplication={() => setIsModalOpen(true)}>
      <div className="flex-1 flex flex-col gap-2 sm:gap-3 p-2 sm:p-3 lg:p-4 min-h-0 overflow-hidden mobile-landscape:gap-2">
        <header className="h-12 flex items-center px-4 rounded-lg border shadow-lg backdrop-blur-md gap-2 flex-shrink-0 sticky top-0 z-20 border-primary bg-card/70 dark:bg-card/70">
          <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
          <div className="ml-auto flex items-center gap-2">
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-background border-border">
                <User className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Filter by..." />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All Cards</SelectItem>
                <SelectItem value="mine">My Cards</SelectItem>
                {TEAM_MEMBERS.map((member) => (
                  <SelectItem key={member} value={member}>
                    {member}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} filterBy={filterBy} onFilterByChange={setFilterBy} />
          </div>
        </header>
        <main className="flex-1 flex flex-col overflow-hidden rounded-lg border border-border/50 shadow-lg backdrop-blur-md min-h-0 bg-card/70 dark:bg-card/70">
          <DualPipelineBoard
            opportunities={filteredOpportunities}
            onUpdateOpportunity={handleUpdateOpportunity}
            onAssignmentChange={handleAssignmentChange}
            onSlaStatusChange={handleSlaStatusChange}
            onAddNew={() => setIsModalOpen(true)}
            onMarkAsDead={handleMarkAsDead}
            onDelete={handleDelete}
            onConvertToGateway={handleConvertToGatewayTrack}
            onMoveToProcessing={handleMoveToProcessing}
          />
        </main>
      </div>

      <NewApplicationModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleNewApplication} />
      
      <GameSplash
        type={splashType || "1up"}
        show={splashType !== null}
        onComplete={() => setSplashType(null)}
      />
    </AppLayout>
  );
};
export default Index;