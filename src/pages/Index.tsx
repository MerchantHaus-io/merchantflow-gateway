import { useState, useEffect } from "react";
import PipelineBoard from "@/components/PipelineBoard";
import NewApplicationModal, { ApplicationFormData } from "@/components/NewApplicationModal";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Opportunity, OpportunityStage } from "@/types/opportunity";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
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
    }));

    setOpportunities(typedData);
    setLoading(false);
  };

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
        account,
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar onNewApplication={() => setIsModalOpen(true)} />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-6 border-b border-border">
            <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
          </header>
          <main className="flex-1 overflow-hidden">
            <PipelineBoard 
              opportunities={opportunities} 
              onUpdateOpportunity={handleUpdateOpportunity}
              onAssignmentChange={handleAssignmentChange}
            />
          </main>
        </SidebarInset>
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
