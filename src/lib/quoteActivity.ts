// Best-effort logging of quote lifecycle events to the opportunity activity
// timeline. Quotes carry an optional opportunity_id; when present, meaningful
// lifecycle events (sent / accepted / archived / restored) are written to the
// `activities` table so they surface in the opportunity's Activity feed and the
// Quotes tab. Draft auto-saves are intentionally NOT logged — they fire on
// every keystroke and would flood the timeline.
//
// This never throws: a failed activity insert must not break the quote flow.

import { supabase } from "@/integrations/supabase/client";

export type QuoteActivityType =
  | "quote_sent"
  | "quote_accepted"
  | "quote_archived"
  | "quote_restored";

export async function logQuoteActivity(params: {
  opportunityId?: string | null;
  type: QuoteActivityType;
  description: string;
}): Promise<void> {
  if (!params.opportunityId) return;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;
    await supabase.from("activities").insert({
      opportunity_id: params.opportunityId,
      type: params.type,
      description: params.description,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    });
  } catch (err) {
    console.warn("logQuoteActivity failed:", err);
  }
}
