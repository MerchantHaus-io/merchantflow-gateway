import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import UnifiedPipelineBoard from "@/components/UnifiedPipelineBoard";
import { PortalActivationDialog } from "@/components/opportunity-detail/PortalActivationDialog";
import NewApplicationModal, { ApplicationFormData } from "@/components/NewApplicationModal";
import { AppLayout } from "@/components/AppLayout";
import { ACTIVE_PIPELINE_STAGES, getServiceType, ServiceType, OnboardingWizardState, Opportunity, OpportunityStage, OutcomeStatus, migrateStage, STAGE_CONFIG, EMAIL_TO_USER, TEAM_MEMBERS } from "@/types/opportunity";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import DateRangeFilter from "@/components/DateRangeFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, ExternalLink, Kanban, Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scopingLink } from "@/config/scopingFields";
import { PageHeader } from "@/components/PageHeader";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
import GameSplash from "@/components/GameSplash";
import { sendStageChangeEmail } from "@/hooks/useEmailNotifications";
import { useTheme } from "@/contexts/ThemeContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsMobile } from "@/hooks/use-mobile";

const Starfield = lazy(() => import("@/components/Starfield"));

// Canonical snake_case wizard form matching normalized schema
type WizardPrefillForm = {
  dba_name: string;
  product_description: string;
  nature_of_business: string;
  dba_contact_first_name: string;
  dba_contact_last_name: string;
  dba_contact_phone: string;
  dba_contact_email: string;
  dba_address_line1: string;
  dba_address_line2: string;
  dba_city: string;
  dba_state: string;
  dba_zip: string;
  legal_entity_name: string;
  federal_tax_id: string;
  ownership_type: string;
  business_formation_date: string;
  state_incorporated: string;
  legal_address_line1: string;
  legal_address_line2: string;
  legal_city: string;
  legal_state: string;
  legal_zip: string;
  monthly_volume: string;
  average_transaction: string;
  high_ticket: string;
  percent_swiped: string;
  percent_keyed: string;
  percent_moto: string;
  percent_ecommerce: string;
  percent_b2c: string;
  percent_b2b: string;
  sic_mcc_code: string;
  website_url: string;
  username: string;
  current_processor: string;
  documents: any[];
  notes: string;
};

const WIZARD_REQUIRED_FIELDS: Record<
  "business" | "legal" | "processing" | "documents" | "gateway_business",
  (keyof WizardPrefillForm)[]
> = {
  business: [
    "dba_name", "product_description", "nature_of_business",
    "dba_contact_first_name", "dba_contact_last_name",
    "dba_contact_phone", "dba_contact_email",
    "dba_address_line1", "dba_city", "dba_state", "dba_zip",
  ],
  legal: [
    "legal_entity_name", "federal_tax_id", "ownership_type",
    "business_formation_date", "state_incorporated",
    "legal_address_line1", "legal_city", "legal_state", "legal_zip",
  ],
  processing: [
    "monthly_volume", "average_transaction", "high_ticket",
    "percent_swiped", "percent_keyed", "percent_moto", "percent_ecommerce",
    "percent_b2c", "percent_b2b",
  ],
  documents: ["documents"],
  gateway_business: [
    "dba_name", "dba_contact_first_name", "dba_contact_last_name",
    "dba_contact_phone", "dba_contact_email",
    "dba_address_line1", "dba_city", "dba_state", "dba_zip",
    "username", "current_processor",
  ],
};

const createWizardFormFromOpportunity = (opportunity: Opportunity): WizardPrefillForm => {
  const account = opportunity.account;
  const contact = opportunity.contact;

  return {
    dba_name: account?.name || "",
    product_description: "",
    nature_of_business: "",
    dba_contact_first_name: contact?.first_name || "",
    dba_contact_last_name: contact?.last_name || "",
    dba_contact_phone: contact?.phone || "",
    dba_contact_email: contact?.email || "",
    dba_address_line1: account?.address1 || "",
    dba_address_line2: account?.address2 || "",
    dba_city: account?.city || "",
    dba_state: account?.state || "",
    dba_zip: account?.zip || "",
    legal_entity_name: account?.name || "",
    federal_tax_id: "",
    ownership_type: "",
    business_formation_date: "",
    state_incorporated: account?.state || "",
    legal_address_line1: account?.address1 || "",
    legal_address_line2: account?.address2 || "",
    legal_city: account?.city || "",
    legal_state: account?.state || "",
    legal_zip: account?.zip || "",
    monthly_volume: "",
    average_transaction: "",
    high_ticket: "",
    percent_swiped: "",
    percent_keyed: "",
    percent_moto: "",
    percent_ecommerce: "",
    percent_b2c: "",
    percent_b2b: "",
    sic_mcc_code: "",
    website_url: account?.website || "",
    username: opportunity.username || "",
    current_processor: "",
    documents: [],
    notes: "",
  };
};

const calculateWizardProgress = (form: WizardPrefillForm, isGatewayOnly: boolean) => {
  const getMissingFieldsForSection = (section: keyof typeof WIZARD_REQUIRED_FIELDS) =>
    WIZARD_REQUIRED_FIELDS[section].filter((field) => {
      const value = form[field];
      if (Array.isArray(value)) return value.length === 0;
      return `${value}`.trim() === "";
    });

  if (isGatewayOnly) {
    const gwMissing = getMissingFieldsForSection("gateway_business");
    const total = WIZARD_REQUIRED_FIELDS.gateway_business.length;
    return Math.round(((total - gwMissing.length) / total) * 100);
  }

  const missingBySection = {
    business: getMissingFieldsForSection("business"),
    legal: getMissingFieldsForSection("legal"),
    processing: getMissingFieldsForSection("processing"),
    documents: getMissingFieldsForSection("documents"),
  };

  const totalRequiredFields =
    WIZARD_REQUIRED_FIELDS.business.length +
    WIZARD_REQUIRED_FIELDS.legal.length +
    WIZARD_REQUIRED_FIELDS.processing.length + 1;

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
  const { isAdmin } = useUserRole();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBy, setFilterBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [splashType, setSplashType] = useState<"1up" | "level-up" | null>(null);
  const [portalActivationOpp, setPortalActivationOpp] = useState<Opportunity | null>(null);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  /** Same authority the board uses to choose the mobile view, so the page
   *  chrome and the view below it can never disagree about the breakpoint. */
  const isMobile = useIsMobile();

  /**
   * How long a stage change stays provisional.
   *
   * A drag used to be instantly irreversible and externally visible: it wrote
   * the row, logged the activity and emailed the assignee, with no undo and no
   * confirmation. An accidental drag reached a colleague's inbox before the rep
   * had finished noticing it. The database write still happens immediately —
   * the record should be true — but the email waits out this window, and Undo
   * cancels it.
   */
  const UNDO_WINDOW_MS = 5000;
  const pendingStageEmails = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = pendingStageEmails.current;
    // Leaving the page is not consent to send: a queued notification for a move
    // the rep may have undone must not outlive the board.
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);
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
        service_type,
        source,
        portal_merchant_id,
        referral_source,
        username,
        processing_services,
        value_services,
        timezone,
        language,
        assigned_to,
        stage_entered_at,
        sla_status,
        outcome_status,
        outcome_reason,
        outcome_notes,
        outcome_closed_at,
        outcome_closed_by,
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
      service_type: data.service_type as ServiceType | undefined,
      status: data.status as 'active' | 'dead' | 'won' | undefined,
      sla_status: data.sla_status as 'green' | 'amber' | 'red' | null | undefined,
      outcome_status: (data.outcome_status as OutcomeStatus | null) || undefined,
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
                  status: payload.new.status as 'active' | 'dead' | 'won' | undefined,
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
      status: data.status as 'active' | 'dead' | 'won' | undefined,
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
        service_type,
        source,
        portal_merchant_id,
        referral_source,
        username,
        processing_services,
        value_services,
        timezone,
        language,
        assigned_to,
        stage_entered_at,
        sla_status,
        outcome_status,
        outcome_reason,
        outcome_notes,
        outcome_closed_at,
        outcome_closed_by,
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
      service_type: item.service_type as ServiceType | undefined,
      status: item.status as 'active' | 'dead' | 'won' | undefined,
      sla_status: item.sla_status as 'green' | 'amber' | 'red' | null | undefined,
      outcome_status: (item.outcome_status as OutcomeStatus | null) || undefined,
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
              progress: calculateWizardProgress(formState, getServiceType(opportunity) === 'gateway_only'),
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

  // SLA follow-ups are surfaced as notifications only (see sla-escalation edge function).
  // Auto-tasks were too noisy and have been removed from the task system.

  // Filter opportunities by date range and assignee
  const filteredOpportunities = useMemo(() => {
    // Exclude auto-synced email leads — they belong on the Leads page only
    let filtered = opportunities.filter(opp => (opp.account?.status as string) !== 'lead');
    
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
  /** Puts a deal back where it was, and calls off the notification. */
  const undoStageChange = useCallback(
    async (id: string, fromStage: OpportunityStage, toStage: OpportunityStage, accountName: string) => {
      const timer = pendingStageEmails.current.get(id);
      if (timer) {
        clearTimeout(timer);
        pendingStageEmails.current.delete(id);
      }

      setOpportunities(prev => prev.map(o => (o.id === id ? { ...o, stage: fromStage } : o)));

      const { error } = await supabase.from('opportunities').update({ stage: fromStage }).eq('id', id);
      if (error) {
        // The board is now lying about where the deal is; put it back.
        setOpportunities(prev => prev.map(o => (o.id === id ? { ...o, stage: toStage } : o)));
        sonnerToast.error("Couldn't undo that move", { description: `${accountName} is still in ${STAGE_CONFIG[toStage]?.label ?? toStage}.` });
        return;
      }

      // The activity log stays truthful: the move happened, and so did the undo.
      await supabase.from('activities').insert({
        opportunity_id: id,
        type: 'stage_change',
        description: `Undid move from ${fromStage} to ${toStage}`,
        user_id: user?.id,
        user_email: user?.email,
      });
    },
    [user?.id, user?.email],
  );

  const handleUpdateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    const opportunity = opportunities.find(o => o.id === id);

    // Underwriting gate check when moving to underwriting_review
    if (updates.stage === 'underwriting_review' && opportunity) {
      const { checkUnderwritingGate } = await import("@/lib/underwriting-gate");
      const gate = await checkUnderwritingGate(id, opportunity.service_type);
      if (!gate.allowed) {
        toast({ title: "Cannot proceed to Underwriting", description: gate.reason, variant: "destructive", duration: 6000 });
        return;
      }
    }

    // Duplicate check when moving past discovery
    if (updates.stage && updates.stage !== 'discovery' && opportunity?.stage === 'discovery') {
      const { checkDuplicateMerchant } = await import("@/lib/duplicate-check");
      const dupWarning = await checkDuplicateMerchant(id);
      if (dupWarning) {
        toast({ title: "Duplicate Warning", description: dupWarning, variant: "destructive", duration: 8000 });
        // Warning only — don't block, just inform
      }
    }

    // Everything that could refuse the move has now spoken, so show it. The
    // card used to sit in its old column through a dynamic import, two gate
    // queries, the UPDATE and an activity insert — long enough that the rep's
    // first instinct was to drag it again.
    const isStageMove = Boolean(updates.stage && opportunity && opportunity.stage !== updates.stage);
    const previousStage = opportunity?.stage;
    if (isStageMove) {
      setOpportunities(prev => prev.map(o => (o.id === id ? { ...o, ...updates } : o)));
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.stage) dbUpdates.stage = updates.stage;
    if (updates.service_type) dbUpdates.service_type = updates.service_type;
    if (updates.processing_services !== undefined) dbUpdates.processing_services = updates.processing_services;
    if (updates.value_services !== undefined) dbUpdates.value_services = updates.value_services;
    if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to || null;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.outcome_status !== undefined) dbUpdates.outcome_status = updates.outcome_status;
    if (updates.outcome_reason !== undefined) dbUpdates.outcome_reason = updates.outcome_reason;
    if (updates.outcome_notes !== undefined) dbUpdates.outcome_notes = updates.outcome_notes;
    if (updates.outcome_closed_at !== undefined) dbUpdates.outcome_closed_at = updates.outcome_closed_at;
    if (updates.outcome_closed_by !== undefined) dbUpdates.outcome_closed_by = updates.outcome_closed_by;
    if (updates.username !== undefined) dbUpdates.username = updates.username || null;
    if (updates.referral_source !== undefined) dbUpdates.referral_source = updates.referral_source || null;
    if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone || null;
    if (updates.language !== undefined) dbUpdates.language = updates.language || null;

    // Only write to DB if there are actual opportunity-level changes
    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('opportunities').update(dbUpdates).eq('id', id);
      if (error) {
        // Roll the optimistic move back rather than leaving the board showing a
        // position the database never accepted.
        if (isStageMove && previousStage) {
          setOpportunities(prev => prev.map(o => (o.id === id ? { ...o, stage: previousStage } : o)));
        }
        toast({
          title: "Error",
          description: "Failed to update opportunity",
          variant: "destructive"
        });
        return;
      }
    }

    if (isStageMove && updates.stage && opportunity && previousStage) {
      const accountName = opportunity.account?.name || 'Unknown Account';
      const movedForward =
        ACTIVE_PIPELINE_STAGES.indexOf(updates.stage) > ACTIVE_PIPELINE_STAGES.indexOf(previousStage);

      // Only a promotion is a level up. The splash fired on any stage change at
      // all, so dragging a deal backwards out of Underwriting played the same
      // celebration as closing it.
      if (movedForward) setSplashType("level-up");

      await supabase.from('activities').insert({
        opportunity_id: id,
        type: 'stage_change',
        description: `Moved from ${previousStage} to ${updates.stage}`,
        user_id: user?.id,
        user_email: user?.email
      });

      // Held for the undo window instead of sent immediately, so an accidental
      // drag stays inside the building.
      if (opportunity.assigned_to) {
        const assignee = opportunity.assigned_to;
        const from = previousStage;
        const to = updates.stage;
        const existing = pendingStageEmails.current.get(id);
        if (existing) clearTimeout(existing);
        pendingStageEmails.current.set(
          id,
          setTimeout(() => {
            pendingStageEmails.current.delete(id);
            sendStageChangeEmail(assignee, accountName, from, to, user?.email)
              .catch(err => console.error("Failed to send stage change email:", err));
          }, UNDO_WINDOW_MS),
        );
      }

      // A custom toast rather than the default one, for the countdown: a
      // five-second reprieve the rep cannot see is one they will not use. The
      // bar runs for exactly the window that holds the email back.
      const stageLabel = STAGE_CONFIG[updates.stage]?.label ?? updates.stage;
      const assignee = opportunity.assigned_to;
      sonnerToast.custom(
        (id_) => (
          <div className="relative overflow-hidden w-full rounded-lg border border-border bg-background shadow-lg pl-3.5 pr-2 py-2.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-tight">
                  <span className="font-semibold">{accountName}</span> moved to {stageLabel}
                </p>
                {assignee && (
                  <p className="text-[11.5px] text-muted-foreground leading-tight mt-0.5">
                    Notifying {assignee} when this bar runs out.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  sonnerToast.dismiss(id_);
                  void undoStageChange(id, previousStage, updates.stage as OpportunityStage, accountName);
                }}
                className="shrink-0 min-h-[34px] px-3 rounded-md border border-border text-[12px] font-semibold hover:bg-accent/20 transition-colors"
              >
                Undo
              </button>
            </div>
            <span
              aria-hidden="true"
              className="undo-countdown absolute bottom-0 left-0 h-[2px] w-full bg-[hsl(var(--gold))]"
              style={{ animationDuration: `${UNDO_WINDOW_MS}ms` }}
            />
          </div>
        ),
        { duration: UNDO_WINDOW_MS },
      );
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

    // Portal activation trigger when moving to go_live_ready
    if (updates.stage === 'go_live_ready' && opportunity?.portal_merchant_id) {
      const { data: boarding } = await supabase
        .from('nmi_boarding_submissions')
        .select('nmi_gateway_id')
        .eq('opportunity_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: acctData } = await supabase
        .from('accounts')
        .select('nmi_merchant_id')
        .eq('id', opportunity.account_id)
        .maybeSingle();

      const gatewayId = boarding?.nmi_gateway_id ?? acctData?.nmi_merchant_id ?? null;

      setPortalActivationOpp({ ...opportunity, ...updates, _prefillGatewayId: gatewayId } as any);
    }

    setOpportunities(prev => prev.map(o => o.id === id ? {
      ...o,
      ...updates
    } : o));
  };
  const handleAssignmentChange = (opportunityId: string, assignedTo: string | null) => {
    setOpportunities(prev => prev.map(o => o.id === opportunityId ? {
      ...o,
      assigned_to: assignedTo || undefined
    } : o));
  };
  const handleSlaStatusChange = (opportunityId: string, slaStatus: string | null) => {
    setOpportunities(prev => prev.map(o => o.id === opportunityId ? {
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
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading pipeline…</p>
          </div>
        </div>
      </AppLayout>
    );
  }
  return (
      <AppLayout onNewApplication={() => setIsModalOpen(true)}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Desktop only. On a phone this header cost ~340px — an orb, a title
              the bottom nav already tells you, and a filter row that wrapped
              onto two lines — before the rep saw a single deal. MobilePipeline
              opens on "Today · N need you" and carries the two controls worth
              keeping. */}
          {!isMobile && (
          <PageHeader
            icon={Kanban}
            title="Pipeline"
            color="primary"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <span className="hidden sm:inline-flex items-center text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {filteredOpportunities.length} deals
                </span>
                <a
                  href="/merchant-apply"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Merchant Application
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(scopingLink());
                    toast({ title: "Scoping link copied" });
                  }}
                  className="hidden md:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy scoping link
                </button>
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
                <Button size="sm" onClick={() => setIsModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> New Application
                </Button>
              </div>
            }
          />
          )}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-2 sm:p-3 lg:p-4">
            <UnifiedPipelineBoard
              opportunities={filteredOpportunities}
              onUpdateOpportunity={handleUpdateOpportunity}
              onAssignmentChange={handleAssignmentChange}
              onSlaStatusChange={handleSlaStatusChange}
              onAddNew={() => setIsModalOpen(true)}
              onMarkAsDead={handleMarkAsDead}
              onDelete={handleDelete}
              onConvertToGateway={handleConvertToGatewayTrack}
              onMoveToProcessing={handleMoveToProcessing}
              onRefresh={fetchOpportunities}
              assigneeFilter={assigneeFilter}
              onAssigneeFilterChange={setAssigneeFilter}
              currentUser={currentUserDisplayName || undefined}
              isAdmin={isAdmin}
            />
          </main>
        </div>

      <NewApplicationModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleNewApplication} />

      {/* Portal Activation Dialog — triggered by stage change to go_live_ready */}
      {portalActivationOpp?.portal_merchant_id && (
        <PortalActivationDialog
          open={!!portalActivationOpp}
          onOpenChange={(open) => { if (!open) setPortalActivationOpp(null); }}
          opportunityId={portalActivationOpp.id}
          portalMerchantId={portalActivationOpp.portal_merchant_id}
          accountName={portalActivationOpp.account?.name}
          prefillGatewayId={(portalActivationOpp as any)._prefillGatewayId}
          onSuccess={() => {
            setPortalActivationOpp(null);
            fetchOpportunities();
          }}
          onDeferActivation={() => setPortalActivationOpp(null)}
        />
      )}

      <GameSplash
        type={splashType || "1up"}
        show={splashType !== null}
        onComplete={() => setSplashType(null)}
      />
    </AppLayout>
  );
};
export default Index;