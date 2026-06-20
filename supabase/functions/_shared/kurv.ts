// Shared helpers for calling the Kurv (EMS MyPortfolio) API.
//
// Reusable API client:
//   - Auto-fetches a JWT via POST /api/v1/Token with {UserName, Password}
//   - Caches the token in-memory (per warm isolate) AND in `kurv_api_tokens`
//   - Auto-refreshes when expired (60s skew) OR when EMS replies 401
//   - Injects `Authorization: Bearer <token>` on every call
//   - Typed helpers: kurvGet / kurvPost / kurvPut / kurvDelete -> parsed JSON
//   - Throws KurvApiError with status + body on non-2xx
//
// Back-compat: `kurvFetch` is still exported and returns a raw Response.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const kurvCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function kurvBaseUrl(): string {
  const env = (Deno.env.get("KURV_API_ENV") ?? "sandbox").toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.emscorporate.com"
    : "https://apitest.emscorporate.com";
}

export function kurvEnvName(): string {
  return (Deno.env.get("KURV_API_ENV") ?? "sandbox").toLowerCase();
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ---- Errors ----
export class KurvApiError extends Error {
  status: number;
  endpoint: string;
  body: unknown;
  constructor(message: string, status: number, endpoint: string, body: unknown) {
    super(message);
    this.name = "KurvApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

// ---- Token caching (in-memory + DB) ----
interface CachedToken { token: string; expires_at: string }
interface MemToken { token: string; expiresMs: number }

const TOKEN_SKEW_MS = 60_000;
const memTokens = new Map<string, MemToken>();
let inflight: Promise<string> | null = null;

async function fetchFreshToken(): Promise<{ token: string; expires: Date }> {
  const username = Deno.env.get("KURV_API_USERNAME");
  const password = Deno.env.get("KURV_API_PASSWORD");
  if (!username || !password) {
    throw new Error("KURV_API_USERNAME / KURV_API_PASSWORD not configured");
  }
  const url = `${kurvBaseUrl()}/api/v1/Token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ UserName: username, Password: password }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Kurv token request failed (${res.status}): ${t}`);
  }
  const data = await res.json();
  const token = data.Token ?? data.token;
  const expIso = data.ExpirationDateTime ?? data.expirationDateTime ?? data.expires_at;
  if (!token) throw new Error(`Kurv token response missing token: ${JSON.stringify(data)}`);
  const expires = expIso ? new Date(expIso) : new Date(Date.now() + 30 * 60 * 1000);
  return { token, expires };
}

/**
 * Returns a valid JWT for the current environment.
 *   - In-memory cache hit -> instant
 *   - DB cache hit (still valid) -> reused
 *   - Otherwise fetches a fresh token, persists, and broadcasts to mem cache
 * `force = true` bypasses caches and mints a new token (used on 401).
 */
export async function getKurvToken(
  supabase?: SupabaseClient,
  force = false,
): Promise<string> {
  const env = kurvEnvName();
  const now = Date.now();

  if (!force) {
    const mem = memTokens.get(env);
    if (mem && mem.expiresMs - now > TOKEN_SKEW_MS) return mem.token;
  }

  // Coalesce concurrent refreshes in the same isolate.
  if (inflight && !force) return inflight;

  const sb = supabase ?? adminClient();
  inflight = (async () => {
    if (!force) {
      const { data: cached } = await sb
        .from("kurv_api_tokens")
        .select("token,expires_at")
        .eq("environment", env)
        .maybeSingle();
      if (cached) {
        const exp = new Date((cached as CachedToken).expires_at).getTime();
        if (exp - Date.now() > TOKEN_SKEW_MS) {
          memTokens.set(env, { token: (cached as CachedToken).token, expiresMs: exp });
          return (cached as CachedToken).token;
        }
      }
    }
    const { token, expires } = await fetchFreshToken();
    await sb.from("kurv_api_tokens").upsert(
      { environment: env, token, expires_at: expires.toISOString() },
      { onConflict: "environment" }
    );
    memTokens.set(env, { token, expiresMs: expires.getTime() });
    return token;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Low-level Kurv fetch. Injects auth header automatically.
 * Retries ONCE with a forced-fresh token on a 401 response.
 */
export async function kurvFetch(
  path: string,
  init: RequestInit = {},
  supabase?: SupabaseClient
): Promise<Response> {
  const sb = supabase ?? adminClient();
  const url = path.startsWith("http") ? path : `${kurvBaseUrl()}${path}`;

  const doFetch = async (force: boolean): Promise<Response> => {
    const token = await getKurvToken(sb, force);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", headers.get("Accept") ?? "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return await fetch(url, { ...init, headers });
  };

  let res = await doFetch(false);
  if (res.status === 401) {
    // Stale/revoked token — invalidate caches and retry once.
    memTokens.delete(kurvEnvName());
    res = await doFetch(true);
  }
  return res;
}

// ---- Typed JSON helpers ----
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
  supabase?: SupabaseClient,
  init: RequestInit = {},
): Promise<T> {
  const res = await kurvFetch(path, {
    ...init,
    method,
    body: body === undefined ? init.body : JSON.stringify(body),
  }, supabase);
  const parsed = await readBody(res);
  if (!res.ok) {
    throw new KurvApiError(
      `Kurv ${method} ${path} failed (${res.status})`,
      res.status,
      path,
      parsed,
    );
  }
  return parsed as T;
}

export const kurvGet    = <T = unknown>(path: string, sb?: SupabaseClient) => call<T>("GET",    path, undefined, sb);
export const kurvPost   = <T = unknown>(path: string, body?: unknown, sb?: SupabaseClient) => call<T>("POST",   path, body, sb);
export const kurvPut    = <T = unknown>(path: string, body?: unknown, sb?: SupabaseClient) => call<T>("PUT",    path, body, sb);
export const kurvPatch  = <T = unknown>(path: string, body?: unknown, sb?: SupabaseClient) => call<T>("PATCH",  path, body, sb);
export const kurvDelete = <T = unknown>(path: string, sb?: SupabaseClient) => call<T>("DELETE", path, undefined, sb);

export function kurvJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...kurvCors, "Content-Type": "application/json" },
  });
}
