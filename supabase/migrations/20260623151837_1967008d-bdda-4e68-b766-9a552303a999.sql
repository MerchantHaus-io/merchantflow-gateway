
-- ============================================================
-- 1. Tables
-- ============================================================
CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('snapshot','flush')),
  status text NOT NULL CHECK (status IN ('running','success','error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  drive_file_id text,
  drive_file_name text,
  drive_web_link text,
  bytes bigint,
  rows_flushed integer,
  table_counts jsonb,
  error text,
  triggered_by text
);
GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read backup_runs" ON public.backup_runs
  FOR SELECT TO authenticated USING (public.is_admin_email());

CREATE INDEX idx_backup_runs_kind_started ON public.backup_runs(kind, started_at DESC);

CREATE TABLE public.backup_change_queue (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  op char(1) NOT NULL CHECK (op IN ('I','U','D')),
  row_pk text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  flushed_at timestamptz
);
GRANT SELECT ON public.backup_change_queue TO authenticated;
GRANT ALL ON public.backup_change_queue TO service_role;
ALTER TABLE public.backup_change_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read backup_change_queue" ON public.backup_change_queue
  FOR SELECT TO authenticated USING (public.is_admin_email());

CREATE INDEX idx_backup_change_queue_unflushed
  ON public.backup_change_queue(created_at)
  WHERE flushed_at IS NULL;

-- ============================================================
-- 2. Generic trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_backup_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op char(1);
  v_payload jsonb;
  v_pk text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'I'; v_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_op := 'U'; v_payload := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_op := 'D'; v_payload := to_jsonb(OLD);
  END IF;

  BEGIN
    v_pk := COALESCE(
      (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END) ->> 'id',
      NULL
    );
  EXCEPTION WHEN OTHERS THEN v_pk := NULL;
  END;

  INSERT INTO public.backup_change_queue (table_name, op, row_pk, payload)
  VALUES (TG_TABLE_NAME, v_op, v_pk, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- 3. Attach triggers to every backed-up public table
-- ============================================================
DO $$
DECLARE
  r record;
  v_excluded text[] := ARRAY[
    'backup_change_queue','backup_runs',
    'user_sessions','notifications','push_subscriptions',
    'chat_messages','direct_messages','message_reactions','message_logs',
    'billing_doc_sequences','kurv_api_tokens','google_calendar_tokens',
    'mcp_audit_log','referrer_impersonation_logs'
  ];
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> ALL(v_excluded)
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_backup_enqueue ON public.%I;', r.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER trg_backup_enqueue
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.enqueue_backup_change();',
      r.table_name
    );
  END LOOP;
END $$;

-- ============================================================
-- 4. Cron jobs (pg_cron + pg_net)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior versions
DO $$
BEGIN
  PERFORM cron.unschedule('backup-snapshot-hourly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='backup-snapshot-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('backup-flush-changes-10s')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='backup-flush-changes-10s');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'backup-snapshot-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://cuqjaddtmkotgvfsgcol.supabase.co/functions/v1/backup-snapshot-to-drive',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cWphZGR0bWtvdGd2ZnNnY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTM3NjUsImV4cCI6MjA4MDQyOTc2NX0.u1m_nORZsJ3Law0y3-xIIoNUoiRcrTXukJyW14y-AoA'
    ),
    body := jsonb_build_object('source','cron')
  );
  $cron$
);

SELECT cron.schedule(
  'backup-flush-changes-10s',
  '10 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://cuqjaddtmkotgvfsgcol.supabase.co/functions/v1/backup-flush-changes',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cWphZGR0bWtvdGd2ZnNnY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTM3NjUsImV4cCI6MjA4MDQyOTc2NX0.u1m_nORZsJ3Law0y3-xIIoNUoiRcrTXukJyW14y-AoA'
    ),
    body := jsonb_build_object('source','cron')
  );
  $cron$
);
