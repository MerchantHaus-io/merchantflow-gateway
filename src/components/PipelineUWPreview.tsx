import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Opportunity, STAGE_CONFIG, getServiceType, EMAIL_TO_USER } from "@/types/opportunity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Wand2, MessageSquare, Clock, User, Globe, Shield, Scale,
  AlertTriangle, XCircle, CheckCircle2, BarChart3, Maximize2,
  Loader2, FileText,
} from "lucide-react";
import { useAIAssistant } from "@/hooks/useAIAssistant";

interface Props {
  opportunity: Opportunity;
  onOpenModal: (opp: Opportunity) => void;
}

interface LatestNote {
  id: string;
  content: string;
  user_email: string;
  created_at: string;
}

interface ReportRow {
  id: string;
  readiness_score: string;
  score: number | null;
  website_score: number | null;
  confidence: string | null;
  recommendation: string | null;
  summary: string | null;
  triggered_by: string;
  created_at: string;
  no_change: boolean;
}

const displayName = (email: string) => EMAIL_TO_USER[email?.toLowerCase()] || email || "Unknown";

const scoreColor = (score: number) => {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
  return "text-destructive";
};

const statusIcon = (score: string) => {
  if (score === "ready" || score === "green") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (score === "needs_attention" || score === "yellow") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

const recommendationLabel = (rec?: string | null) => {
  const map: Record<string, string> = {
    proceed: "Proceed",
    proceed_with_conditions: "Conditions",
    request_information: "Request Info",
    escalate_to_risk: "Escalate",
    decline: "Decline",
  };
  return map[rec || ""] || rec || "";
};

const recommendationColor = (rec?: string | null) => {
  if (rec === "proceed") return "text-emerald-500";
  if (rec === "proceed_with_conditions") return "text-amber-500";
  if (rec === "request_information") return "text-blue-500";
  if (rec === "escalate_to_risk" || rec === "decline") return "text-destructive";
  return "text-muted-foreground";
};

const PipelineUWPreview = ({ opportunity, onOpenModal }: Props) => {
  const { user } = useAuth();
  const { underwritingReview } = useAIAssistant();
  const [latestReport, setLatestReport] = useState<ReportRow | null>(null);
  const [reportHistory, setReportHistory] = useState<ReportRow[]>([]);
  const [latestNote, setLatestNote] = useState<LatestNote | null>(null);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const config = STAGE_CONFIG[opportunity.stage];
  const contactName = [opportunity.contact?.first_name, opportunity.contact?.last_name].filter(Boolean).join(" ") || "No contact";
  const serviceType = getServiceType(opportunity);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Fetch report history (latest 5)
      const { data: reports } = await supabase
        .from("validation_reports")
        .select("id, readiness_score, score, website_score, confidence, recommendation, summary, triggered_by, created_at, no_change")
        .eq("opportunity_id", opportunity.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (reports?.length) {
        setLatestReport(reports[0] as unknown as ReportRow);
        setReportHistory(reports as unknown as ReportRow[]);
      } else {
        setLatestReport(null);
        setReportHistory([]);
      }

      // Fetch latest note (non-AI)
      const { data: notes } = await supabase
        .from("comments")
        .select("id, content, user_email, created_at")
        .eq("opportunity_id", opportunity.id)
        .not("content", "like", "## AI Underwriting Review%")
        .order("created_at", { ascending: false })
        .limit(1);

      setLatestNote(notes?.length ? (notes[0] as LatestNote) : null);
      setIsLoading(false);
    };

    fetchData();
  }, [opportunity.id]);

  const handleQuickNote = async () => {
    if (!newNote.trim() || !user) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("comments").insert({
        opportunity_id: opportunity.id,
        content: newNote.trim(),
        user_id: user.id,
        user_email: user.email,
      });
      if (error) throw error;
      setLatestNote({
        id: crypto.randomUUID(),
        content: newNote.trim(),
        user_email: user.email || "",
        created_at: new Date().toISOString(),
      });
      setNewNote("");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunReview = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await underwritingReview(opportunity.id);
      if (result?.error) {
        toast.error(result.error);
      } else if (result?.report) {
        // Refresh data
        const { data: reports } = await supabase
          .from("validation_reports")
          .select("id, readiness_score, score, website_score, confidence, recommendation, summary, triggered_by, created_at, no_change")
          .eq("opportunity_id", opportunity.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (reports?.length) {
          setLatestReport(reports[0] as unknown as ReportRow);
          setReportHistory(reports as unknown as ReportRow[]);
        }
        toast.success("Underwriting Review complete");
      }
    } catch (err: any) {
      toast.error(err?.message || "Review failed");
    } finally {
      setIsRunning(false);
    }
  }, [opportunity.id, underwritingReview]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/50 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: `${config?.color || '#6b7280'}20`, color: config?.color || '#6b7280' }}
            >
              {contactName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{contactName}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {opportunity.account?.name || "Unknown"} · {serviceType === "gateway_only" ? "Gateway" : "Processing"}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onOpenModal(opportunity)}>
            <Maximize2 className="h-3 w-3 mr-1" /> Full View
          </Button>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-bold"
          style={{ color: config?.color, borderColor: `${config?.color}40`, backgroundColor: `${config?.color}10` }}
        >
          {config?.label || opportunity.stage}
        </Badge>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pipeline-scrollbar p-4 space-y-4">
        {/* UW Report Section */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Underwriting Review
          </h4>

          {latestReport ? (
            <div className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
              {/* Score row */}
              <div className="flex items-center gap-2 flex-wrap">
                {statusIcon(latestReport.readiness_score)}
                {latestReport.score !== null && (
                  <Badge variant="outline" className="text-[10px] gap-1 font-mono">
                    <BarChart3 className="h-3 w-3" />
                    <span className={scoreColor(latestReport.score)}>{latestReport.score}/100</span>
                  </Badge>
                )}
                {latestReport.website_score !== null && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Globe className="h-3 w-3" />
                    <span className={scoreColor(latestReport.website_score)}>{latestReport.website_score}/100</span>
                  </Badge>
                )}
                {latestReport.recommendation && (
                  <Badge variant="outline" className={cn("text-[10px] gap-1", recommendationColor(latestReport.recommendation))}>
                    <Scale className="h-3 w-3" />
                    {recommendationLabel(latestReport.recommendation)}
                  </Badge>
                )}
                {latestReport.no_change && (
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-muted-foreground/30">No change</Badge>
                )}
              </div>

              {/* Summary */}
              {latestReport.summary && (
                <p className="text-xs text-muted-foreground line-clamp-3">{latestReport.summary}</p>
              )}

              {/* Meta */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(latestReport.created_at), { addSuffix: true })}
                <span>·</span>
                <User className="h-3 w-3" />
                {displayName(latestReport.triggered_by)}
              </div>

              {/* Report history sparkline */}
              {reportHistory.length > 1 && (
                <div className="flex items-center gap-1 pt-1">
                  <span className="text-[9px] text-muted-foreground mr-1">History:</span>
                  {reportHistory.map((r, i) => (
                    <div
                      key={r.id}
                      className={cn(
                        "w-5 h-5 rounded text-[8px] font-mono flex items-center justify-center border",
                        i === 0 ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"
                      )}
                      title={`${r.score ?? '?'}/10 — ${new Date(r.created_at).toLocaleDateString()}`}
                    >
                      <span className={r.score !== null ? scoreColor(r.score) : "text-muted-foreground"}>
                        {r.score ?? "?"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center space-y-2">
              <Wand2 className="h-7 w-7 mx-auto text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No underwriting review yet</p>
            </div>
          )}

          <Button
            size="sm"
            variant={latestReport ? "outline" : "default"}
            className="w-full h-8 text-xs"
            onClick={handleRunReview}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
            {isRunning ? "Reviewing…" : latestReport ? "Re-run Review" : "Run Underwriting Review"}
          </Button>
        </div>

        {/* Latest note */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Notes
          </h4>

          {latestNote ? (
            <div className="rounded-lg border border-border bg-card/30 p-2.5 space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-medium">{displayName(latestNote.user_email)}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(latestNote.created_at), { addSuffix: true })}</span>
              </div>
              <p className="text-xs text-foreground/80 line-clamp-3">{latestNote.content}</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">No notes yet</p>
          )}

          {/* Quick note input */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Quick note…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[36px] h-9 text-xs resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleQuickNote();
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3"
              onClick={handleQuickNote}
              disabled={!newNote.trim() || isSubmitting}
            >
              <MessageSquare className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipelineUWPreview;
