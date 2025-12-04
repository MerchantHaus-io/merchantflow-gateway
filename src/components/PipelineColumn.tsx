import { Merchant, PipelineStage, STAGE_CONFIG } from "@/types/merchant";
import MerchantCard from "./MerchantCard";

interface PipelineColumnProps {
  stage: PipelineStage;
  merchants: Merchant[];
  onDragStart: (e: React.DragEvent, merchant: Merchant) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, stage: PipelineStage) => void;
  onCardClick: (merchant: Merchant) => void;
  onAssign: (merchantId: string, assignedTo: string) => void;
}

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount}`;
};

const PipelineColumn = ({ 
  stage, 
  merchants, 
  onDragStart, 
  onDragOver, 
  onDrop,
  onCardClick,
  onAssign
}: PipelineColumnProps) => {
  const config = STAGE_CONFIG[stage];
  const totalVolume = merchants.reduce((sum, m) => sum + m.monthlyVolume, 0);

  return (
    <div 
      className="flex-shrink-0 w-72 flex flex-col bg-muted/50 rounded-xl"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage)}
    >
      <div className={`p-4 border-b border-border/50 border-t-4 rounded-t-xl ${config.colorClass}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm text-foreground">{config.label}</h2>
          </div>
          <span className="bg-card text-muted-foreground text-xs font-medium px-2 py-0.5 rounded-full">
            {merchants.length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {formatCurrency(totalVolume)} monthly volume
          </p>
          <span className="text-xs text-foreground/80 font-medium">
            {config.defaultOwner}
          </span>
        </div>
      </div>
      
      <div className="flex-1 p-3 space-y-3 overflow-y-auto min-h-0">
        {merchants.map((merchant) => (
          <MerchantCard 
            key={merchant.id} 
            merchant={merchant}
            onDragStart={onDragStart}
            onClick={() => onCardClick(merchant)}
            onAssign={onAssign}
          />
        ))}
        
        {merchants.length === 0 && (
          <div className="flex items-center justify-center h-32 border-2 border-dashed border-border/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Drop applications here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PipelineColumn;
