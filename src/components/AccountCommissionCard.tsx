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
    kurv_volume_rate_pct?: number | null;
    kurv_per_txn_fee?: number | null;
    kurv_residual_split?: number | null;
  } | null | undefined;
}

export function AccountCommissionCard({ account }: AccountCommissionCardProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const initialModel: CommissionModel =
    (account?.commission_model as CommissionModel) || "gateway_only";

  // kurv_residual_split is stored as a fraction (0.85); shown to the user as a percent (85).
  const [model, setModel] = useState<CommissionModel>(initialModel);
  const [volRate, setVolRate] = useState<string>(
    account?.kurv_volume_rate_pct != null ? String(account.kurv_volume_rate_pct) : "0.5"
  );
  const [perTxn, setPerTxn] = useState<string>(
    account?.kurv_per_txn_fee != null ? String(account.kurv_per_txn_fee) : "0.25"
  );
  const [splitPct, setSplitPct] = useState<string>(
    account?.kurv_residual_split != null ? String(Number(account.kurv_residual_split) * 100) : "85"
  );

  // Re-sync local state when the account changes (e.g. after a save).
  useEffect(() => {
    setModel((account?.commission_model as CommissionModel) || "gateway_only");
    setVolRate(account?.kurv_volume_rate_pct != null ? String(account.kurv_volume_rate_pct) : "0.5");
    setPerTxn(account?.kurv_per_txn_fee != null ? String(account.kurv_per_txn_fee) : "0.25");
    setSplitPct(account?.kurv_residual_split != null ? String(Number(account.kurv_residual_split) * 100) : "85");
  }, [account?.id, account?.commission_model, account?.kurv_volume_rate_pct, account?.kurv_per_txn_fee, account?.kurv_residual_split]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) throw new Error("No account");
      const payload =
        model === "processing"
          ? {
              commission_model: "processing",
              kurv_volume_rate_pct: Number(volRate),
              kurv_per_txn_fee: Number(perTxn),
              kurv_residual_split: Number(splitPct) / 100,
            }
          : {
              commission_model: "gateway_only",
              kurv_volume_rate_pct: null,
              kurv_per_txn_fee: null,
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
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Volume rate</p>
                  <p className="font-mono text-sm font-medium">{Number(account?.kurv_volume_rate_pct ?? 0).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Per txn</p>
                  <p className="font-mono text-sm font-medium">${Number(account?.kurv_per_txn_fee ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Residual split</p>
                  <p className="font-mono text-sm font-medium">{(Number(account?.kurv_residual_split ?? 0.85) * 100).toFixed(0)}%</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No processing residual on this account.</p>
            )}
            {isProcessing && (
              <p className="text-[11px] text-center text-muted-foreground">
                Residual ≈ <span className="font-mono">{Number(account?.kurv_volume_rate_pct ?? 0).toFixed(2)}% × volume + ${Number(account?.kurv_per_txn_fee ?? 0).toFixed(2)}/txn</span>, at {(Number(account?.kurv_residual_split ?? 0.85) * 100).toFixed(0)}% split
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
                  <SelectItem value="processing">Processing (Kurv residual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {model === "processing" && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Volume %</Label>
                  <Input type="number" step="0.01" value={volRate} onChange={(e) => setVolRate(e.target.value)} className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Per txn $</Label>
                  <Input type="number" step="0.01" value={perTxn} onChange={(e) => setPerTxn(e.target.value)} className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Split %</Label>
                  <Input type="number" step="1" value={splitPct} onChange={(e) => setSplitPct(e.target.value)} className="h-9 text-sm font-mono" />
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
