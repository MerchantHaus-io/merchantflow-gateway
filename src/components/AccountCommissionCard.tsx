import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Percent, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

type CommissionModel = "gateway_only" | "processing";

interface AccountCommissionCardProps {
  account: {
    id: string;
    commission_model?: string | null;
    merchant_rate_pct?: number | null;
    interchange_rate_pct?: number | null;
    revenue_share_pct?: number | null;
  } | null | undefined;
}

export function AccountCommissionCard({ account }: AccountCommissionCardProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const initialModel: CommissionModel =
    (account?.commission_model as CommissionModel) || "gateway_only";

  const [model, setModel] = useState<CommissionModel>(initialModel);
  const [merchantRate, setMerchantRate] = useState<string>(
    account?.merchant_rate_pct != null ? String(account.merchant_rate_pct) : "2.92"
  );
  const [interchangeRate, setInterchangeRate] = useState<string>(
    account?.interchange_rate_pct != null ? String(account.interchange_rate_pct) : "1.80"
  );
  const [revShare, setRevShare] = useState<string>(
    account?.revenue_share_pct != null ? String(account.revenue_share_pct) : "30"
  );

  // Re-sync local state when the account changes (e.g. after a save).
  useEffect(() => {
    setModel((account?.commission_model as CommissionModel) || "gateway_only");
    setMerchantRate(account?.merchant_rate_pct != null ? String(account.merchant_rate_pct) : "2.92");
    setInterchangeRate(account?.interchange_rate_pct != null ? String(account.interchange_rate_pct) : "1.80");
    setRevShare(account?.revenue_share_pct != null ? String(account.revenue_share_pct) : "30");
  }, [account?.id, account?.commission_model, account?.merchant_rate_pct, account?.interchange_rate_pct, account?.revenue_share_pct]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) throw new Error("No account");
      const payload =
        model === "processing"
          ? {
              commission_model: "processing",
              merchant_rate_pct: Number(merchantRate),
              interchange_rate_pct: Number(interchangeRate),
              revenue_share_pct: Number(revShare),
            }
          : {
              commission_model: "gateway_only",
              merchant_rate_pct: null,
              interchange_rate_pct: null,
              revenue_share_pct: null,
            };
      const { error } = await supabase.from("accounts").update(payload as any).eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Commission settings updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["live-account-detail"] });
      queryClient.invalidateQueries({ queryKey: ["live-billing-opportunities"] });
    },
    onError: (err: any) => {
      toast.error(`Failed to save: ${err.message || "Unknown error"}`);
    },
  });

  const isProcessing = (account?.commission_model as CommissionModel) === "processing";
  const effectiveBps =
    isProcessing && account?.merchant_rate_pct != null && account?.interchange_rate_pct != null && account?.revenue_share_pct != null
      ? (Number(account.merchant_rate_pct) - Number(account.interchange_rate_pct)) * Number(account.revenue_share_pct)
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Percent className="h-4 w-4 text-muted-foreground" />
          Commission Settings
          <Badge
            variant="outline"
            className={
              isProcessing
                ? "ml-auto text-[10px] border-primary/50 text-primary"
                : "ml-auto text-[10px] border-teal-500/50 text-teal-600 dark:text-teal-400"
            }
          >
            {isProcessing ? "Processing" : "Gateway only"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {!editing ? (
          <>
            {isProcessing ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Merchant rate</p>
                  <p className="font-mono text-sm font-medium">{Number(account?.merchant_rate_pct ?? 0).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Interchange</p>
                  <p className="font-mono text-sm font-medium">{Number(account?.interchange_rate_pct ?? 0).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Rev share</p>
                  <p className="font-mono text-sm font-medium">{Number(account?.revenue_share_pct ?? 0).toFixed(0)}%</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No processing residual on this account.</p>
            )}
            {effectiveBps != null && (
              <p className="text-[11px] text-center text-muted-foreground">
                Effective commission ≈ <span className="font-mono">{effectiveBps.toFixed(0)} bps</span> of volume
              </p>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Pricing model</Label>
              <Select value={model} onValueChange={(v) => setModel(v as CommissionModel)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gateway_only">Gateway only (no processing residual)</SelectItem>
                  <SelectItem value="processing">Processing (NMI Payments)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {model === "processing" && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Merchant %</Label>
                  <Input type="number" step="0.01" value={merchantRate} onChange={(e) => setMerchantRate(e.target.value)} className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Interchange %</Label>
                  <Input type="number" step="0.01" value={interchangeRate} onChange={(e) => setInterchangeRate(e.target.value)} className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rev share %</Label>
                  <Input type="number" step="1" value={revShare} onChange={(e) => setRevShare(e.target.value)} className="h-9 text-sm font-mono" />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
