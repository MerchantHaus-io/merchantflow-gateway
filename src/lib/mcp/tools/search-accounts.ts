import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { notAuthenticated, toError, toJson } from "./_result";

export default defineTool({
  name: "search_accounts",
  title: "Search accounts",
  description:
    "Search merchant accounts by name, with their location, website and commission model.",
  inputSchema: {
    query: z.string().trim().min(1).optional().describe("Partial account name to search for."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let builder = supabase
      .from("accounts")
      .select("id, name, website, city, state, country, status, commission_model, nmi_merchant_id, created_at")
      .order("name", { ascending: true })
      .limit(limit ?? 25);

    if (query) builder = builder.ilike("name", `%${query}%`);

    const { data, error } = await builder;
    if (error) return toError(error.message);
    return toJson({ count: data?.length ?? 0, accounts: data ?? [] });
  },
});
