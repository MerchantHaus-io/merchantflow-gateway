import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { notAuthenticated, toError, toJson } from "./_result";

export default defineTool({
  name: "list_support_tickets",
  title: "List support tickets",
  description:
    "List support tickets with subject, requester, status and priority. Archived tickets are excluded unless requested.",
  inputSchema: {
    status: z.string().trim().min(1).optional().describe("Ticket status to filter by, e.g. 'open' or 'closed'."),
    include_archived: z.boolean().optional().describe("Include archived tickets (default false)."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, include_archived, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let builder = supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, category, priority, status, source, requester_name, requester_email, assigned_to_email, created_at, closed_at, archived_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (status) builder = builder.eq("status", status);
    if (!include_archived) builder = builder.is("archived_at", null);

    const { data, error } = await builder;
    if (error) return toError(error.message);
    return toJson({ count: data?.length ?? 0, tickets: data ?? [] });
  },
});
