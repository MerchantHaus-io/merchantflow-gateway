import { useState, useEffect, useMemo } from "react";
import PipelineBoard from "@/components/PipelineBoard";
import NewApplicationModal, { ApplicationFormData } from "@/components/NewApplicationModal";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Opportunity, OpportunityStage } from "@/types/opportunity";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DateRangeFilter from "@/components/DateRangeFilter";
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";

const Index = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBy, setFilterBy] = useState<'created_at' | 'updated_at'>('created_at');
  const { toast } = useToast();

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        *,
        account:accounts(*),
        contact:contacts(*)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load opportunities",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const typedData = (data || []).map(item => ({
      ...item,
      stage: item.stage as OpportunityStage,
      status: item.status as 'active' | 'dead' | undefined,
      account: item.account ? {
        ...item.account,
        status: item.account.status as 'active' | 'dead' | undefined,
      } : undefined,
    }));

    setOpportunities(typedData);
    setLoading(false);
  };

  // Filter opportunities by date range
  const filteredOpportunities = useMemo(() => {
    if (!dateRange?.from) return opportunities;
    
    return opportunities.filter(opp => {
      const dateValue = new Date(opp[filterBy]);
      const from = startOfDay(dateRange.from!);
      const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
      return isWithinInterval(dateValue, { start: from, end: to });
    });
  }, [opportunities, dateRange, filterBy]);

  const handleNewApplication = async (formData: ApplicationFormData) => {
    try {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({
          name: formData.companyName,
          address1: formData.address || null,
          address2: formData.address2 || null,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          country: formData.country || null,
          website: formData.website || null,
        })
        .select()
        .single();

      if (accountError) throw accountError;

      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          account_id: account.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          fax: formData.fax || null,
        })
        .select()
        .single();

      if (contactError) throw contactError;

      const { data: opportunity, error: opportunityError } = await supabase
        .from('opportunities')
        .insert({
          account_id: account.id,
          contact_id: contact.id,
          stage: 'application_started',
          referral_source: formData.referralSource || null,
          username: formData.username || null,
          processing_services: formData.processingServices.length > 0 ? formData.processingServices : null,
          value_services: formData.valueServices ? [formData.valueServices] : null,
          timezone: formData.timezone || null,
          language: formData.language || null,
          agree_to_terms: true,
        })
        .select()
        .single();

      if (opportunityError) throw opportunityError;

      const newOpportunity: Opportunity = {
        ...opportunity,
        stage: opportunity.stage as OpportunityStage,
        status: opportunity.status as 'active' | 'dead' | undefined,
        account: {
          ...account,
          status: account.status as 'active' | 'dead' | undefined,
        },
        contact,
      };

      setOpportunities([newOpportunity, ...opportunities]);
      toast({
        title: "Application Added",
        description: `${account.name} has been added to the pipeline.`,
      });
    } catch (error) {
      console.error('Error creating application:', error);
      toast({
        title: "Error",
        description: "Failed to add application",
        variant: "destructive",
      });
    }
  };

  const handleUpdateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    const opportunity = opportunities.find(o => o.id === id);
    const dbUpdates: Record<string, unknown> = {};
    if (updates.stage) dbUpdates.stage = updates.stage;

    const { error } = await supabase
      .from('opportunities')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update opportunity",
        variant: "destructive",
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
        user_email: user?.email,
      });
    }

    setOpportunities(
      opportunities.map((o) => (o.id === id ? { ...o, ...updates } : o))
    );
  };

  const handleAssignmentChange = (opportunityId: string, assignedTo: string | null) => {
    setOpportunities(
      opportunities.map((o) => 
        o.id === opportunityId ? { ...o, assigned_to: assignedTo || undefined } : o
      )
    );
  };

  const handleMarkAsDead = (id: string) => {
    setOpportunities(opportunities.filter(o => o.id !== id));
  };

  const handleDelete = (id: string) => {
    setOpportunities(opportunities.filter(o => o.id !== id));
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full p-4 gap-4 pb-20">
        <AppSidebar onNewApplication={() => setIsModalOpen(true)} />
        <div className="flex-1 flex flex-col overflow-hidden gap-3 max-h-[calc(100vh-7rem)]">
          <header 
            className="h-12 flex items-center px-4 rounded-lg border border-border/50 shadow-lg backdrop-blur-md gap-2 flex-shrink-0"
            style={{ backgroundColor: 'hsl(217 33% 17% / 0.7)' }}
          >
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
            <div className="ml-auto">
              <DateRangeFilter
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                filterBy={filterBy}
                onFilterByChange={setFilterBy}
              />
            </div>
          </header>
          <main 
            className="flex-1 overflow-hidden rounded-lg border border-border/50 shadow-lg backdrop-blur-md min-h-0"
            style={{ backgroundColor: 'hsl(217 33% 17% / 0.7)' }}
          >
            <PipelineBoard 
              opportunities={filteredOpportunities} 
              onUpdateOpportunity={handleUpdateOpportunity}
              onAssignmentChange={handleAssignmentChange}
              onAddNew={() => setIsModalOpen(true)}
              onMarkAsDead={handleMarkAsDead}
              onDelete={handleDelete}
            />
          </main>
        </div>
      </div>
      
      <NewApplicationModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNewApplication}
      />
    </SidebarProvider>
  );
};

export default Index;
