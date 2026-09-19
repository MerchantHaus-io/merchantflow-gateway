import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCases, createCase } from "@/hooks/useCases";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Plus, FileSearch } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  complete: "Complete",
};

export default function CasesPage() {
  const { cases, loading, reload } = useCases();
  const { user } = useAuth();
  const { org } = useTenant();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const newCase = async () => {
    if (!org || !user) return;
    setCreating(true);
    try {
      const c = await createCase(org.id, user.id, { legal_name: "Untitled merchant" });
      await reload();
      navigate(`/cases/${c.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create case");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cases</h1>
          <p className="text-sm text-muted-foreground">Merchant applications under review.</p>
        </div>
        <Button onClick={newCase} disabled={creating}>
          {creating ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          New case
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Loading…
        </div>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSearch className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No cases yet. Create one to capture a merchant application and run an underwriting review.
            </p>
            <Button onClick={newCase} disabled={creating}>
              <Plus className="h-4 w-4" /> New case
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-md border">
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/cases/${c.id}`)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.legal_name || c.dba_name || "Untitled merchant"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.website_url || "No website"} · {c.service_type === "gateway_only" ? "Gateway only" : "Processing"}
                </p>
              </div>
              <Badge variant="secondary">{STATUS_LABEL[c.status] ?? c.status}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
