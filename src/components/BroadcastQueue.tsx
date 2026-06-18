import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

// Lower number = higher priority (shown first)
type Entry = { key: string; priority: number };

interface QueueCtx {
  canShow: (key: string) => boolean;
  register: (key: string, priority: number) => void;
  unregister: (key: string) => void;
}

const Ctx = createContext<QueueCtx | null>(null);

export function BroadcastQueueProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  const register = useCallback((key: string, priority: number) => {
    setEntries((prev) => (prev.some((e) => e.key === key) ? prev : [...prev, { key, priority }]));
  }, []);

  const unregister = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const front = useMemo(() => {
    if (entries.length === 0) return null;
    return [...entries].sort((a, b) => a.priority - b.priority)[0].key;
  }, [entries]);

  const canShow = useCallback((key: string) => front === key, [front]);

  return <Ctx.Provider value={{ canShow, register, unregister }}>{children}</Ctx.Provider>;
}

/**
 * Hook for broadcast popups. Returns whether this popup is allowed to display.
 * Pass `wantsToShow=true` only when the popup has determined (via its own
 * eligibility checks) that it should be shown to this user.
 */
export function useBroadcastSlot(key: string, priority: number, wantsToShow: boolean) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    if (wantsToShow) {
      ctx.register(key, priority);
      return () => ctx.unregister(key);
    } else {
      ctx.unregister(key);
    }
  }, [ctx, key, priority, wantsToShow]);
  return ctx ? ctx.canShow(key) : wantsToShow;
}
