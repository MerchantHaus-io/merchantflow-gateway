import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The signed-in user's own profile row, fetched once and kept live (#113).
 *
 * IconRailSidebar and NotificationBell each ran their own fetch AND their own
 * realtime channel against the same `profiles` row — two websocket
 * subscriptions and two queries for one record, in chrome that is now mounted
 * for the whole session. The channel names were fixed strings too, so they
 * collided with themselves under StrictMode's double-mount in development.
 *
 * React Query dedupes the read across every consumer. The subscription is
 * separate — see useOwnProfileRealtime, which is mounted once by AppShell.
 */

export interface OwnProfile {
  avatar_url: string | null;
  full_name: string | null;
}

export const ownProfileKey = (userId: string | undefined) => ["own-profile", userId] as const;

export function useOwnProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ownProfileKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<OwnProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("id", user!.id)
        .maybeSingle();

      if (error) {
        // Chrome shouldn't break because a profile read failed.
        console.warn("[useOwnProfile] fetch failed:", error.message);
        return null;
      }
      return data;
    },
  });
}

/**
 * The single realtime subscription behind useOwnProfile. Mount once, at the
 * top of the app — mounting it twice recreates the duplication it exists to
 * remove.
 *
 * The channel name is per-user rather than a fixed string, so a StrictMode
 * double-mount in development doesn't collide with itself.
 */
export function useOwnProfileRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`own-profile:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          // Write straight into the cache: the row is already in the payload,
          // so there's nothing worth a round trip.
          queryClient.setQueryData(ownProfileKey(user.id), payload.new as OwnProfile);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}
