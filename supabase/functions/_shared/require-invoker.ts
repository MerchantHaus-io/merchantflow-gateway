import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Invoker =
  | { kind: "cron"; email: "cron@system" }
  | { kind: "service"; email: "service-role" }
  | { kind: "user"; email: string; userId: string };

/**
 * Identify the caller of a privileged/scheduled edge function.
 *
 * Trusted paths (in order):
 *  1. `x-cron-secret` header matching the server-only CRON_SECRET  -> cron
 *  2. `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`           -> service
 *  3. A real, validated user JWT                                   -> user
 *
 * The public anon key is NEVER accepted as proof of a trusted caller.
 * Returns a 401 Response to short-circuit the handler when unauthorized.
 */
export async function requireInvoker(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ invoker: Invoker } | { response: Response }> {
  const unauthorized = () => ({
    response: new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  });

  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const providedCron = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && providedCron && providedCron === cronSecret) {
    return { invoker: { kind: "cron", email: "cron@system" } };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return unauthorized();

  const token = authHeader.slice("Bearer ".length).trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) {
    return { invoker: { kind: "service", email: "service-role" } };
  }

  // Explicitly reject the public anon key — it is client-exposed.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (anonKey && token === anonKey) return unauthorized();

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, anonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return unauthorized();

  return {
    invoker: { kind: "user", email: data.user.email ?? "unknown", userId: data.user.id },
  };
}
