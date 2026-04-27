import { useEffect, useState } from "react";
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
import { Mail } from "lucide-react";

type ConfirmRequest = {
  description?: string;
  resolve: (ok: boolean) => void;
};

let pushRequest: ((req: ConfirmRequest) => void) | null = null;

/**
 * Global confirmation prompt for any automated/outbound email.
 * Returns true if the user confirms, false if they cancel.
 *
 * Usage:
 *   if (!(await confirmAutoEmail("Send outcome notice to client?"))) return;
 *   await supabase.functions.invoke("send-...", { body });
 */
export function confirmAutoEmail(description?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushRequest) {
      // Provider not mounted (e.g. public route) — fail safe by allowing send.
      resolve(true);
      return;
    }
    pushRequest({ description, resolve });
  });
}

export function EmailSendConfirm() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const current = queue[0];

  useEffect(() => {
    pushRequest = (req) => setQueue((q) => [...q, req]);
    return () => {
      pushRequest = null;
    };
  }, []);

  const resolveAndShift = (ok: boolean) => {
    if (current) current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <AlertDialog
      open={!!current}
      onOpenChange={(open) => {
        if (!open && current) resolveAndShift(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Automatic email about to be sent — please confirm
          </AlertDialogTitle>
          <AlertDialogDescription>
            {current?.description
              ? current.description
              : "An automated email is queued to send on your behalf."}
            <br />
            <span className="mt-2 inline-block font-medium text-foreground">
              Are you sure you want to send it?
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolveAndShift(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => resolveAndShift(true)}>
            Yes, send email
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
