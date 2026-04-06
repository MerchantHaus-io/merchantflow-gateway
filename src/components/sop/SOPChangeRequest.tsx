import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Edit3, CheckCircle, XCircle, Clock, MessageSquare, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ChangeRequest {
  id: string;
  section_id: string;
  section_title: string;
  original_content: string | null;
  proposed_content: string;
  reason: string | null;
  submitted_by: string;
  submitted_by_name: string | null;
  status: string;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/* ── Suggest Edit Button (placed on each section) ── */
export const SuggestEditButton = ({
  sectionId,
  sectionTitle,
}: {
  sectionId: string;
  sectionTitle: string;
}) => {
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, teamMemberName } = useAuth();

  const handleSubmit = async () => {
    if (!proposed.trim()) { toast.error("Please describe your proposed change"); return; }
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("sop_change_requests").insert({
      section_id: sectionId,
      section_title: sectionTitle,
      proposed_content: proposed.trim(),
      reason: reason.trim() || null,
      submitted_by: user.email || "",
      submitted_by_name: teamMemberName || user.email?.split("@")[0] || "",
    });
    setSubmitting(false);
    if (error) { toast.error("Failed to submit"); return; }
    toast.success("Change request submitted for review");
    setOpen(false);
    setProposed("");
    setReason("");
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Edit3 className="h-3 w-3" />
        Suggest Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Suggest Edit — {sectionTitle}
            </DialogTitle>
            <DialogDescription>
              Describe your proposed change. It will be sent to Jamie for review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Proposed Change</label>
              <Textarea
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
                placeholder="Describe what should be changed, added, or removed…"
                className="mt-1 min-h-[120px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Reason (optional)</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this change is needed…"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !proposed.trim()}>
              {submitting ? "Submitting…" : "Submit for Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/* ── Review Panel (Jamie only) ── */
export const SOPReviewPanel = () => {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.email === "admin@merchanthaus.io" || user?.email === "jamie@merchanthaus.io";

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("sop_change_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests((data as ChangeRequest[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();

    const channel = supabase
      .channel("sop-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sop_change_requests" }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleReview = async (id: string, status: "approved" | "declined") => {
    const { error } = await supabase
      .from("sop_change_requests")
      .update({
        status,
        reviewed_by: user?.email || "",
        review_note: reviewNote.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(`Change request ${status}`);
    setActiveId(null);
    setReviewNote("");
  };

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />;
    if (status === "declined") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  };

  const statusColor = (status: string) => {
    if (status === "approved") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    if (status === "declined") return "bg-red-500/10 text-red-600 border-red-500/30";
    return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  };

  const pending = requests.filter(r => r.status === "pending");
  const resolved = requests.filter(r => r.status !== "pending");

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Pending */}
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-500" />
          Pending Review ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No pending change requests</p>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => (
              <div key={req.id} className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <Badge variant="outline" className="text-[10px] mb-1">{req.section_title}</Badge>
                    <p className="text-xs text-muted-foreground">
                      by <strong>{req.submitted_by_name || req.submitted_by}</strong> · {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {statusIcon(req.status)}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap mb-2">{req.proposed_content}</p>
                {req.reason && (
                  <p className="text-xs text-muted-foreground italic mb-3">
                    <MessageSquare className="h-3 w-3 inline mr-1" />
                    {req.reason}
                  </p>
                )}

                {isAdmin && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    {activeId === req.id ? (
                      <>
                        <Input
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Optional review note…"
                          className="h-8 text-xs"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleReview(req.id, "approved")}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleReview(req.id, "declined")}>
                            <XCircle className="h-3 w-3 mr-1" /> Decline
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setActiveId(null); setReviewNote(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveId(req.id)}>
                        <Shield className="h-3 w-3 mr-1" /> Review
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved */}
      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            Resolved ({resolved.length})
          </h3>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {resolved.map((req) => (
                <div key={req.id} className={cn("border rounded-lg p-3", statusColor(req.status))}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcon(req.status)}
                        <Badge variant="outline" className="text-[10px]">{req.section_title}</Badge>
                        <Badge variant="secondary" className="text-[10px] capitalize">{req.status}</Badge>
                      </div>
                      <p className="text-xs text-foreground/80 truncate">{req.proposed_content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        by {req.submitted_by_name || req.submitted_by} · reviewed {req.reviewed_at ? formatDistanceToNow(new Date(req.reviewed_at), { addSuffix: true }) : ""}
                      </p>
                      {req.review_note && (
                        <p className="text-[10px] text-muted-foreground italic mt-1">
                          <MessageSquare className="h-2.5 w-2.5 inline mr-0.5" /> {req.review_note}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
