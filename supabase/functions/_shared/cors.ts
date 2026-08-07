/**
 * Shared CORS handling for edge functions.
 *
 * Every function currently hardcodes `Access-Control-Allow-Origin: "*"`, which
 * lets any site on the internet invoke them from a visitor's browser. For the
 * functions that accept a user JWT that is the difference between "needs a
 * stolen token" and "any page the user visits can call this on their behalf".
 *
 * `corsHeaders(req)` echoes the request Origin only when it is on the
 * allowlist, and sets Vary: Origin so caches don't serve one site's allowance
 * to another. Genuinely public endpoints (merchant intake forms, the quote
 * acceptance page) can opt into wildcard with `publicCorsHeaders`.
 */

const ALLOWED_ORIGINS: readonly string[] = [
  "https://ops-terminal.merchant.haus",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
];

/** Preview/staging hosts, matched by suffix rather than listed individually. */
const ALLOWED_ORIGIN_SUFFIXES: readonly string[] = [
  ".lovable.app",
  ".lovableproject.com",
  ".netlify.app",
  ".ops-terminal.merchant.haus",
];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return ALLOWED_ORIGIN_SUFFIXES.some((s) => hostname.endsWith(s));
  } catch {
    return false;
  }
}

const BASE_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  Vary: "Origin",
};

/**
 * CORS headers for an authenticated / internal function. Requests from an
 * unlisted origin get no Allow-Origin header at all, so the browser blocks the
 * response. Server-to-server callers (no Origin header) are unaffected.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (isAllowedOrigin(origin)) {
    return { ...BASE_HEADERS, "Access-Control-Allow-Origin": origin! };
  }
  return { ...BASE_HEADERS };
}

/**
 * Wildcard CORS, for endpoints that are genuinely public by design — the
 * merchant application and scoping forms, the contact form, and the quote
 * acceptance page. Use deliberately, not as a default.
 */
export function publicCorsHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, "Access-Control-Allow-Origin": "*" };
}

/** Standard preflight response. */
export function handleOptions(req: Request, headers = corsHeaders(req)): Response {
  return new Response(null, { headers });
}
