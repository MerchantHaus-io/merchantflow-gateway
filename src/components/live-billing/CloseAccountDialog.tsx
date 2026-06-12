import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Archive, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  nmiMerchantId?: string | null;
  onClosed?: () => void;
}

export const CloseAccountDialog = ({
  open,
  onOpenChange,
  accountId,
  accountName,
  nmiMerchantId,
  onClosed,
}: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [closeOnNmi, setCloseOnNmi] = useState(!!nmiMerchantId);
  const [submitting, setSubmitting] = useState(false);

  const handleClose = async () => {
    if (!user) return;
    if (note.trim().length < 5) {
      toast.error("Please add a closure note (min 5 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const closerEmail = user.email || "";
      const closedAt = new Date().toISOString();

      // 1. Archive all opportunities for this account
      const { data: opps, error: oppsErr } = await supabase
        .from("opportunities")
        .select("id")
        .eq("account_id", accountId);
      if (oppsErr) throw oppsErr;

      for (const opp of opps ?? []) {
        await supabase
          .from("opportunities")
          .update({
            status: "archived",
            outcome_notes: note,
            outcome_closed_at: closedAt,
            outcome_closed_by: closerEmail,
          })
          .eq("id", opp.id);

        await supabase.from("activities").insert({
          opportunity_id: opp.id,
          type: "archived",
          description: `Account archived from Live & Billing. Note: ${note}`,
          user_email: closerEmail,
          user_id: user.id,
        });
      }

      // 2. Log on the account-level interaction timeline
      await supabase.from("client_interactions").insert({
        account_id: accountId,
        subject: `Account closed — ${accountName}`,
        interaction_type: "note",
        channel: "internal",
        notes: note,
        status: "closed",
        outcome: "archived",
        created_by: user.id,
        created_by_email: closerEmail,
      });

      // 3. Optionally push close to NMI gateway
      let nmiResult: { ok: boolean; message?: string } | null = null;
      if (closeOnNmi && nmiMerchantId) {
        try {
          const { data, error } = await supabase.functions.invoke("nmi-close-gateway", {
            body: { gateway_id: nmiMerchantId, reason: note },
          });
          if (error) {
            nmiResult = { ok: false, message: error.message };
          } else {
            nmiResult = { ok: !!data?.ok, message: data?.message };
          }
        } catch (err) {
          nmiResult = { ok: false, message: (err as Error).message };
        }
      }

      if (nmiResult?.ok) {
        toast.success("Account archived · NMI gateway deactivated");
      } else if (nmiResult && !nmiResult.ok) {
        toast.warning(`Account archived. NMI gateway close failed: ${nmiResult.message || "unknown error"}`);
      } else {
        toast.success("Account archived");
      }

      await queryClient.invalidateQueries({ queryKey: ["live-billing-opportunities"] });
      await queryClient.invalidateQueries({ queryKey: ["live-account-detail", accountId] });
      onOpenChange(false);
      setNote("");
      onClosed?.();
    } catch (err) {
      toast.error(`Failed to close account: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-destructive" />
            Close & Archive Account
          </DialogTitle>
          <DialogDescription>
            Archiving <span className="font-medium text-foreground">{accountName}</span> removes it from Live &amp; Billing and stamps a closure note on every linked opportunity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="close-note" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Closure Note <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="close-note"
              autoFocus
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for closing this account (e.g. merchant requested cancellation, switched processors, business closed)…"
            />
          </div>

          {nmiMerchantId ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <Checkbox
                id="close-nmi"
                checked={closeOnNmi}
                onCheckedChange={(c) => setCloseOnNmi(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="close-nmi" className="text-xs font-medium cursor-pointer">
                  Also deactivate NMI gateway <span className="font-mono text-muted-foreground">({nmiMerchantId})</span>
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Sends a deactivation request to NMI's Affiliate Boarding API. Failure here will not block the archive.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                No NMI merchant ID linked — closure is internal only. Use <span className="font-medium">Link Gateway</span> first if you also need to deactivate it on NMI.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleClose} disabled={submitting || note.trim().length < 5} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Close &amp; Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
