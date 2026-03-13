import { useState, useCallback } from "react";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EMAIL_TO_USER } from "@/types/opportunity";
import {
  Wand2, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Eye, Clock, User, Globe, FileText, Tag, BarChart3,
} from "lucide-react";
import { format } from "date-fns";

interface AIValidatePanelProps {
  opportunityId: string;
}

interface UnifiedReport {
  readiness_score: string;
  website_score?: number;
  website_score_label?: string;
  summary: string;
  recommended_mcc?: { code: string; description: string; rationale: string };
  transaction_mix_assessment?: string;
  document_completeness?: { document: string; status: string; note?: string }[];
  website_requirements?: { requirement: string; met: boolean; detail?: string }[];
  classification_issues?: { file_name: string; issue: string }[];
  data_gaps?: string[];
  red_flags?: { flag: string; severity: string; detail?: string }[];
  recommended_actions?: string[];
}

interface ReportMeta {
  triggered_by: string;
  created_at: string;
  no_change: boolean;
  website_url?: string;
}

const displayName = (email: string) => EMAIL_TO_USER[email?.toLowerCase()] || email || "Unknown";

const readinessIcon = (score: string) => {
  if (score === "ready" || score === "green") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (score === "needs_attention" || score === "yellow") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

const readinessLabel = (score: string) => {
  if (score === "ready" || score === "green") return "🟢 Ready";
  if (score === "needs_attention" || score === "yellow") return "🟡 Needs Attention";
  return "🔴 Not Ready";
};

const scoreColor = (score: number) => {
  if (score >= 8) return "text-emerald-500";
  if (score >= 6) return "text-amber-500";
  if (score >= 4) return "text-orange-500";
  return "text-destructive";
};

const MetaLine = ({ meta }: { meta: ReportMeta }) => (
  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(meta.created_at), "dd MMM yyyy, HH:mm")}</span>
    <span className="flex items-center gap-1"><User className="h-3 w-3" />{displayName(meta.triggered_by)}</span>
    {meta.no_change && <Badge variant="outline" className="text-[9px] py-0 px-1 border-muted-foreground/30">No change</Badge>}
  </div>
);

export const AIValidatePanel = ({ opportunityId }: AIValidatePanelProps) => {
  const { underwritingReview } = useAIAssistant();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<UnifiedReport | null>(null);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAsNote = useCallback(async () => {
    if (!report) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const lines: string[] = [];
      lines.push(`## AI Underwriting Review — ${readinessLabel(report.readiness_score)}`);
      if (report.website_score !== undefined) lines.push(`Website Score: ${report.website_score}/10 (${report.website_score_label || ""})`);
      if (report.summary) lines.push(`\n${report.summary}`);
      if (report.recommended_mcc) lines.push(`\nRecommended MCC: ${report.recommended_mcc.code} — ${report.recommended_mcc.description}\n${report.recommended_mcc.rationale}`);
      if (report.transaction_mix_assessment) lines.push(`\nTransaction Mix: ${report.transaction_mix_assessment}`);
      if (report.document_completeness?.length) {
        lines.push(`\n### Documents`);
        report.document_completeness.forEach(d => lines.push(`- [${d.status === "present" ? "✅" : d.status === "missing" ? "❌" : "⚠️"}] ${d.document}${d.note ? ` — ${d.note}` : ""}`));
      }
      if (report.website_requirements?.length) {
        lines.push(`\n### Website`);
        report.website_requirements.forEach(r => lines.push(`- [${r.met ? "✅" : "❌"}] ${r.requirement}${r.detail ? ` — ${r.detail}` : ""}`));
      }
      if (report.red_flags?.length) {
        lines.push(`\n### Red Flags`);
        report.red_flags.forEach(f => lines.push(`- 🚩 [${f.severity}] ${f.flag}${f.detail ? ` — ${f.detail}` : ""}`));
      }
      if (report.data_gaps?.length) {
        lines.push(`\n### Data Gaps`);
        report.data_gaps.forEach(g => lines.push(`- ❌ ${g}`));
      }
      if (report.recommended_actions?.length) {
        lines.push(`\n### Recommended Actions`);
        report.recommended_actions.forEach(a => lines.push(`- → ${a}`));
      }

      const content = lines.join("\n");
      const { error } = await supabase.from("comments").insert({
        opportunity_id: opportunityId,
        content,
        user_id: user?.id || null,
        user_email: user?.email || null,
      });
      if (error) throw error;

      await supabase.from("activities").insert({
        opportunity_id: opportunityId,
        type: "ai_report_saved",
        description: `AI Underwriting Review saved as note — ${readinessLabel(report.readiness_score)}`,
        user_id: user?.id || null,
        user_email: user?.email || null,
      });

      toast.success("Report saved as note");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save report");
    } finally {
      setIsSaving(false);
    }
  }, [report, opportunityId]);

  const handleReview = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await underwritingReview(opportunityId);
      if (result?.error) {
        toast.error(result.error);
      } else if (result?.report) {
        setReport(result.report);
        setMeta({
          triggered_by: result.triggered_by || "unknown",
          created_at: result.created_at || new Date().toISOString(),
          no_change: !!result.no_change,
          website_url: result.website_url,
        });
        if (result.no_change) {
          toast.info("No change from previous review");
        } else {
          toast.success("Underwriting Review complete — saved as note");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Underwriting Review failed — please try again");
    } finally {
      setIsRunning(false);
    }
  }, [opportunityId, underwritingReview]);

  const fetchLatestReport = useCallback(async () => {
    const { data } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) {
      setReport(data as unknown as UnifiedReport);
      setMeta({
        triggered_by: (data as any).triggered_by || "unknown",
        created_at: (data as any).created_at || "",
        no_change: !!(data as any).no_change,
      });
    } else {
      toast("No previous report found");
    }
  }, [opportunityId]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Wand2 className="h-4 w-4" />
        Underwriting Review
      </h3>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={handleReview} disabled={isRunning}>
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
          {isRunning ? "Reviewing…" : "Run Underwriting Review"}
        </Button>
        <Button size="sm" variant="ghost" onClick={fetchLatestReport}>
          <Eye className="h-3 w-3 mr-1" /> Last Report
        </Button>
      </div>

      {/* Report */}
      {report && (
        <div className={cn("border rounded-lg p-4 space-y-3", meta?.no_change ? "bg-muted/30 border-muted-foreground/20" : "bg-card border-border")}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {readinessIcon(report.readiness_score)}
              <h4 className="text-sm font-semibold flex items-center gap-2">
                {readinessLabel(report.readiness_score)}
                {meta?.no_change && <Badge variant="outline" className="text-[9px] py-0 px-1">No change</Badge>}
              </h4>
              {report.website_score !== undefined && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Globe className="h-3 w-3" />
                  <span className={scoreColor(report.website_score)}>{report.website_score}/10</span>
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleSaveAsNote} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                Save Note
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {meta && <MetaLine meta={meta} />}
          {report.summary && !meta?.no_change && (
            <p className="text-xs text-muted-foreground">{report.summary}</p>
          )}

          {/* MCC Recommendation (always visible) */}
          {report.recommended_mcc && !meta?.no_change && (
            <div className="flex items-start gap-2 bg-primary/5 rounded-md p-2 border border-primary/20">
              <Tag className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-primary">{report.recommended_mcc.code}</span>
                <span className="text-foreground"> — {report.recommended_mcc.description}</span>
                <p className="text-muted-foreground mt-0.5">{report.recommended_mcc.rationale}</p>
              </div>
            </div>
          )}

          {/* Transaction Mix (always visible) */}
          {report.transaction_mix_assessment && !meta?.no_change && (
            <div className="flex items-start gap-2 text-xs">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{report.transaction_mix_assessment}</span>
            </div>
          )}

          {/* Expandable details */}
          {showDetails && !meta?.no_change && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              {/* Document Completeness */}
              {report.document_completeness && report.document_completeness.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Documents</p>
                  <div className="space-y-1">
                    {report.document_completeness.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {d.status === "present"
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          : d.status === "missing"
                            ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                            : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
                        <span className={cn(d.status === "missing" && "text-destructive")}>
                          {d.document}{d.note ? ` — ${d.note}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Website Requirements */}
              {report.website_requirements && report.website_requirements.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><Globe className="h-3 w-3" /> Website</p>
                  <div className="space-y-1">
                    {report.website_requirements.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {r.met
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                        <span className={cn(!r.met && "text-destructive")}>
                          {r.requirement}{r.detail ? ` — ${r.detail}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Red Flags */}
              {report.red_flags && report.red_flags.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">🚩 Red Flags</p>
                  <div className="space-y-1">
                    {report.red_flags.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className={cn(
                          "h-3.5 w-3.5 shrink-0 mt-0.5",
                          f.severity === "critical" || f.severity === "high" ? "text-destructive" :
                          f.severity === "medium" ? "text-amber-500" : "text-muted-foreground"
                        )} />
                        <span>
                          <Badge variant="outline" className="text-[9px] mr-1 py-0 px-1">{f.severity}</Badge>
                          {f.flag}{f.detail ? ` — ${f.detail}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Gaps */}
              {report.data_gaps && report.data_gaps.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">❌ Data Gaps</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {report.data_gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />{g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended Actions */}
              {report.recommended_actions && report.recommended_actions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">💡 Actions</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {report.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">→</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Classification Issues */}
              {report.classification_issues && report.classification_issues.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">📎 Classification Issues</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {report.classification_issues.map((c, i) => (
                      <li key={i}>{c.file_name}: {c.issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
