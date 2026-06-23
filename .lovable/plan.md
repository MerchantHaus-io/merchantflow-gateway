# Continuous Backup to Google Drive

Backup every public table to `admin@merchanthaus.io`'s Google Drive with two layers running in parallel: real-time change streaming and hourly full snapshots, retained forever.

## 1. Connect Google Drive

Link the Google Drive connector signed in as `admin@merchanthaus.io`. The connector exposes `LOVABLE_API_KEY` + `GOOGLE_DRIVE_API_KEY` to edge functions — no per-user OAuth needed. All writes land in that one Drive.

Folder layout created on first run:
```text
/MerchantHaus-Backups
  /snapshots/YYYY/MM/merchanthaus-YYYY-MM-DDTHH.zip
  /changes/<table>/YYYY-MM-DD.jsonl     (one line per row change, appended)
  /manifest.json                         (last snapshot + change cursor)
```

## 2. Hourly full snapshot

New edge function `backup-snapshot-to-drive`:
- Reuses the logic in `export-data` (all 68 tables → JSON → ZIP via JSZip in Deno).
- Uploads the ZIP to `/snapshots/YYYY/MM/...zip` via the connector gateway (`POST /upload/drive/v3/files?uploadType=multipart`).
- Logs run to a new `backup_runs` table (status, file id, size, table counts, duration).

Scheduled via `pg_cron` + `pg_net`, hourly on the hour.

## 3. Real-time change stream

New table `backup_change_queue` captures every insert/update/delete with `(table_name, op, row_pk, payload_jsonb, created_at, flushed_at)`.

A generic trigger function `enqueue_backup_change()` is attached `AFTER INSERT OR UPDATE OR DELETE` to every backed-up public table. NEW/OLD row is serialized to JSON and inserted into the queue. Cost: one extra insert per write — negligible at current volume.

New edge function `backup-flush-changes`:
- Pulls up to 500 unflushed rows.
- Groups by `(table_name, date)` and appends NDJSON lines to `/changes/<table>/YYYY-MM-DD.jsonl` in Drive (read existing file → append → re-upload, or use Drive's resumable append).
- Marks queue rows `flushed_at = now()`.

Trigger options (pick one at build time):
- **A. pg_cron every 10 seconds** — simplest, "within seconds" latency, no extra moving parts.
- **B. AFTER INSERT trigger on `backup_change_queue`** that calls `pg_net.http_post` to flush immediately — true real-time but more HTTP overhead.

Recommend **A** (10s cron) for cost + reliability. Failures retry automatically next tick; queue rows stay until flushed.

## 4. Retention

Keep everything. No cleanup job. Drive folder structure (year/month) keeps it browsable. `manifest.json` is updated every run so you can see freshness at a glance.

## 5. Admin UI

Add a "Backups" card to `/admin` (Administration page) showing:
- Last snapshot time + Drive file link.
- Change-queue depth (unflushed rows).
- Last flush time, rows flushed.
- "Run snapshot now" button (calls the function on demand).
- Reads from `backup_runs` + a count on `backup_change_queue`.

Existing manual "Data Export" page stays untouched.

## Technical details

- **Drive auth:** all writes go through `https://connector-gateway.lovable.dev/google_drive/...` with the standard `Authorization: Bearer $LOVABLE_API_KEY` + `X-Connection-Api-Key: $GOOGLE_DRIVE_API_KEY` headers. No OAuth code in app.
- **New tables:** `backup_change_queue`, `backup_runs`. RLS: admin-only via `is_admin_email()`. Service role full access.
- **New triggers:** one `AFTER INSERT/UPDATE/DELETE` trigger per backed-up table, all calling the same `enqueue_backup_change()` function. Excluded: `backup_change_queue` itself (avoid recursion), `user_sessions`, `notifications`, `push_subscriptions` (high-churn, low-value — confirm if you want them included).
- **Functions added to `supabase/config.toml`:** `backup-snapshot-to-drive`, `backup-flush-changes`.
- **Cron jobs:** hourly snapshot, 10-second flush.
- **Idempotency:** each snapshot filename is timestamped; change-queue rows are flushed once and marked.

## Caveats

- Drive doesn't natively "append" — flush re-uploads that day's NDJSON file (small until end of day). Acceptable at current write rate; switch to per-batch files (`HH-mm-ss.jsonl`) if files get large.
- First snapshot of all 68 tables may take ~30–60s; subsequent hourly runs are fine.
- Connector OAuth refresh is handled by the gateway; if it ever expires, the admin reconnects in Settings → Connectors.

## Confirm before I build

1. **Trigger style for change stream: A (10-second cron) or B (real-time pg_net per row)?** Default A.
2. **Exclude high-churn tables** (`user_sessions`, `notifications`, `push_subscriptions`, `chat_messages`, `direct_messages`) from the real-time stream, or back up everything? Snapshots will still include them either way.
