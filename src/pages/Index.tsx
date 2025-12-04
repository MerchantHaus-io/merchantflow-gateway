import { useState } from "react";
import Navbar from "@/components/Navbar";
import PipelineBoard from "@/components/PipelineBoard";
import NewApplicationModal from "@/components/NewApplicationModal";
import { Merchant } from "@/types/merchant";
import { sampleMerchants } from "@/data/sampleMerchants";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [merchants, setMerchants] = useState<Merchant[]>(sampleMerchants);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const handleNewApplication = (merchantData: Omit<Merchant, 'id' | 'createdAt'>) => {
    const newMerchant: Merchant = {
      ...merchantData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    setMerchants([...merchants, newMerchant]);
    toast({
      title: "Application Added",
      description: `${newMerchant.businessName} has been added to the pipeline.`,
    });
  };

  const handleUpdateMerchant = (id: string, updates: Partial<Merchant>) => {
    setMerchants(
      merchants.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

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
