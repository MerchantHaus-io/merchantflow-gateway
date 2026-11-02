import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface SentEmail {
  id: string;
  subject: string | null;
  from: string | null;
  to: string[] | string | null;
  cc: string[] | string | null;
  created_at: string;
  last_event: string | null;
  html: string | null;
  text: string | null;
}

interface SentEmailDialogProps {
  /** The `email_*` activity whose email to show; null closes the dialog. */
  activityId: string | null;
  onOpenChange: (open: boolean) => void;
}

const list = (v: string[] | string | null) => (Array.isArray(v) ? v.join(", ") : v ?? "");

export function SentEmailDialog({ activityId, onOpenChange }: SentEmailDialogProps) {
  const [email, setEmail] = useState<SentEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    setEmail(null);
    setError(null);
    setLoading(true);
    supabase.functions
      .invoke("get-sent-email", { body: { activity_id: activityId } })
      .then(async ({ data, error: fnError }) => {
        if (cancelled) return;
        if (fnError) {
          // FunctionsHttpError carries the JSON body on `context`.
          let msg = fnError.message;
          try {
            const body = await (fnError as { context?: Response }).context?.json();
            if (body?.error) msg = body.error;
          } catch {
            /* keep generic message */
          }
          setError(msg);
        } else {
          setEmail(data as SentEmail);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  return (
    <Dialog open={!!activityId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            {email?.subject ?? "Sent email"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-xs space-y-0.5">
              {email ? (
                <>
                  <div><span className="text-muted-foreground">Sent:</span> {format(new Date(email.created_at), "EEE d MMM yyyy, h:mm a")}</div>
                  {email.from && <div><span className="text-muted-foreground">From:</span> {email.from}</div>}
                  <div><span className="text-muted-foreground">To:</span> {list(email.to)}</div>
                  {list(email.cc) && <div><span className="text-muted-foreground">Cc:</span> {list(email.cc)}</div>}
                  {email.last_event && <div><span className="text-muted-foreground">Status:</span> {email.last_event}</div>}
                </>
              ) : (
                <span>Loading the email from the email provider…</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[300px] rounded-md border border-border overflow-hidden bg-white">
          {loading ? (
            <div className="h-full min-h-[300px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive bg-background h-full">{error}</div>
          ) : email?.html ? (
            // Sandboxed with no permissions: no scripts, no same-origin access.
            <iframe title="Sent email" sandbox="" srcDoc={email.html} className="w-full h-[60vh] border-0" />
          ) : email?.text ? (
            <pre className="p-4 text-sm whitespace-pre-wrap text-black">{email.text}</pre>
          ) : email ? (
            <div className="p-6 text-sm text-muted-foreground bg-background">No body was stored for this email.</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
