import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ScanSearch, ShieldCheck, Flag, ListChecks } from "lucide-react";
import { useUnderwritingReview } from "@/hooks/useUnderwritingReview";
import { cn } from "@/lib/utils";
import {
  READINESS_CLASS, READINESS_LABEL, RECOMMENDATION_LABEL, VALIDITY_LABEL,
  SEVERITY_CLASS, scoreColor,
} from "@/lib/report-format";
import type { ReadinessScore, Recommendation, ValidityConclusion } from "@/lib/report-types";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { HardStops } from "./HardStops";
import { DocumentChecklist } from "./DocumentChecklist";
import { WebsiteReview } from "./WebsiteReview";
import { toast } from "sonner";

// De-CRM'd port of AIValidatePanel. Same report surface, none of the CRM email /
// pin-to-channel / hidden-user machinery.
export function UnderwritingReviewPanel({ caseId }: { caseId: string }) {
  const { report, loading, running, runReview } = useUnderwritingReview(caseId);

  const run = async () => {
    const { error } = await runReview();
    if (error) toast.error(error);
    else toast.success("Underwriting review complete");
  };

  const r = report?.raw_report;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Underwriting Review
        </CardTitle>
        <Button onClick={run} disabled={running}>
          {running ? <Spinner className="h-4 w-4" /> : <ScanSearch className="h-4 w-4" />}
          {running ? "Reviewing…" : report ? "Re-run review" : "Run review"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Loading…
          </div>
        ) : !r ? (
          <p className="text-sm text-muted-foreground">
            No review yet. Upload the merchant's documents, then run the review to score
            readiness, screen for hard stops, and get an operational recommendation.
          </p>
        ) : (
          <>
            {/* Header row: status, score, confidence, recommendation */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={cn("border", READINESS_CLASS[r.readiness_score as ReadinessScore])}>
                {READINESS_LABEL[r.readiness_score as ReadinessScore] ?? r.readiness_score}
              </Badge>
              {r.score != null && (
                <span className={cn("text-2xl font-bold", scoreColor(r.score))}>
                  {r.score}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </span>
              )}
              {r.confidence && (
                <span className="text-sm text-muted-foreground">Confidence: {r.confidence}</span>
              )}
              {r.recommendation && (
                <Badge variant="secondary">
                  {RECOMMENDATION_LABEL[r.recommendation as Recommendation] ?? r.recommendation}
                </Badge>
              )}
              {r.risk_tier === "high_risk" && <Badge variant="destructive">High-risk MCC</Badge>}
            </div>

            {r.summary && <p className="text-sm leading-relaxed">{r.summary}</p>}

            <HardStops items={r.hard_stops} />

            {r.recommended_mcc && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <span className="font-semibold">Recommended MCC:</span> {r.recommended_mcc.code} —{" "}
                {r.recommended_mcc.description}
                <p className="mt-1 text-xs text-muted-foreground">{r.recommended_mcc.rationale}</p>
              </div>
            )}

            <ScoreBreakdown items={r.score_breakdown} />
            <DocumentChecklist items={r.document_completeness} />
            <WebsiteReview requirements={r.website_requirements} websiteScore={r.website_score} />

            {r.ofac_screening && (
              <div className="text-sm">
                <span className="font-semibold">OFAC screening:</span> {r.ofac_screening}
              </div>
            )}

            {!!r.red_flags?.length && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Flag className="h-4 w-4 text-orange-500" /> Red flags
                </h4>
                <ul className="space-y-1.5">
                  {r.red_flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge className={cn("border shrink-0", SEVERITY_CLASS[f.severity])}>
                        {f.severity}
                      </Badge>
                      <span>
                        <span className="font-medium">{f.flag}</span>
                        {f.detail && <span className="text-muted-foreground"> — {f.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!r.recommended_actions?.length && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-primary" /> Recommended actions
                </h4>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {r.recommended_actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </div>
            )}

            {!!r.public_checks_performed?.length && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Public checks performed</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {r.public_checks_performed.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{c.check}</span>
                      {c.tool ? ` (${c.tool})` : ""}: {c.result}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.validity_conclusion && (
              <div className="rounded-md border p-3 text-sm">
                <span className="font-semibold">Validity conclusion:</span>{" "}
                {VALIDITY_LABEL[r.validity_conclusion as ValidityConclusion] ?? r.validity_conclusion}
                {r.validity_justification && (
                  <p className="mt-1 text-xs text-muted-foreground">{r.validity_justification}</p>
                )}
              </div>
            )}

            {report?.created_at && (
              <p className="text-xs text-muted-foreground">
                Last reviewed {new Date(report.created_at).toLocaleString()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
