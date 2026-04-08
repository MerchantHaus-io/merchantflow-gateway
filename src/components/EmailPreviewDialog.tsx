import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GmailEditor } from "@/components/GmailEditor";
import { Loader2, Send } from "lucide-react";

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  bodyHtml: string;
  recipientEmail: string;
  recipientName?: string;
  onSend: (data: { subject: string; bodyHtml: string }) => Promise<void>;
}

export function EmailPreviewDialog({
  open, onOpenChange, subject: initialSubject, bodyHtml: initialBody,
  recipientEmail, recipientName, onSend,
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
      await onSend({ subject, bodyHtml: body });
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
            <GmailEditor
              value={body}
              onChange={setBody}
              placeholder="Edit email content…"
              minHeight="220px"
              mergeTags={["{{first_name}}", "{{company}}"]}
            />
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
