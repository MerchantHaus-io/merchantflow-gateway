import { useState, useCallback, useEffect, useRef } from "react";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { confirmAutoEmail } from "@/components/EmailSendConfirm";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";
import { buildDocsRequestHtml, buildDocsRequestSubject } from "@/lib/docs-request-email";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EMAIL_TO_USER, isEmailAllowed } from "@/types/opportunity";
import { isHiddenUser } from "@/lib/hidden-users";
import {
  Wand2, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Eye, Clock, User, Globe, FileText, Tag, BarChart3, Shield, Search, Scale, Pin, Send,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

interface AIValidatePanelProps {
  opportunityId: string;
}

interface ScoreBreakdownItem {
  category: string;
  max_score: number;
  score: number;
  note: string;
}

interface PublicCheck {
  check: string;
  tool?: string;
  result: string;
}

interface UnifiedReport {
  readiness_score: string;
  score?: number;
  confidence?: string;
  recommendation?: string;
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
  risk_tier?: string;
  ofac_screening?: string;
  score_breakdown?: ScoreBreakdownItem[];
  hard_stops?: string[];
  public_checks_performed?: PublicCheck[];
  validity_conclusion?: string;
  validity_justification?: string;
}

interface ReportMeta {
  triggered_by: string;
  created_at: string;
  no_change: boolean;
  website_url?: string;
}

const displayName = (email: string) => EMAIL_TO_USER[email?.toLowerCase()] || email || "Unknown";

const statusIcon = (score: string) => {
  if (score === "ready" || score === "green") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (score === "needs_attention" || score === "yellow") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

const statusLabel = (score: string) => {
  if (score === "ready" || score === "green") return "🟢 Proceed";
  if (score === "needs_attention" || score === "yellow") return "🟡 Needs Attention";
  return "🔴 Decline/Escalate";
};

const recommendationLabel = (rec?: string) => {
  const map: Record<string, string> = {
    proceed: "Proceed",
    proceed_with_conditions: "Proceed with Conditions",
    request_information: "Request Information",
    escalate_to_risk: "Escalate to Risk",
    decline: "Decline",
  };
  return map[rec || ""] || rec || "";
};

const recommendationColor = (rec?: string) => {
  if (rec === "proceed") return "text-emerald-500";
  if (rec === "proceed_with_conditions") return "text-amber-500";
  if (rec === "request_information") return "text-blue-500";
  if (rec === "escalate_to_risk" || rec === "decline") return "text-destructive";
  return "text-muted-foreground";
};

const validityLabel = (v?: string) => {
  const map: Record<string, string> = {
    likely_valid: "Likely Valid",
    inconclusive: "Inconclusive",
    likely_invalid: "Likely Invalid",
  };
  return map[v || ""] || v || "";
};

const validityColor = (v?: string) => {
  if (v === "likely_valid") return "text-emerald-600 dark:text-emerald-400";
  if (v === "inconclusive") return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
};

const scoreColor = (score: number) => {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
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
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<UnifiedReport | null>(null);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingMerchant, setIsSendingMerchant] = useState(false);

  // Email preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");
  const [previewRecipient, setPreviewRecipient] = useState<{ email: string; name?: string }>({ email: "" });


  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinActionText, setPinActionText] = useState("");
  const [pinSelectedUsers, setPinSelectedUsers] = useState<string[]>([]);
  const [isPinning, setIsPinning] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; email: string | null; full_name: string | null }[]>([]);

  useEffect(() => {
    supabase.from("profiles").select("id, email, full_name").then(({ data }) => {
      // Restrict pin-to-notice-board assignees to internal staff only — referrers must
      // never appear here.
      if (data) setProfiles(data.filter((p) => isEmailAllowed(p.email || "")));
    });
  }, []);

  const handlePinToNoticeBoard = useCallback(async () => {
    if (!pinActionText.trim() || !user || pinSelectedUsers.length === 0) return;
    setIsPinning(true);
    try {
      const { error } = await supabase.from("action_items").insert({
        title: pinActionText.trim(),
        created_by: user.id,
        created_by_email: user.email || "",
        assigned_to: pinSelectedUsers,
      });
      if (error) throw error;

      // Also create a linked task
      await supabase.from("tasks").insert({
        title: pinActionText.trim(),
        assignee: pinSelectedUsers[0],
        created_by: user.email || "",
        source: "notice",
        status: "open",
        priority: "medium",
      });

      // Send email notification to tagged users
      const taggedEmails = pinSelectedUsers
        .map((name) => profiles.find((p) => p.full_name === name || p.email === name)?.email)
        .filter(Boolean) as string[];
      if (taggedEmails.length > 0) {
        const posterName = profiles.find((p) => p.id === user.id)?.full_name || user.email || "Someone";
        const ok = await confirmAutoEmail(
          `A notice email will be sent to ${taggedEmails.length} tagged team member(s): ${taggedEmails.join(", ")}.`
        );
        if (ok) {
          supabase.functions.invoke("send-notice-email", {
            body: {
              title: pinActionText.trim(),
              postedBy: posterName,
              postedByEmail: user.email || "",
              taggedUsers: taggedEmails,
            },
          });
        }
      }

      toast.success("Action pinned to Notice Board");
      setPinDialogOpen(false);
      setPinActionText("");
      setPinSelectedUsers([]);
    } catch {
      toast.error("Failed to pin action");
    } finally {
      setIsPinning(false);
    }
  }, [pinActionText, pinSelectedUsers, user, profiles]);

  // Auto-load the latest report on mount
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("validation_reports")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setReport(data as unknown as UnifiedReport);
        setMeta({
          triggered_by: (data as any).triggered_by || "unknown",
          created_at: (data as any).created_at || "",
          no_change: !!(data as any).no_change,
        });
      }
    })();
  }, [opportunityId]);

  const handleSaveAsNote = useCallback(async () => {
    if (!report) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const lines: string[] = [];
      lines.push(`## AI Underwriting Review — ${statusLabel(report.readiness_score)}`);
      if (report.score !== undefined) lines.push(`Score: ${report.score}/100 | Confidence: ${report.confidence || "N/A"} | Recommendation: ${recommendationLabel(report.recommendation)}`);
      if (report.website_score !== undefined) lines.push(`Website Score: ${report.website_score}/100 (${report.website_score_label || ""})`);
      if (report.summary) lines.push(`\n${report.summary}`);

      if (report.score_breakdown?.length) {
        lines.push(`\n### Score Breakdown`);
        report.score_breakdown.forEach(b => lines.push(`- ${b.category} (0–${b.max_score}): ${b.score} — ${b.note}`));
      }

      lines.push(`\n### Hard Stops`);
      if (report.hard_stops?.length) {
        report.hard_stops.forEach(h => lines.push(`- ⛔ ${h}`));
      } else {
        lines.push(`- None`);
      }

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
      if (report.public_checks_performed?.length) {
        lines.push(`\n### Public Checks`);
        report.public_checks_performed.forEach(c => lines.push(`- ${c.check}${c.tool ? ` (${c.tool})` : ""}: ${c.result}`));
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
      if (report.validity_conclusion) {
        lines.push(`\n### Validity Conclusion`);
        lines.push(`${validityLabel(report.validity_conclusion)} — ${report.validity_justification || ""} — Confidence: ${report.confidence || "N/A"}`);
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
        description: `AI Underwriting Review saved as note — ${report.score ?? "N/A"}/100 — ${validityLabel(report.validity_conclusion)}`,
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

  // Holds context for the preview dialog so the send handler knows what to log/send.
  const sendContextRef = useRef<{
    accountName: string;
    contactEmail: string;
    contactFirstName: string;
    missingDocs: string[];
    websiteChanges: string[];
    recommendedActions: string[];
  } | null>(null);

  const handleSendToMerchant = useCallback(async () => {
    if (!report) return;
    const missingDocs = (report.document_completeness || [])
      .filter((d) => d.status === "missing")
      .map((d) => d.document + (d.note ? ` — ${d.note}` : ""));
    const websiteChanges = (report.website_requirements || [])
      .filter((r) => !r.met)
      .map((r) => r.requirement + (r.detail ? ` — ${r.detail}` : ""));

    // Filter recommended actions: only include merchant-facing items (skip internal ops chatter)
    const INTERNAL_KEYWORDS = /\b(internal|underwriter|underwriting team|escalate|risk team|ops|csr|csm|reserve|file note|do not share)\b/i;
    const recommendedActions = (report.recommended_actions || [])
      .map((a) => (a || "").trim())
      .filter((a) => a.length > 0 && !INTERNAL_KEYWORDS.test(a));

    if (missingDocs.length === 0 && websiteChanges.length === 0 && recommendedActions.length === 0) {
      toast.info("Nothing outstanding to request — report is clean.");
      return;
    }

    // Fetch contact + account
    const { data: opp } = await supabase
      .from("opportunities")
      .select("account_id, contact_id, account:accounts(name), contact:contacts(email, first_name)")
      .eq("id", opportunityId)
      .single();

    const contactEmail = (opp as any)?.contact?.email;
    const accountName = (opp as any)?.account?.name;
    const contactFirstName = (opp as any)?.contact?.first_name || "there";
    if (!contactEmail || !accountName) {
      toast.error("Missing contact email or account name");
      return;
    }

    const subject = buildDocsRequestSubject(accountName, missingDocs, websiteChanges, recommendedActions);
    const html = buildDocsRequestHtml({
      firstName: contactFirstName,
      accountName,
      opportunityId,
      missingDocs,
      websiteChanges,
      recommendedActions,
    });

    sendContextRef.current = {
      accountName,
      contactEmail,
      contactFirstName,
      missingDocs,
      websiteChanges,
      recommendedActions,
    };
    setPreviewSubject(subject);
    setPreviewBody(html);
    setPreviewRecipient({ email: contactEmail, name: contactFirstName });
    setPreviewOpen(true);
  }, [report, opportunityId]);

  const handleConfirmSendToMerchant = useCallback(
    async ({ subject, bodyHtml }: { subject: string; bodyHtml: string }) => {
      const ctx = sendContextRef.current;
      if (!ctx) return;
      setIsSendingMerchant(true);
      try {
        const { error } = await supabase.functions.invoke("send-qualified-docs-request", {
          body: {
            opportunity_id: opportunityId,
            account_name: ctx.accountName,
            contact_email: ctx.contactEmail,
            contact_first_name: ctx.contactFirstName,
            missing_documents: ctx.missingDocs,
            website_changes: ctx.websiteChanges,
            recommended_actions: ctx.recommendedActions,
            custom_subject: subject,
            custom_html: bodyHtml,
          },
        });
        if (error) throw error;
        toast.success("Request sent to merchant");
      } catch (err: any) {
        toast.error(err?.message || "Failed to send request");
        throw err;
      } finally {
        setIsSendingMerchant(false);
      }
    },
    [opportunityId],
  );


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
      .maybeSingle();
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
        <div className={cn("border rounded-lg p-4 space-y-3 overflow-hidden", meta?.no_change ? "bg-muted/30 border-muted-foreground/20" : "bg-card border-border")}>
          {/* Header row: status + score + recommendation */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {statusIcon(report.readiness_score)}
              <h4 className="text-sm font-semibold flex items-center gap-2">
                {statusLabel(report.readiness_score)}
                {meta?.no_change && <Badge variant="outline" className="text-[9px] py-0 px-1">No change</Badge>}
              </h4>
              {report.score !== undefined && (
                <Badge variant="outline" className="text-[10px] gap-1 font-mono">
                  <span className={scoreColor(report.score)}>{report.score}/100</span>
                </Badge>
              )}
              {report.confidence && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {report.confidence.charAt(0).toUpperCase() + report.confidence.slice(1)} confidence
                </Badge>
              )}
              {report.website_score !== undefined && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Globe className="h-3 w-3" />
                  <span className={scoreColor(report.website_score)}>{report.website_score}/100</span>
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={handleSendToMerchant}
                disabled={isSendingMerchant}
                title="Email merchant the missing docs and any website changes from this report"
              >
                {isSendingMerchant ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                Send to Merchant
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleSaveAsNote} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                Save Note
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Recommendation + Validity badges */}
          {!meta?.no_change && (report.recommendation || report.validity_conclusion) && (
            <div className="flex items-center gap-2 flex-wrap">
              {report.recommendation && (
                <Badge variant="outline" className={cn("text-[10px] gap-1", recommendationColor(report.recommendation))}>
                  <Scale className="h-3 w-3" />
                  {recommendationLabel(report.recommendation)}
                </Badge>
              )}
              {report.validity_conclusion && (
                <Badge variant="outline" className={cn("text-[10px] gap-1", validityColor(report.validity_conclusion))}>
                  <Shield className="h-3 w-3" />
                  {validityLabel(report.validity_conclusion)}
                </Badge>
              )}
              {report.risk_tier === "high_risk" && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  High-Risk MCC
                </Badge>
              )}
            </div>
          )}

          {meta && <MetaLine meta={meta} />}
          {report.summary && !meta?.no_change && (
            <p className="text-xs text-muted-foreground break-words">{report.summary}</p>
          )}

          {/* Hard Stops (always visible when present) */}
          {!meta?.no_change && report.hard_stops && report.hard_stops.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2.5 space-y-1">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" /> Hard Stops — Must Resolve
              </p>
              {report.hard_stops.map((h, i) => (
                <p key={i} className="text-xs text-destructive/90 pl-5 break-words">⛔ {h}</p>
              ))}
            </div>
          )}

          {/* Score Breakdown (always visible) */}
          {!meta?.no_change && report.score_breakdown && report.score_breakdown.length > 0 && (
            <div className="space-y-1.5 border border-border rounded-lg p-3 bg-card/50">
              <p className="text-xs font-medium flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Score Breakdown</p>
              <div className="grid gap-1.5">
                {report.score_breakdown.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs flex-wrap min-w-0">
                    <div className="w-[180px] shrink-0 text-muted-foreground truncate">{b.category} (0–{b.max_score})</div>
                    <div className="w-12 shrink-0">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", b.score >= b.max_score * 0.8 ? "bg-emerald-500" : b.score >= b.max_score * 0.5 ? "bg-amber-500" : "bg-destructive")}
                          style={{ width: `${Math.min(100, (b.score / b.max_score) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className={cn("font-mono text-[10px] w-8 shrink-0", scoreColor((b.score / b.max_score) * 100))}>{b.score}/{b.max_score}</span>
                    <span className="text-muted-foreground break-words min-w-0">{b.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MCC Recommendation (always visible) */}
          {report.recommended_mcc && !meta?.no_change && (
            <div className="flex items-start gap-2 bg-primary/5 rounded-md p-2 border border-primary/20">
              <Tag className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs min-w-0">
                <span className="font-semibold text-primary">{report.recommended_mcc.code}</span>
                <span className="text-foreground"> — {report.recommended_mcc.description}</span>
                <p className="text-muted-foreground mt-0.5 break-words">{report.recommended_mcc.rationale}</p>
              </div>
            </div>
          )}

          {/* OFAC Screening (always visible) */}
          {report.ofac_screening && !meta?.no_change && (
            <div className="flex items-start gap-2 text-xs">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground min-w-0 break-words"><span className="font-medium text-foreground">OFAC:</span> {report.ofac_screening}</span>
            </div>
          )}

          {/* Transaction Mix (always visible) */}
          {report.transaction_mix_assessment && !meta?.no_change && (
            <div className="flex items-start gap-2 text-xs">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground min-w-0 break-words">{report.transaction_mix_assessment}</span>
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
                        <span className={cn("min-w-0 break-words", d.status === "missing" && "text-destructive")}>
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
                        <span className={cn("min-w-0 break-words", !r.met && "text-destructive")}>
                          {r.requirement}{r.detail ? ` — ${r.detail}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Public Checks Performed */}
              {report.public_checks_performed && report.public_checks_performed.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><Search className="h-3 w-3" /> Public Checks Performed</p>
                  <div className="space-y-1">
                    {report.public_checks_performed.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Search className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground min-w-0 break-words">
                          <span className="font-medium text-foreground">{c.check}</span>
                          {c.tool ? ` (${c.tool})` : ""}: {c.result}
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
                          <span className="break-words">{f.flag}{f.detail ? ` — ${f.detail}` : ""}</span>
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
                        <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" /><span className="min-w-0 break-words">{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended Actions */}
              {report.recommended_actions && report.recommended_actions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">💡 Actions</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {report.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 group">
                        <span className="text-primary mt-0.5 shrink-0">→</span>
                        <span className="min-w-0 break-words flex-1">{a}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Pin to Notice Board"
                          onClick={() => {
                            setPinActionText(a);
                            setPinDialogOpen(true);
                          }}
                        >
                          <Pin className="h-3 w-3" />
                        </Button>
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
                      <li key={i} className="break-words">{c.file_name}: {c.issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validity Conclusion */}
              {report.validity_conclusion && (
                <div className={cn(
                  "rounded-md p-2.5 border",
                  report.validity_conclusion === "likely_valid" ? "bg-emerald-500/5 border-emerald-500/20" :
                  report.validity_conclusion === "inconclusive" ? "bg-amber-500/5 border-amber-500/20" :
                  "bg-destructive/5 border-destructive/20"
                )}>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Scale className="h-3.5 w-3.5" />
                    <span className={validityColor(report.validity_conclusion)}>
                      Validity: {validityLabel(report.validity_conclusion)}
                    </span>
                    {report.confidence && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 ml-1">{report.confidence} confidence</Badge>
                    )}
                  </p>
                  {report.validity_justification && (
                    <p className="text-xs text-muted-foreground mt-1 pl-5 break-words">{report.validity_justification}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pin to Notice Board Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Pin className="h-4 w-4" /> Pin Action to Notice Board
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 p-3 text-xs text-foreground">
              {pinActionText}
            </div>
            <div>
              <p className="text-xs font-medium mb-2">Assign to team member(s):</p>
              <div className="space-y-2">
                {profiles.filter(p => p.email && p.full_name).map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={pinSelectedUsers.includes(p.full_name || p.email || "")}
                      onCheckedChange={(checked) => {
                        const name = p.full_name || p.email || "";
                        setPinSelectedUsers(prev =>
                          checked ? [...prev, name] : prev.filter(u => u !== name)
                        );
                      }}
                    />
                    <span>{p.full_name || p.email}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPinDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handlePinToNoticeBoard}
              disabled={isPinning || pinSelectedUsers.length === 0}
            >
              {isPinning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Pin className="h-3 w-3 mr-1" />}
              Pin & Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        subject={previewSubject}
        bodyHtml={previewBody}
        recipientEmail={previewRecipient.email}
        recipientName={previewRecipient.name}
        onSend={handleConfirmSendToMerchant}
      />
    </div>
  );
};
