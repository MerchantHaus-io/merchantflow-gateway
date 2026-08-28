import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The two per-deal facts the board reads but the opportunities row doesn't hold:
 * the next confirmed meeting, and the latest underwriting score.
 *
 * Every OpportunityCard used to fetch both for itself on mount, plus an avatar
 * — three round trips per card, so a forty-deal board opened with about a
 * hundred and twenty requests and fired them all again after every Refresh.
 * Worse, the card owned the data, so the "needs you today" queue had no way to
 * rank on the same signals the cards were showing; the two surfaces would have
 * disagreed about which deals were urgent.
 *
 * Two queries for the whole board, one source of truth for both surfaces.
 */

export interface DealSignal {
  nextEvent: { title: string; start_time: string } | null;
  underwritingScore: number | null;
}

const EMPTY: DealSignal = { nextEvent: null, underwritingScore: null };

export function useDealSignals(opportunityIds: string[]): Map<string, DealSignal> {
  const [signals, setSignals] = useState<Map<string, DealSignal>>(new Map());

  // Sorted and joined so a re-render with the same deals in a different order
  // doesn't refetch. The board re-sorts constantly.
  const key = useMemo(() => [...opportunityIds].sort().join(","), [opportunityIds]);
  const latestKey = useRef(key);

  useEffect(() => {
    latestKey.current = key;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setSignals(new Map());
      return;
    }

    let cancelled = false;

    const load = async () => {
      const now = new Date().toISOString();
      const [eventsRes, scoresRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("opportunity_id, title, start_time")
          .in("opportunity_id", ids)
          .eq("status", "confirmed")
          .gte("start_time", now)
          .order("start_time", { ascending: true }),
        supabase
          .from("validation_reports")
          .select("opportunity_id, score, created_at")
          .in("opportunity_id", ids)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled || latestKey.current !== key) return;

      // A failed query is not the same as "this deal has no meeting", and the
      // card used to render those identically because it only ever read .data.
      if (eventsRes.error) console.error("Failed to load deal meetings:", eventsRes.error);
      if (scoresRes.error) console.error("Failed to load underwriting scores:", scoresRes.error);

      const next = new Map<string, DealSignal>();
      const get = (id: string) => {
        const existing = next.get(id);
        if (existing) return existing;
        const fresh: DealSignal = { nextEvent: null, underwritingScore: null };
        next.set(id, fresh);
        return fresh;
      };

      // Both queries come back ordered, so the first row seen for an id is the
      // soonest meeting and the newest score respectively.
      for (const row of eventsRes.data ?? []) {
        const entry = get(row.opportunity_id as string);
        if (!entry.nextEvent) {
          entry.nextEvent = { title: row.title as string, start_time: row.start_time as string };
        }
      }
      for (const row of scoresRes.data ?? []) {
        const entry = get(row.opportunity_id as string);
        if (entry.underwritingScore === null && row.score != null) {
          entry.underwritingScore = Number(row.score);
        }
      }

      setSignals(next);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return signals;
}

export const emptyDealSignal = EMPTY;
