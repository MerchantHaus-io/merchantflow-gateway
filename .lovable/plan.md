Generate a comprehensive markdown document of the Lovable Cloud database and ship it as a downloadable artifact.

## What the document will contain

1. **Overview** — table count, schema summary, generation timestamp (Central Time).
2. **Tables** — one section per table in `public`:
   - Columns: name, type, nullable, default, identity/PK marker
   - Primary key and unique constraints
   - Foreign keys (with referenced table/column and on-delete behavior)
   - Indexes (non-PK)
   - RLS enabled? yes/no
   - RLS policies: name, command (SELECT/INSERT/UPDATE/DELETE), roles, `USING` and `WITH CHECK` expressions
   - Grants per role
3. **Enums** — every custom enum type and its values (e.g. `app_role`).
4. **Functions** — every `public.*` function: signature, return type, language, security mode, search_path, and full body in a fenced SQL block. Grouped by purpose (auth/role, notifications, triggers, business logic, utilities).
5. **Triggers** — table-by-table list of triggers (name, timing, event, function called). Built from `information_schema.triggers` since the metadata panel shows none registered through the migration system.
6. **Outcomes / business rules captured in SQL** — pulled from function bodies:
   - Referrer payout formula (50% rev share, $500 cap)
   - Stage-change side effects (DM, push, email, `stage_entered_at`)
   - Application secrets purge on `underwriting`
   - Office avatar auto-provisioning rules
   - Billing doc numbering scheme
   - Support ticket numbering / lifecycle
7. **Storage buckets** — `avatars`, `opportunity-documents`, `chat-attachments` with public/private status.
8. **Edge function registry** — names + `verify_jwt` flag from `supabase/config.toml`.
9. **Cron jobs** — `pg_cron` jobs (e.g. `quo-sync-calls-hourly`) with schedule and SQL command.
10. **Linter snapshot** — current Supabase security linter findings as an appendix so any open issues are visible alongside the schema.

## How it will be produced

- Run a batch of read-only `supabase--read_query` calls against `information_schema`, `pg_catalog`, `pg_policies`, `pg_proc`, `pg_trigger`, `pg_constraint`, `pg_indexes`, `cron.job`, and `storage.buckets`.
- Read `supabase/config.toml` for edge function metadata.
- Assemble the markdown locally and write to `/mnt/documents/database-schema.md`.
- Emit a `<presentation-artifact>` tag so you can preview/download it.

## Out of scope

- No schema or policy changes — read-only export.
- Migration history files themselves are not inlined; only the live database state is captured.
- `auth.*`, `storage.*`, `realtime.*`, `vault.*` internals are excluded (managed by Supabase) except for the public storage bucket list.

## Deliverable

A single file: `database-schema.md` (≈ a few hundred KB depending on policy/function volume) available as a downloadable artifact in chat.
