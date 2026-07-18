// Live count of accepted-but-not-yet-contracted quotes.
//
// Surfaces in the nav so operators see new merchant acceptances without
// having to navigate to /tools/quote-builder. The "Generate Contract"
// affordance on that page is the action — this hook only counts.
//
// Status filter: 'accepted'. There's no separate "contract_generated"
// flag yet, so the count includes every accepted quote until status is
// manually moved to 'won' or similar by the operator's workflow.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 60_000; // 1 minute

export function useAcceptedQuotesCount() {
  return useQuery({
    queryKey: ["accepted-quotes-count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .is("archived_at", null);
      if (error) {
        // Soft-fail: nav shouldn't crash if the user has no quotes RLS.
        console.warn("accepted-quotes-count query failed:", error.message);
        return 0;
      }
      return count ?? 0;
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
