import { supabase } from '@/integrations/supabase/client';

/**
 * Front-end error telemetry (audit item #56).
 *
 * ErrorBoundary previously only called console.error, which means production
 * crashes were invisible — a user's browser console is not a monitoring
 * system. This reports to the `client_errors` table so crashes are actually
 * observable, and gives the user a short id they can quote to support.
 *
 * Deliberately not a third-party SDK: no vendor decision, no DSN, no extra
 * dependency, and it works as soon as the migration is applied. `forwardTo()`
 * below is the seam for adding Sentry later without touching any call site.
 */

export type ErrorSource = 'render' | 'window' | 'promise';

interface ReportInput {
  error: unknown;
  source: ErrorSource;
  componentStack?: string;
}

/** Short, readable, unambiguous when spoken over the phone. */
const newErrorId = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

/** Build identifier, so a spike can be tied to a deploy. */
const release =
  (import.meta.env.VITE_RELEASE as string | undefined) ??
  (import.meta.env.MODE === 'production' ? 'production' : import.meta.env.MODE);

type Forwarder = (payload: Record<string, unknown>) => void;
let forwarder: Forwarder | null = null;

/**
 * Register an additional sink (e.g. Sentry). Call once at startup:
 *   forwardTo((p) => Sentry.captureException(p.message, { extra: p }));
 */
export const forwardTo = (fn: Forwarder) => {
  forwarder = fn;
};

// Crash loops can fire hundreds of identical errors. Cap what we send so a
// render loop doesn't turn into a write storm against the database.
const MAX_REPORTS_PER_SESSION = 25;
const DEDUPE_WINDOW_MS = 10_000;
let reportCount = 0;
const recent = new Map<string, number>();

const shouldReport = (key: string): boolean => {
  if (reportCount >= MAX_REPORTS_PER_SESSION) return false;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  recent.set(key, now);
  return true;
};

/**
 * Report an error. Never throws and never rejects — telemetry must not be able
 * to break the page it is reporting on.
 *
 * @returns the error id to show the user, or null if the report was suppressed.
 */
export function reportError({ error, source, componentStack }: ReportInput): string | null {
  const errorId = newErrorId();

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Always keep the console output — it's what a developer looks at first.
  console.error(`[telemetry ${errorId}]`, error, componentStack ?? '');

  const dedupeKey = `${source}:${message}`;
  if (!shouldReport(dedupeKey)) return errorId;
  reportCount += 1;

  const payload = {
    error_id: errorId,
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 8000) ?? null,
    component_stack: componentStack?.slice(0, 8000) ?? null,
    url: window.location.href.slice(0, 2000),
    route: window.location.pathname,
    user_agent: navigator.userAgent.slice(0, 500),
    source,
    release,
  };

  try {
    forwarder?.(payload);
  } catch {
    /* a broken forwarder must not break reporting */
  }

  // Fire-and-forget. Attach the signed-in user if there is one, but never
  // block or fail the report on that lookup.
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      await supabase.from('client_errors').insert({
        ...payload,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
      });
    } catch (err) {
      // Swallow: if telemetry itself fails there is nowhere left to report it.
      console.warn('[telemetry] failed to record error', err);
    }
  })();

  return errorId;
}

/**
 * Catch errors that escape React — async throws, event handlers, and rejected
 * promises. ErrorBoundary only sees errors thrown during render.
 */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    // Resource load failures (<img>, <script>) surface here with no error
    // object and are mostly noise.
    if (!event.error) return;
    reportError({ error: event.error, source: 'window' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError({ error: event.reason, source: 'promise' });
  });
}
