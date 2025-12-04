import { Building2, DollarSign, Phone, Mail, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Merchant } from "@/types/merchant";

interface MerchantCardProps {
  merchant: Merchant;
  onDragStart: (e: React.DragEvent, merchant: Merchant) => void;
  onClick: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const MerchantCard = ({ merchant, onDragStart, onClick }: MerchantCardProps) => {
  return (
    <Card 
      draggable
      onDragStart={(e) => onDragStart(e, merchant)}
      onClick={onClick}
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 group border-border/60"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-1.5 rounded">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground line-clamp-1">
              {merchant.businessName}
            </h3>
          </div>
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <p className="text-sm text-muted-foreground mb-3">{merchant.contactName}</p>
        
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span>{formatCurrency(merchant.monthlyVolume)}/mo</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{merchant.email}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>{merchant.phone}</span>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            {merchant.businessType}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default MerchantCard;
