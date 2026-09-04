import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isImpersonationTab } from '@/integrations/supabase/impersonationClient';

const HEARTBEAT_MS = 60_000;

/**
 * Keeps the current `user_sessions` row fresh while a partner is inside the
 * portal, so time-on-portal is known even when they close the tab instead of
 * signing out. Writes `logged_out_at` (last seen) and `duration_minutes`.
 *
 * Skipped in admin impersonation tabs — an admin looking around must not show
 * up as partner activity.
 */
export function usePortalSessionHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (isImpersonationTab()) return;

    const sessionId = localStorage.getItem('current_session_id');
    if (!sessionId) return;

    let cancelled = false;
    let startedAt: number | null = null;

    const touch = async () => {
      if (cancelled) return;
      if (startedAt === null) {
        const { data, error } = await supabase
          .from('user_sessions')
          .select('logged_in_at')
          .eq('id', sessionId)
          .maybeSingle();
        if (error || !data?.logged_in_at) return;
        startedAt = new Date(data.logged_in_at).getTime();
        if (!Number.isFinite(startedAt)) {
          startedAt = null;
          return;
        }
      }
      const now = Date.now();
      const minutes = Math.max(0, Math.round((now - startedAt) / 60000));
      await supabase
        .from('user_sessions')
        .update({
          logged_out_at: new Date(now).toISOString(),
          duration_minutes: minutes,
        })
        .eq('id', sessionId);
    };

    void touch();
    const timer = window.setInterval(() => void touch(), HEARTBEAT_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void touch();
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [enabled]);
}
