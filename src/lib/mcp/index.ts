import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOpportunitiesTool from "./tools/list-opportunities";
import getOpportunityTool from "./tools/get-opportunity";
import searchAccountsTool from "./tools/search-accounts";
import listTasksTool from "./tools/list-tasks";
import createTaskTool from "./tools/create-task";
import listSupportTicketsTool from "./tools/list-support-tickets";

// Issuer must be the direct Supabase host, built from the project ref that Vite
// inlines at build time (never SUPABASE_URL, which is the Cloud proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "the-ops-terminal",
  title: "The Ops Terminal",
  version: "0.1.0",
  instructions:
    "Tools for The Ops Terminal, a merchant payments CRM. Use `search_accounts` to find merchant accounts, `list_opportunities` and `get_opportunity` for pipeline deals, `list_support_tickets` for the support queue, and `list_tasks` / `create_task` for team tasks. All calls run as the signed-in user, so results respect that user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    searchAccountsTool,
    listOpportunitiesTool,
    getOpportunityTool,
    listSupportTicketsTool,
    listTasksTool,
    createTaskTool,
  ],
});
