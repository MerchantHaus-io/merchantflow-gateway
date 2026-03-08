import { useState, useCallback } from "react";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Wand2, Globe, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Eye,
} from "lucide-react";

interface AIValidatePanelProps {
  opportunityId: string;
}

interface WebsiteReport {
  score: number;
  score_label: string;
  summary: string;
  requirements_met: { requirement: string; met: boolean; detail?: string }[];
  red_flags: { flag: string; severity: string; detail?: string }[];
  recommendations: string[];
}

interface DocReport {
  readiness_score: string;
  summary: string;
  document_completeness: { document: string; status: string; note?: string }[];
  data_gaps: string[];
  risk_flags: { flag: string; severity: string }[] | string[];
  recommended_actions: string[];
  classification_issues: { file_name: string; issue: string }[];
}

const scoreColor = (score: number) => {
  if (score >= 8) return "text-emerald-500";
  if (score >= 6) return "text-amber-500";
  if (score >= 4) return "text-orange-500";
  return "text-destructive";
};

const scoreBg = (score: number) => {
  if (score >= 8) return "bg-emerald-500/10 border-emerald-500/30";
  if (score >= 6) return "bg-amber-500/10 border-amber-500/30";
  if (score >= 4) return "bg-orange-500/10 border-orange-500/30";
  return "bg-destructive/10 border-destructive/30";
};

const readinessIcon = (score: string) => {
  if (score === "ready" || score === "green") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (score === "needs_attention" || score === "yellow") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

export const AIValidatePanel = ({ opportunityId }: AIValidatePanelProps) => {
  const { validateDocuments, scrutinizeWebsite } = useAIAssistant();
  const [isValidating, setIsValidating] = useState(false);
  const [isScrutinizing, setIsScrutinizing] = useState(false);
  const [docReport, setDocReport] = useState<DocReport | null>(null);
  const [websiteReport, setWebsiteReport] = useState<WebsiteReport | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [showDocDetails, setShowDocDetails] = useState(false);
  const [showWebDetails, setShowWebDetails] = useState(false);

  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    try {
      const result = await validateDocuments(opportunityId);
      if (result?.report) {
        setDocReport(result.report);
        toast.success("Document validation complete");
      }
    } catch {
      toast.error("AI validation failed — please try again");
    } finally {
      setIsValidating(false);
    }
  }, [opportunityId, validateDocuments]);

  const handleScrutinize = useCallback(async () => {
    setIsScrutinizing(true);
    try {
      const result = await scrutinizeWebsite(opportunityId);
      if (result?.error) {
        toast.error(result.error);
      } else if (result?.report) {
        setWebsiteReport(result.report);
        setWebsiteUrl(result.website_url);
        toast.success("Website scrutiny complete");
      }
    } catch (err: any) {
      const msg = err?.message || "Website scrutiny failed";
      toast.error(msg);
    } finally {
      setIsScrutinizing(false);
    }
  }, [opportunityId, scrutinizeWebsite]);

  const fetchLatestDocReport = useCallback(async () => {
    const { data } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) {
      setDocReport(data as unknown as DocReport);
    } else {
      toast("No previous report found");
    }
  }, [opportunityId]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Wand2 className="h-4 w-4" />
        AI Underwriting Analysis
      </h3>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={handleValidate} disabled={isValidating}>
          {isValidating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
          Validate Docs
        </Button>
        <Button size="sm" variant="outline" onClick={handleScrutinize} disabled={isScrutinizing}>
          {isScrutinizing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
          Scrutinize Website
        </Button>
        <Button size="sm" variant="ghost" onClick={fetchLatestDocReport}>
          <Eye className="h-3 w-3 mr-1" /> Last Report
        </Button>
      </div>

      {/* Website Scrutiny Result */}
      {websiteReport && (
        <div className={cn("border rounded-lg p-4 space-y-3", scoreBg(websiteReport.score))}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("text-3xl font-bold tabular-nums", scoreColor(websiteReport.score))}>
                {websiteReport.score}/10
              </div>
              <div>
                <p className="text-sm font-semibold">Website Readiness</p>
                {websiteUrl && (
                  <a href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline truncate block max-w-[200px]">
                    {websiteUrl}
                  </a>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowWebDetails(!showWebDetails)}>
              {showWebDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{websiteReport.summary}</p>

          {showWebDetails && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              {/* Requirements checklist */}
              {websiteReport.requirements_met?.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">Requirements</p>
                  <div className="space-y-1">
                    {websiteReport.requirements_met.map((r, i) => (
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

              {/* Red flags */}
              {websiteReport.red_flags?.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">Red Flags</p>
                  <div className="space-y-1">
                    {websiteReport.red_flags.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className={cn(
                          "h-3.5 w-3.5 shrink-0 mt-0.5",
                          f.severity === "critical" ? "text-destructive" :
                          f.severity === "high" ? "text-destructive" :
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

              {/* Recommendations */}
              {websiteReport.recommendations?.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">Recommendations</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {websiteReport.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">→</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document Validation Result */}
      {docReport && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {readinessIcon(docReport.readiness_score)}
              <h4 className="text-sm font-semibold">
                Doc Readiness: {docReport.readiness_score === "ready" || docReport.readiness_score === "green" ? "🟢 Ready" : docReport.readiness_score === "needs_attention" || docReport.readiness_score === "yellow" ? "🟡 Needs Attention" : "🔴 Not Ready"}
              </h4>
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowDocDetails(!showDocDetails)}>
              {showDocDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
          {docReport.summary && (
            <p className="text-xs text-muted-foreground">{docReport.summary}</p>
          )}

          {showDocDetails && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              {Array.isArray(docReport.risk_flags) && docReport.risk_flags.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Risk Flags</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {docReport.risk_flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        {typeof f === "string" ? f : f.flag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(docReport.data_gaps) && docReport.data_gaps.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Data Gaps</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {docReport.data_gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />{g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(docReport.recommended_actions) && docReport.recommended_actions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Actions</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {docReport.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-primary mt-0.5">→</span>{a}
                      </li>
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
