import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import PipelineBoard from "@/components/PipelineBoard";
import NewApplicationModal, { ApplicationFormData } from "@/components/NewApplicationModal";
import { Merchant, PipelineStage } from "@/types/merchant";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load merchants",
        variant: "destructive",
      });
      return;
    }

    const mapped: Merchant[] = (data || []).map((m) => ({
      id: m.id,
      businessName: m.company || m.lead_name,
      contactName: m.lead_name,
      email: m.email || '',
      phone: m.phone || '',
      monthlyVolume: 0,
      businessType: 'General',
      stage: m.stage as PipelineStage,
      createdAt: new Date(m.created_at),
      notes: m.notes || undefined,
      assignedTo: m.assigned_to || undefined,
    }));

    setMerchants(mapped);
    setLoading(false);
  };

  const handleNewApplication = async (formData: ApplicationFormData) => {
    const leadName = `${formData.firstName} ${formData.lastName}`.trim();
    
    const { data, error } = await supabase
      .from('merchants')
      .insert({
        lead_name: leadName,
        company: formData.companyName,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        fax: formData.fax || null,
        address: formData.address || null,
        address2: formData.address2 || null,
        city: formData.city || null,
        state: formData.state || null,
        zip: formData.zip || null,
        country: formData.country || null,
        website: formData.website || null,
        username: formData.username || null,
        processing_services: formData.processingServices.length > 0 ? formData.processingServices : null,
        value_services: formData.valueServices || null,
        timezone: formData.timezone || null,
        language: formData.language || null,
        stage: 'lead',
        assigned_to: 'Wesley',
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add application",
        variant: "destructive",
      });
      return;
    }

    const newMerchant: Merchant = {
      id: data.id,
      businessName: data.company || data.lead_name,
      contactName: data.lead_name,
      email: data.email || '',
      phone: data.phone || '',
      monthlyVolume: 0,
      businessType: 'General',
      stage: data.stage as PipelineStage,
      createdAt: new Date(data.created_at),
      notes: data.notes || undefined,
      assignedTo: data.assigned_to || undefined,
    };

    setMerchants([newMerchant, ...merchants]);
    toast({
      title: "Application Added",
      description: `${newMerchant.businessName} has been added to the pipeline.`,
    });
  };

  const handleUpdateMerchant = async (id: string, updates: Partial<Merchant>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.stage) dbUpdates.stage = updates.stage;
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

    const { error } = await supabase
      .from('merchants')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update merchant",
        variant: "destructive",
      });
      return;
    }

    setMerchants(
      merchants.map((m) => (m.id === id ? { ...m, ...updates } : m))
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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Navbar onNewApplication={() => setIsModalOpen(true)} />
      
      <PipelineBoard 
        merchants={merchants} 
        onUpdateMerchant={handleUpdateMerchant} 
      />
      
      <NewApplicationModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNewApplication}
      />
    </div>
  );
};

export default Index;
