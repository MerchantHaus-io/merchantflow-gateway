import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StoredReport } from "@/lib/report-types";

/**
 * Loads the latest stored underwriting report for a case and can trigger a fresh
 * review via the tenant-scoped edge function. Replaces the CRM's
 * useAIAssistant.underwritingReview.
 */
export function useUnderwritingReview(caseId: string | undefined) {
  const [report, setReport] = useState<StoredReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadLatest = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    const { data } = await supabase
      .from("validation_reports")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setReport((data as unknown as StoredReport) ?? null);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const runReview = useCallback(async (): Promise<{ error: string | null }> => {
    if (!caseId) return { error: "No case" };
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("underwriting-review", {
      body: { caseId },
    });
    setRunning(false);
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    await loadLatest();
    return { error: null };
  }, [caseId, loadLatest]);

  return { report, loading, running, runReview, reload: loadLatest };
}
