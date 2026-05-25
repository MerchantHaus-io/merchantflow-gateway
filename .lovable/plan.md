
## Goal

Expose this CRM as a remote MCP server so you can add it to Claude Desktop as a custom connector. The MCP URL will be:

```
https://cuqjaddtmkotgvfsgcol.supabase.co/functions/v1/mcp
```

Auth: a single static bearer token (your personal `MCP_BEARER_TOKEN` secret) — simplest setup for a single-user Claude Desktop connector, no OAuth dance, no user JWT plumbing.

## Tools exposed (all)

**Read**
- `search_accounts(query, limit)` — by name/email/MID
- `get_account(id)` — full account incl. linked contacts + opportunities
- `search_contacts(query, limit)`
- `get_contact(id)`
- `list_opportunities(stage?, assigned_to?, pipeline?, limit)`
- `get_opportunity(id)` — incl. activities, notes, documents list, underwriting score
- `list_tasks(assignee?, status?, limit)`
- `get_pipeline_snapshot()` — count + value per stage
- `list_recent_activities(opportunity_id?, limit)`
- `list_referrers()` / `get_referrer(id)`
- `list_web_submissions(status?, limit)`
- `get_nmi_transactions(mid, days?)`
- `get_commission_summary(period?)`

**Write**
- `create_lead(name, email, phone?, company?, source?)`
- `create_opportunity(account_id, contact_id, stage, pipeline, ...)`
- `update_opportunity_stage(id, stage, reason?)`
- `add_note(opportunity_id, body)`
- `add_comment(account_id|opportunity_id, body)`
- `log_activity(opportunity_id, type, description)`
- `create_task(title, assignee, due_date?, opportunity_id?, priority?)`
- `assign_opportunity(id, assignee_email)`

All writes use the Supabase **service role** server-side (since the bearer is yours), bypassing RLS — same posture as your existing admin edge functions.

## Implementation

**1. New edge function** `supabase/functions/mcp/index.ts`

- Uses `mcp-lite` (`npm:mcp-lite@^0.10.0`) with `StreamableHttpTransport` + Hono.
- `verify_jwt = false` in `supabase/config.toml` (custom bearer auth in code).
- Auth middleware: require `Authorization: Bearer <MCP_BEARER_TOKEN>` on every request; reject 401 otherwise.
- Each tool handler instantiates a service-role Supabase client and runs scoped queries against the 3-table schema (accounts/contacts/opportunities) + adjacent tables (activities, notes, tasks, referrers, nmi_*).
- Tool inputs validated via Zod; outputs returned as `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.
- CORS headers included so Claude's connector can negotiate.

**2. Secret**
- Add `MCP_BEARER_TOKEN` (I'll generate a strong random string and use `add_secret` so you paste it once).

**3. Config**
- Register the function in `supabase/config.toml` with `verify_jwt = false`.

**4. Claude Desktop setup (after deploy)**

In Claude Desktop → Settings → Connectors → Add custom connector:
- **URL:** `https://cuqjaddtmkotgvfsgcol.supabase.co/functions/v1/mcp`
- **Auth:** Custom header → `Authorization: Bearer <MCP_BEARER_TOKEN>`

Then in any Claude chat the CRM tools appear under the connector.

## Security notes

- Bearer token acts as a full admin key — treat like a password. Never share. Rotate by updating the secret + reconfiguring Claude.
- No per-user scoping (you said "all"); every call runs with service-role privileges.
- All MCP calls are logged to a new `mcp_audit_log` table (tool name, args summary, timestamp) so you can review what Claude did.

## Out of scope (for now)
- OAuth / per-user JWT auth
- Multi-tenant access (other team members getting their own MCP token)
- Streaming/long-running tool outputs

Happy to add either later.
