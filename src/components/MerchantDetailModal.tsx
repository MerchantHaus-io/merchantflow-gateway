import { Building2, Mail, Phone, DollarSign, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Merchant, STAGE_CONFIG } from "@/types/merchant";

interface MerchantDetailModalProps {
  merchant: Merchant | null;
  onClose: () => void;
  onUpdate: (updates: Partial<Merchant>) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
};

const MerchantDetailModal = ({ merchant, onClose }: MerchantDetailModalProps) => {
  if (!merchant) return null;

  const config = STAGE_CONFIG[merchant.stage];

  return (
    <Dialog open={!!merchant} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary p-2.5 rounded-lg">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">{merchant.businessName}</DialogTitle>
                <p className="text-sm text-muted-foreground">{merchant.contactName}</p>
              </div>
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Badge className={`${config.colorClass} text-primary-foreground`}>
              {config.label}
            </Badge>
            <Badge variant="outline">{merchant.businessType}</Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="h-4 w-4" />
                <span>Monthly Volume</span>
              </div>
              <p className="font-semibold text-foreground">
                {formatCurrency(merchant.monthlyVolume)}
              </p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="h-4 w-4" />
                <span>Created</span>
              </div>
              <p className="font-semibold text-foreground">
                {formatDate(merchant.createdAt)}
              </p>
            </div>
          </div>
          
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${merchant.email}`} className="text-sm text-primary hover:underline">
                {merchant.email}
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${merchant.phone}`} className="text-sm text-primary hover:underline">
                {merchant.phone}
              </a>
            </div>
          </div>
          
          {merchant.notes && (
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground">{merchant.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MerchantDetailModal;
