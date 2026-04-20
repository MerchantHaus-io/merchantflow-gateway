import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GmailEditor } from "@/components/GmailEditor";
import { Loader2, Send, Lock } from "lucide-react";

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  bodyHtml: string;
  recipientEmail: string;
  recipientName?: string;
  onSend: (data: { subject: string; bodyHtml: string }) => Promise<void>;
  /** When true, the body is rendered read-only (e.g. for legally-required templates). */
  bodyLocked?: boolean;
  /** Optional explanation shown at the top of the dialog (e.g. compliance warning). */
  lockedReason?: string;
}

export function EmailPreviewDialog({
  open, onOpenChange, subject: initialSubject, bodyHtml: initialBody,
  recipientEmail, recipientName, onSend, bodyLocked, lockedReason,
}: EmailPreviewDialogProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);

  // Reset when dialog opens with new content
  const [lastInitial, setLastInitial] = useState("");
  if (open && initialBody !== lastInitial) {
    setSubject(initialSubject);
    setBody(initialBody);
    setLastInitial(initialBody);
  }

  const handleSend = async () => {
    setSending(true);
    try {
      // When the body is locked, always send the original template — ignore any local edits
      await onSend({ subject, bodyHtml: bodyLocked ? initialBody : body });
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Email Before Sending</DialogTitle>
          <DialogDescription>
            To: {recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail}
          </DialogDescription>
        </DialogHeader>

        {bodyLocked && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <strong>Body locked — compliance template.</strong>{" "}
              {lockedReason || "This email contains legally-required disclosures and cannot be edited. Subject line is editable."}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-subject" className="text-xs font-medium">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Email Body</Label>
            {bodyLocked ? (
              <div
                className="border border-border rounded-md p-4 bg-muted/30 text-sm overflow-auto max-h-[320px]"
                style={{ minHeight: "220px" }}
                dangerouslySetInnerHTML={{ __html: initialBody }}
              />
            ) : (
              <GmailEditor
                value={body}
                onChange={setBody}
                placeholder="Edit email content…"
                minHeight="220px"
                mergeTags={["{{first_name}}", "{{company}}"]}
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
