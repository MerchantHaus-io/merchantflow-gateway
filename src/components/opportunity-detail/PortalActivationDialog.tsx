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
import { Loader2, Zap, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface PortalActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  portalMerchantId: string;
  accountName?: string;
  /** Pre-resolved NMI gateway ID (from boarding or account) */
  prefillGatewayId?: string | null;
  onSuccess?: () => void;
  /** Called when user clicks "Do This Later" */
  onDeferActivation?: () => void;
}

export const PortalActivationDialog = ({
  open,
  onOpenChange,
  opportunityId,
  portalMerchantId,
  accountName,
  prefillGatewayId,
  onSuccess,
  onDeferActivation,
}: PortalActivationDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Form fields
  const [nmiApiKey, setNmiApiKey] = useState("");
  const [nmiPublicKey, setNmiPublicKey] = useState("");
  const [nmiGatewayId, setNmiGatewayId] = useState("");
  const [pricingModel, setPricingModel] = useState<string>("interchange_plus");

  // Auto-fill from NMI boarding submission
  useEffect(() => {
    if (!open || !opportunityId) return;

    const fetchBoardingData = async () => {
      setLoading(true);
      try {
        // If prefill was provided, use it directly
        if (prefillGatewayId) {
          setNmiGatewayId(prefillGatewayId);
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from("nmi_boarding_submissions")
          .select("nmi_gateway_id, nmi_status")
          .eq("opportunity_id", opportunityId)
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
  }, [open, opportunityId, prefillGatewayId]);

  const resetForm = useCallback(() => {
    setNmiApiKey("");
    setNmiPublicKey("");
    setNmiGatewayId("");
    setPricingModel("interchange_plus");
    setInlineError(null);
  }, []);

  const handleClose = useCallback(
    (val: boolean) => {
      if (!val) resetForm();
      onOpenChange(val);
    },
    [onOpenChange, resetForm]
  );

  const handleDoThisLater = useCallback(() => {
    onDeferActivation?.();
    handleClose(false);
  }, [onDeferActivation, handleClose]);

  const handleSubmit = async () => {
    if (!nmiApiKey || !nmiPublicKey || !pricingModel) {
      setInlineError("Please fill in all required fields");
      return;
    }

    setInlineError(null);
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
        type: "portal_activation",
        description: `Portal account activated by ${user?.email}. NMI Gateway ID: ${nmiGatewayId || "N/A"}`,
        user_id: user?.id,
        user_email: user?.email,
      });

      toast.success("Portal account activated — merchant has been notified");
      handleClose(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Portal activation error:", err);
      setInlineError(
        err.message || "Activation failed — check API key and try again"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = nmiApiKey.trim().length > 0 && nmiPublicKey.trim().length > 0 && pricingModel;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Activate Merchant Portal Account
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
            {/* Business name */}
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Business</p>
                <p className="text-sm font-medium">{accountName || "Unknown"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">NMI Gateway ID</p>
                <p className="text-sm font-mono font-medium">
                  {nmiGatewayId || (
                    <span className="text-amber-500">Not found</span>
                  )}
                </p>
              </div>
            </div>

            {/* Instructions */}
            <p className="text-xs text-muted-foreground">
              Retrieve the following from NMI Control Panel → Admin → Security
              Keys:
            </p>

            {/* NMI API Key */}
            <div className="space-y-1.5">
              <Label htmlFor="nmi-api-key" className="text-xs">
                NMI API Key (Private Key){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nmi-api-key"
                value={nmiApiKey}
                onChange={(e) => {
                  setNmiApiKey(e.target.value);
                  setInlineError(null);
                }}
                placeholder="Merchant's NMI security key"
                className="font-mono"
              />
            </div>

            {/* NMI Public Key */}
            <div className="space-y-1.5">
              <Label htmlFor="nmi-public-key" className="text-xs">
                NMI Public Key (Tokenization Key){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nmi-public-key"
                value={nmiPublicKey}
                onChange={(e) => {
                  setNmiPublicKey(e.target.value);
                  setInlineError(null);
                }}
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

            {/* Open NMI Control Panel */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                window.open(
                  "https://merchanthausio.transactiongateway.com",
                  "_blank"
                )
              }
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Open NMI Control Panel
            </Button>

            {/* Inline error */}
            {inlineError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive">{inlineError}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handleDoThisLater}
            disabled={submitting}
            className="sm:mr-auto"
          >
            Do This Later
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
                Activate Portal Account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
