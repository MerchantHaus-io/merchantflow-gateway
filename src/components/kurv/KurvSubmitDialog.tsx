import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertCircle, CheckCircle2, Copy, Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Issue { field: string; severity: "error" | "warning"; message: string }
interface Preview {
  payload: any;
  issues: Issue[];
  sources: Record<string, any>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  opportunityId: string;
  accountName?: string;
}

export const KurvSubmitDialog = ({ open, onOpenChange, opportunityId, accountName }: Props) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [emsResult, setEmsResult] = useState<any>(null);

  useEffect(() => {
    if (!open) { setPreview(null); setEmsResult(null); return; }
    setLoading(true);
    supabase.functions
      .invoke("kurv-build-payload", { body: { opportunity_id: opportunityId } })
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setPreview(data as Preview);
      })
      .finally(() => setLoading(false));
  }, [open, opportunityId]);

  const errors = preview?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === "warning") ?? [];
  const canSubmit = preview && errors.length === 0;

  const handleSubmit = async (dealType: "unsigned" | "signed") => {
    if (!preview) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("kurv-board-deal", {
      body: {
        opportunity_id: opportunityId,
        deal_type: dealType,
        payload: preview.payload,
        idempotency_key: `${opportunityId}:${dealType}:${Date.now()}`,
      },
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.error) { toast.error((data as any).error); return; }
    toast.success(`Submitted ${dealType} deal to Kurv`);
    onOpenChange(false);
  };

  const handleValidate = async (dealType: "unsigned" | "signed") => {
    if (!preview) return;
    setValidating(true);
    setEmsResult(null);
    const { data, error } = await supabase.functions.invoke("kurv-validate-deal", {
      body: { deal_type: dealType, payload: preview.payload },
    });
    setValidating(false);
    if (error) { toast.error(error.message); return; }
    setEmsResult(data);
    if ((data as any)?.unsupported) toast.warning("EMS validate endpoint not available in this environment");
    else if ((data as any)?.ok) toast.success("EMS validation passed");
    else toast.error(`EMS returned ${((data as any)?.issues?.length ?? 0)} validation issue(s)`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Submit to Kurv {accountName ? `— ${accountName}` : ""}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Building payload from pipeline data…
          </div>
        )}

        {preview && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {Object.entries(preview.sources).map(([k, v]) => (
                <Badge key={k} variant={v ? "default" : "outline"} className="font-mono">
                  {k}: {String(v)}
                </Badge>
              ))}
            </div>

            {errors.length > 0 && (
              <div className="border border-destructive/40 bg-destructive/5 rounded p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" /> {errors.length} blocking issue(s)
                </div>
                <ul className="text-xs space-y-0.5 ml-6 list-disc">
                  {errors.map((i, idx) => (
                    <li key={idx}><span className="font-mono">{i.field}</span> — {i.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="border border-amber-500/40 bg-amber-500/5 rounded p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" /> {warnings.length} warning(s)
                </div>
                <ul className="text-xs space-y-0.5 ml-6 list-disc">
                  {warnings.map((i, idx) => (
                    <li key={idx}><span className="font-mono">{i.field}</span> — {i.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {errors.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Ready to submit
              </div>
            )}

            {emsResult && (
              <div className={`border rounded p-3 space-y-1 ${
                emsResult.unsupported ? "border-muted bg-muted/30" :
                emsResult.ok ? "border-emerald-500/40 bg-emerald-500/5" :
                "border-destructive/40 bg-destructive/5"
              }`}>
                <div className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  EMS validation
                  {emsResult.endpoint && <span className="font-mono text-xs text-muted-foreground">{emsResult.endpoint} → {emsResult.status}</span>}
                </div>
                {emsResult.unsupported && (
                  <div className="text-xs text-muted-foreground">EMS does not expose a validate endpoint in this environment. Tried: {emsResult.attempts?.map((a: any) => `${a.endpoint} (${a.status})`).join(", ")}</div>
                )}
                {Array.isArray(emsResult.issues) && emsResult.issues.length > 0 && (
                  <ul className="text-xs space-y-0.5 ml-6 list-disc">
                    {emsResult.issues.map((i: any, idx: number) => (
                      <li key={idx}>{i.field && <span className="font-mono">{i.field}</span>}{i.field ? " — " : ""}{i.message}</li>
                    ))}
                  </ul>
                )}
                {emsResult.ok && (!emsResult.issues || emsResult.issues.length === 0) && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400">EMS accepted the payload — no field errors.</div>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 border rounded">
              <ScrollArea className="h-full">
                <pre className="text-[11px] p-3 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(preview.payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={!preview}
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(preview?.payload, null, 2));
              toast.success("Payload copied");
            }}
          >
            <Copy className="h-4 w-4 mr-1.5" /> Copy JSON
          </Button>
          <Button
            variant="outline"
            disabled={!canSubmit || submitting}
            onClick={() => handleSubmit("unsigned")}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Submit as Unsigned
          </Button>
          <Button
            disabled={!canSubmit || submitting}
            onClick={() => handleSubmit("signed")}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Submit Signed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
