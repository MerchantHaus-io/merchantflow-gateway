// Shared helpers for calling the Kurv (EMS MyPortfolio) API.
// Auth: POST /token with {UserName, Password} -> JWT; cached in kurv_api_tokens.

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

// ---- Token caching ----
interface CachedToken { token: string; expires_at: string }

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
  // EMS docs use PascalCase: { Token, ExpirationDateTime }
  const token = data.Token ?? data.token;
  const expIso = data.ExpirationDateTime ?? data.expirationDateTime ?? data.expires_at;
  if (!token) throw new Error(`Kurv token response missing token: ${JSON.stringify(data)}`);
  const expires = expIso ? new Date(expIso) : new Date(Date.now() + 30 * 60 * 1000);
  return { token, expires };
}

export async function getKurvToken(supabase?: SupabaseClient): Promise<string> {
  const sb = supabase ?? adminClient();
  const env = kurvEnvName();
  const skewMs = 60_000;
  const { data: cached } = await sb
    .from("kurv_api_tokens")
    .select("token,expires_at")
    .eq("environment", env)
    .maybeSingle();

  if (cached) {
    const exp = new Date((cached as CachedToken).expires_at).getTime();
    if (exp - Date.now() > skewMs) return (cached as CachedToken).token;
  }

  const { token, expires } = await fetchFreshToken();
  await sb.from("kurv_api_tokens").upsert(
    { environment: env, token, expires_at: expires.toISOString() },
    { onConflict: "environment" }
  );
  return token;
}

// ---- Generic Kurv fetch wrapper ----
export async function kurvFetch(
  path: string,
  init: RequestInit = {},
  supabase?: SupabaseClient
): Promise<Response> {
  const token = await getKurvToken(supabase);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `${kurvBaseUrl()}${path}`;
  return await fetch(url, { ...init, headers });
}

export function kurvJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...kurvCors, "Content-Type": "application/json" },
  });
}
