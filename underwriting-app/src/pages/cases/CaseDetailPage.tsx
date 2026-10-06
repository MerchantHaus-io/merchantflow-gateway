import { Link, useParams } from "react-router-dom";
import { useCase } from "@/hooks/useCases";
import { useTenant } from "@/contexts/TenantContext";
import { CaseForm } from "@/components/cases/CaseForm";
import { DocumentUpload } from "@/components/cases/DocumentUpload";
import { UnderwritingReviewPanel } from "@/components/underwriting/UnderwritingReviewPanel";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft } from "lucide-react";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { org } = useTenant();
  const { caseRow, loading, update } = useCase(id);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading…
      </div>
    );
  }
  if (!caseRow || !org) {
    return <p className="text-sm text-muted-foreground">Case not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/cases" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to cases
        </Link>
        <h1 className="text-2xl font-semibold">
          {caseRow.legal_name || caseRow.dba_name || "Untitled merchant"}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <CaseForm caseRow={caseRow} onSave={update} />
          <DocumentUpload orgId={org.id} caseId={caseRow.id} />
        </div>
        <UnderwritingReviewPanel caseId={caseRow.id} />
      </div>
    </div>
  );
}
