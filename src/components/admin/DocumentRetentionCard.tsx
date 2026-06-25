import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileX2, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PreviewResult {
  eligible_opportunities: number;
  documents: number;
  bytes: number;
  storage_removed?: number;
  rows_removed?: number;
  sample?: Array<{ file_name: string; opportunity_id: string }>;
  cutoff: string;
}

const fmtBytes = (n: number) => {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export function DocumentRetentionCard() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const runPreview = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("purge-stale-documents", {
        body: { dry_run: true },
      });
      if (error) throw error;
      setPreview(data as PreviewResult);
      toast({
        title: "Preview ready",
        description: `${data.documents} document(s) eligible for deletion`,
      });
    } catch (e) {
      toast({ title: "Preview failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runPurge = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("purge-stale-documents", {
        body: { dry_run: false },
      });
      if (error) throw error;
      toast({
        title: "Purge complete",
        description: `${data.rows_removed ?? 0} document(s) deleted (${fmtBytes(data.bytes ?? 0)})`,
      });
      setPreview(null);
    } catch (e) {
      toast({ title: "Purge failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileX2 className="h-4 w-4" />
              Document Retention
            </CardTitle>
            <CardDescription>
              Delete documents tied to opportunities that were not approved (closed lost, disqualified,
              no decision, underwriting declined) and are older than 12 months. Approved/won deals are
              never purged.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={runPreview} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Preview
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={busy || !preview || preview.documents === 0}
            >
              Purge now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!preview && (
          <div className="rounded-md border border-border p-3 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
            <span>
              Run a preview to see how many documents are eligible. The purge step removes files from
              storage and the documents table — opportunities and account history stay intact.
            </span>
          </div>
        )}
        {preview && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Eligible opportunities" value={preview.eligible_opportunities.toString()} />
              <Stat label="Documents" value={preview.documents.toString()} />
              <Stat label="Total size" value={fmtBytes(preview.bytes)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cutoff: anything not updated since {new Date(preview.cutoff).toLocaleDateString()}
            </p>
            {preview.sample && preview.sample.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Sample (first {preview.sample.length})
                </p>
                <div className="space-y-1">
                  {preview.sample.map((s, i) => (
                    <div key={i} className="text-xs px-2 py-1 rounded border border-border/60 truncate">
                      {s.file_name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Permanently delete {preview?.documents ?? 0} documents?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the files from storage and the documents table. Opportunity records and
              account history are kept. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runPurge}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Delete documents
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-sm font-medium mt-1">{value}</p>
    </div>
  );
}
