import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useFavorites() {
  const { user } = useAuth();
  const [favoriteUrls, setFavoriteUrls] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("user_favorites" as any)
      .select("shortcut_url")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          setFavoriteUrls(new Set((data as unknown[]).map((r) => r.shortcut_url)));
        }
        setLoaded(true);
      });
  }, [user?.id]);

  const toggle = useCallback(
    async (url: string) => {
      if (!user?.id) return;
      const isFav = favoriteUrls.has(url);
      // Optimistic update
      setFavoriteUrls((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(url);
        else next.add(url);
        return next;
      });

      if (isFav) {
        await supabase
          .from("user_favorites" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("shortcut_url", url);
      } else {
        await supabase
          .from("user_favorites" as any)
          .insert({ user_id: user.id, shortcut_url: url } as any);
      }
    },
    [user?.id, favoriteUrls]
  );

  const isFavorite = useCallback(
    (url: string) => favoriteUrls.has(url),
    [favoriteUrls]
  );

  return { favoriteUrls, isFavorite, toggle, loaded, count: favoriteUrls.size };
}
