-- Create a function to send push notifications for new chat messages
CREATE OR REPLACE FUNCTION public.notify_chat_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_sender_name text;
  v_channel_name text;
  v_user_ids uuid[];
BEGIN
  -- Get Supabase URL and anon key from environment
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);
  
  -- Only proceed if we have configuration
  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get sender name
  SELECT COALESCE(full_name, email) INTO v_sender_name 
  FROM profiles 
  WHERE id = NEW.user_id 
  LIMIT 1;
  
  -- Get channel name
  SELECT name INTO v_channel_name 
  FROM chat_channels 
  WHERE id = NEW.channel_id 
  LIMIT 1;
  
  -- Get all users with push subscriptions except the sender
  SELECT ARRAY_AGG(DISTINCT ps.user_id) INTO v_user_ids
  FROM push_subscriptions ps
  WHERE ps.user_id != NEW.user_id;
  
  -- Only send if there are users to notify
  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object(
        'userIds', v_user_ids,
        'title', COALESCE(v_sender_name, 'Someone') || ' in #' || COALESCE(v_channel_name, 'chat'),
        'body', LEFT(NEW.content, 100),
        'url', '/chat',
        'data', jsonb_build_object(
          'messageId', NEW.id,
          'channelId', NEW.channel_id,
          'type', 'channel_message'
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for channel messages
DROP TRIGGER IF EXISTS notify_chat_push_on_message ON chat_messages;
CREATE TRIGGER notify_chat_push_on_message
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION notify_chat_push_notification();

-- Create a function to send push notifications for new direct messages
CREATE OR REPLACE FUNCTION public.notify_dm_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_sender_name text;
BEGIN
  -- Get Supabase URL and anon key from environment
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);
  
  -- Only proceed if we have configuration
  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get sender name
  SELECT COALESCE(full_name, email) INTO v_sender_name 
  FROM profiles 
  WHERE id = NEW.sender_id 
  LIMIT 1;
  
  -- Check if receiver has push subscription
  IF EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.receiver_id) THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object(
        'userId', NEW.receiver_id,
        'title', 'DM from ' || COALESCE(v_sender_name, 'Someone'),
        'body', LEFT(NEW.content, 100),
        'url', '/chat',
        'data', jsonb_build_object(
          'messageId', NEW.id,
          'senderId', NEW.sender_id,
          'type', 'direct_message'
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for direct messages
DROP TRIGGER IF EXISTS notify_dm_push_on_message ON direct_messages;
CREATE TRIGGER notify_dm_push_on_message
AFTER INSERT ON direct_messages
FOR EACH ROW
EXECUTE FUNCTION notify_dm_push_notification();