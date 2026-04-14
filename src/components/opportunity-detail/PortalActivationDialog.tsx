import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface PortalActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  portalMerchantId: string;
  accountName?: string;
  onSuccess?: () => void;
}

export const PortalActivationDialog = ({
  open,
  onOpenChange,
  opportunityId,
  portalMerchantId,
  accountName,
  onSuccess,
}: PortalActivationDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [nmiApiKey, setNmiApiKey] = useState("");
  const [nmiPublicKey, setNmiPublicKey] = useState("");
  const [nmiGatewayId, setNmiGatewayId] = useState("");
  const [pricingModel, setPricingModel] = useState<string>("");

  // Auto-fill from NMI boarding submission
  useEffect(() => {
    if (!open || !opportunityId) return;

    const fetchBoardingData = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("nmi_boarding_submissions")
          .select("nmi_gateway_id, nmi_status")
          .eq("opportunity_id", opportunityId)
          .eq("nmi_status", "approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data?.nmi_gateway_id) {
          setNmiGatewayId(data.nmi_gateway_id);
        }
      } catch (err) {
        console.error("Failed to fetch boarding data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBoardingData();
  }, [open, opportunityId]);

  const resetForm = useCallback(() => {
    setNmiApiKey("");
    setNmiPublicKey("");
    setNmiGatewayId("");
    setPricingModel("");
  }, []);

  const handleClose = useCallback(
    (val: boolean) => {
      if (!val) resetForm();
      onOpenChange(val);
    },
    [onOpenChange, resetForm]
  );

  const handleSubmit = async () => {
    if (!nmiApiKey || !nmiPublicKey || !pricingModel) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "activate-portal-merchant",
        {
          body: {
            portal_merchant_id: portalMerchantId,
            nmi_api_key: nmiApiKey,
            nmi_public_key: nmiPublicKey,
            nmi_gateway_id: nmiGatewayId || undefined,
            pricing_model: pricingModel,
          },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Log activity
      await supabase.from("activities").insert({
        opportunity_id: opportunityId,
        type: "portal_activated",
        description: `Merchant activated on portal (${pricingModel}) by ${user?.email}`,
        user_id: user?.id,
        user_email: user?.email,
      });

      toast.success("Merchant activated on portal successfully");
      handleClose(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Portal activation error:", err);
      toast.error(err.message || "Failed to activate merchant on portal");
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = nmiApiKey && nmiPublicKey && pricingModel;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Activate on Portal
          </DialogTitle>
          <DialogDescription>
            Push NMI credentials to the merchant portal and activate{" "}
            <span className="font-medium text-foreground">
              {accountName || "this merchant"}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Portal Merchant ID — read-only */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Portal Merchant ID
              </Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {portalMerchantId.slice(0, 8)}…
                </Badge>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
            </div>

            {/* NMI Gateway ID — auto-filled if available */}
            <div className="space-y-1.5">
              <Label htmlFor="nmi-gateway-id" className="text-xs">
                NMI Gateway ID
                <span className="text-muted-foreground ml-1">(optional)</span>
              </Label>
              <Input
                id="nmi-gateway-id"
                value={nmiGatewayId}
                onChange={(e) => setNmiGatewayId(e.target.value)}
                placeholder="e.g. 123456789"
                className="font-mono"
              />
              {nmiGatewayId && (
                <p className="text-[11px] text-emerald-500">
                  Auto-filled from NMI boarding
                </p>
              )}
            </div>

            {/* NMI API Key */}
            <div className="space-y-1.5">
              <Label htmlFor="nmi-api-key" className="text-xs">
                NMI API Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nmi-api-key"
                value={nmiApiKey}
                onChange={(e) => setNmiApiKey(e.target.value)}
                placeholder="Merchant's NMI security key"
                className="font-mono"
              />
            </div>

            {/* NMI Public Key */}
            <div className="space-y-1.5">
              <Label htmlFor="nmi-public-key" className="text-xs">
                NMI Public Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nmi-public-key"
                value={nmiPublicKey}
                onChange={(e) => setNmiPublicKey(e.target.value)}
                placeholder="Merchant's NMI public key"
                className="font-mono"
              />
            </div>

            {/* Pricing Model */}
            <div className="space-y-1.5">
              <Label htmlFor="pricing-model" className="text-xs">
                Pricing Model <span className="text-destructive">*</span>
              </Label>
              <Select value={pricingModel} onValueChange={setPricingModel}>
                <SelectTrigger id="pricing-model">
                  <SelectValue placeholder="Select pricing model" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="interchange_plus">
                    Interchange Plus
                  </SelectItem>
                  <SelectItem value="flat_rate">Flat Rate</SelectItem>
                  <SelectItem value="tiered">Tiered</SelectItem>
                  <SelectItem value="cash_discount">Cash Discount</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                This will immediately activate the merchant on the portal. Their
                dashboard will switch from pending to active and they'll be able
                to process transactions.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting || loading}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Activating…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Activate Merchant
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
