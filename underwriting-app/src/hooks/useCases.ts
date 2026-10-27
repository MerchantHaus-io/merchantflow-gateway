import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { Database } from "@/integrations/supabase/types";

export type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
export type CaseInsert = Database["public"]["Tables"]["cases"]["Insert"];
export type CaseUpdate = Database["public"]["Tables"]["cases"]["Update"];

export function useCases() {
  const { org } = useTenant();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const { data } = await supabase
      .from("cases")
      .select("*")
      .eq("org_id", org.id)
      .order("updated_at", { ascending: false });
    setCases((data as CaseRow[]) ?? []);
    setLoading(false);
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  return { cases, loading, reload: load };
}

/** Create a case scoped to the current org. org_id/created_by are set here — RLS
 *  also enforces org membership on the write. */
export async function createCase(orgId: string, userId: string, patch: Partial<CaseInsert>) {
  const { data, error } = await supabase
    .from("cases")
    .insert({ org_id: orgId, created_by: userId, ...patch })
    .select()
    .single();
  if (error) throw error;
  return data as CaseRow;
}

export function useCase(caseId: string | undefined) {
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    const { data } = await supabase.from("cases").select("*").eq("id", caseId).maybeSingle();
    setCaseRow((data as CaseRow) ?? null);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (patch: CaseUpdate) => {
      if (!caseId) return;
      const { data, error } = await supabase
        .from("cases")
        .update(patch)
        .eq("id", caseId)
        .select()
        .single();
      if (error) throw error;
      setCaseRow(data as CaseRow);
      return data as CaseRow;
    },
    [caseId],
  );

  return { caseRow, loading, reload: load, update };
}
