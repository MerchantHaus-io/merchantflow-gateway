
CREATE OR REPLACE FUNCTION public.notify_terminal_update_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);

  IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-terminal-update-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('date', NEW.published_date::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_terminal_update_email
  AFTER INSERT ON terminal_updates
  FOR EACH ROW
  EXECUTE FUNCTION notify_terminal_update_email();
