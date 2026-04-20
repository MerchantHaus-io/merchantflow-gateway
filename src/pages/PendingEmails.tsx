import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";
import { Inbox, Mail, Send, Trash2, CheckCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn, pluralize } from "@/lib/utils";

interface PendingEmail {
  id: string;
  email_type: string;
  application_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  body_html: string;
  status: "pending" | "sent" | "discarded";
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  send_error: string | null;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  website_compliance_checklist: "Website Compliance Checklist",
};

const PendingEmails = () => {
  const { user } = useAuth();
  const [emails, setEmails] = useState<PendingEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "sent" | "discarded" | "all">("pending");
  const [previewing, setPreviewing] = useState<PendingEmail | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState<PendingEmail | null>(null);

  const fetchEmails = async () => {
    const { data, error } = await supabase
      .from("pending_emails")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("Failed to load pending emails:", error);
      toast.error("Failed to load pending emails");
      return;
    }
    setEmails((data || []) as PendingEmail[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEmails();
    // Realtime: refresh when anything changes
    const channel = supabase
      .channel("pending-emails-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_emails" }, () => {
        fetchEmails();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return emails;
    return emails.filter((e) => e.status === statusFilter);
  }, [emails, statusFilter]);

  const counts = useMemo(() => ({
    pending: emails.filter((e) => e.status === "pending").length,
    sent: emails.filter((e) => e.status === "sent").length,
    discarded: emails.filter((e) => e.status === "discarded").length,
    failed: emails.filter((e) => e.send_error).length,
  }), [emails]);

  const handleSend = async ({ subject, bodyHtml }: { subject: string; bodyHtml: string }) => {
    if (!previewing) return;
    const { error } = await supabase.functions.invoke("send-pending-email", {
      body: {
        pending_email_id: previewing.id,
        custom_subject: subject,
        custom_html: bodyHtml,
        reviewed_by: user?.email,
      },
    });
    if (error) {
      toast.error(`Send failed: ${error.message}`);
      return;
    }
    toast.success("Email sent.");
    setPreviewing(null);
    fetchEmails();
  };

  const handleDiscard = async () => {
    if (!discardConfirm) return;
    const { error } = await supabase
      .from("pending_emails")
      .update({
        status: "discarded",
        reviewed_by: user?.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", discardConfirm.id);
    if (error) {
      toast.error(`Discard failed: ${error.message}`);
      return;
    }
    toast.success("Email discarded.");
    setDiscardConfirm(null);
    fetchEmails();
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader icon={Inbox} title="Pending Emails" color="teal" />

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          {/* Intro */}
          <div className="text-sm text-muted-foreground border-l-4 border-[hsl(var(--teal))] pl-3 py-1 bg-[hsl(var(--teal))]/5">
            Automated emails held for staff review before sending. Currently used for the
            <strong> Website Compliance Checklist</strong> sent after a merchant submits the
            application wizard. Review, edit if needed, and send — or discard.
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Pending Review" value={counts.pending} icon={Mail} color="teal" />
            <StatCard label="Sent" value={counts.sent} icon={CheckCircle} color="success" />
            <StatCard label="Discarded" value={counts.discarded} icon={Trash2} color="muted" />
            <StatCard label="Send Errors" value={counts.failed} icon={Trash2} color={counts.failed > 0 ? "destructive" : "muted"} />
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-1 border-b border-border/60 overflow-x-auto">
            {([
              { key: "pending", label: "Pending" },
              { key: "sent", label: "Sent" },
              { key: "discarded", label: "Discarded" },
              { key: "all", label: "All" },
            ] as const).map((tab) => {
              const isActive = statusFilter === tab.key;
              const count = tab.key === "all" ? emails.length : (counts as any)[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                    isActive
                      ? "text-foreground border-[hsl(var(--teal))]"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <Card className="border-border/60 overflow-hidden">
            <CardHeader className="pb-0 pt-3 px-4">
              <span className="text-xs text-muted-foreground">
                {pluralize(filtered.length, `${statusFilter} email`)}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="w-[260px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState
                          icon={Inbox}
                          title={statusFilter === "pending" ? "No emails awaiting review" : `No ${statusFilter} emails`}
                          description={statusFilter === "pending"
                            ? "When a merchant submits the application wizard, the website compliance checklist will appear here for your review."
                            : `Switch to "Pending" to see emails awaiting review.`}
                          size="sm"
                        />
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((email) => (
                    <TableRow key={email.id} className="hover:bg-muted/30">
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {EMAIL_TYPE_LABELS[email.email_type] || email.email_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{email.recipient_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{email.recipient_email}</div>
                      </TableCell>
                      <TableCell className="text-sm max-w-md truncate" title={email.subject}>
                        {email.subject}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                        {email.send_error && (
                          <div className="text-destructive mt-1">Send failed — try again</div>
                        )}
                        {email.status === "sent" && email.reviewed_by && (
                          <div className="mt-1">Sent by {email.reviewed_by.split("@")[0]}</div>
                        )}
                        {email.status === "discarded" && email.reviewed_by && (
                          <div className="mt-1">Discarded by {email.reviewed_by.split("@")[0]}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {email.status === "pending" ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPreviewing(email)}
                              className="gap-1.5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Review &amp; Send
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDiscardConfirm(email)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewing(email)}
                            className="gap-1.5 text-muted-foreground"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preview / Edit / Send dialog */}
      {previewing && previewing.status === "pending" && (
        <EmailPreviewDialog
          open
          onOpenChange={(open) => { if (!open) setPreviewing(null); }}
          subject={previewing.subject}
          bodyHtml={previewing.body_html}
          recipientEmail={previewing.recipient_email}
          recipientName={previewing.recipient_name || undefined}
          onSend={handleSend}
        />
      )}

      {/* Read-only view for sent / discarded */}
      {previewing && previewing.status !== "pending" && (
        <ReadOnlyEmailViewer email={previewing} onClose={() => setPreviewing(null)} />
      )}

      <AlertDialog open={!!discardConfirm} onOpenChange={(open) => { if (!open) setDiscardConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this email?</AlertDialogTitle>
            <AlertDialogDescription>
              The merchant will not receive this email. This action is logged but cannot be undone.
              The merchant has already received their separate "Application Received" thank-you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

function ReadOnlyEmailViewer({ email, onClose }: { email: PendingEmail; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{email.status}</div>
            <div className="text-sm font-medium">To: {email.recipient_name} &lt;{email.recipient_email}&gt;</div>
            <div className="text-sm text-muted-foreground mt-1">{email.subject}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div
          className="p-4 text-sm bg-muted/20"
          dangerouslySetInnerHTML={{ __html: email.body_html }}
        />
      </div>
    </div>
  );
}

export default PendingEmails;
