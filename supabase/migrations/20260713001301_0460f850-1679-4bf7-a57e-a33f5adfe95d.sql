
-- 1. Central blocklist helper
CREATE OR REPLACE FUNCTION public.is_blocked_recipient(_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_email, '')) = ANY (ARRAY[
    'darryn182@gmail.com'
  ]);
$$;

-- 2. send_system_dm: no-op for blocked recipients
CREATE OR REPLACE FUNCTION public.send_system_dm(p_receiver_email text, p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id uuid;
  v_system_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF public.is_blocked_recipient(p_receiver_email) THEN
    RETURN;
  END IF;

  SELECT id INTO v_receiver_id FROM profiles WHERE email = p_receiver_email LIMIT 1;

  IF v_receiver_id IS NOT NULL THEN
    INSERT INTO direct_messages (sender_id, receiver_id, content)
    VALUES (v_system_user_id, v_receiver_id, p_content);
  END IF;
END;
$$;

-- 3. Task assignment notify — skip if assignee blocked
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_user_id uuid;
  assigned_email text;
  assigner_name text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.assignee IS DISTINCT FROM NEW.assignee AND NEW.assignee IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.assignee IS NOT NULL) THEN

    IF public.is_blocked_recipient(NEW.assignee) THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(full_name, email) INTO assigner_name
    FROM profiles WHERE email = NEW.created_by LIMIT 1;

    SELECT id, email INTO assigned_user_id, assigned_email
    FROM profiles WHERE email = NEW.assignee;

    IF assigned_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        assigned_user_id, assigned_email,
        'Task Assigned',
        'You have been assigned a new task: ' || NEW.title,
        'task', '/tasks'
      );

      PERFORM send_system_dm(
        NEW.assignee,
        '📋 **Task Assigned**: ' || NEW.title || COALESCE(E'\n' || NEW.description, '')
      );
    END IF;

    PERFORM post_system_chat_message(
      '📋 **Task Assignment**: ' || COALESCE(assigner_name, 'Someone') || ' assigned task "' || NEW.title || '" to ' || NEW.assignee
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Opportunity assignment notify — skip if assignee blocked
CREATE OR REPLACE FUNCTION public.notify_opportunity_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_user_id uuid;
  assigned_email text;
  account_name text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN

    IF public.is_blocked_recipient(NEW.assigned_to) THEN
      RETURN NEW;
    END IF;

    SELECT name INTO account_name FROM accounts WHERE id = NEW.account_id;

    SELECT id, email INTO assigned_user_id, assigned_email
    FROM profiles WHERE email = NEW.assigned_to;

    IF assigned_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        assigned_user_id, assigned_email,
        'Opportunity Assigned',
        'You have been assigned to opportunity: ' || COALESCE(account_name, 'Unknown Account'),
        'opportunity', '/'
      );

      PERFORM send_system_dm(
        NEW.assigned_to,
        '🎯 **Pipeline Assignment**: You have been assigned to opportunity "' || COALESCE(account_name, 'Unknown Account') || '"'
      );
    END IF;

    PERFORM post_system_chat_message(
      '🎯 **Pipeline Assignment**: ' || COALESCE(account_name, 'Unknown Account') || ' assigned to ' || NEW.assigned_to
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Action item assignment — filter blocked emails out of the tag list
CREATE OR REPLACE FUNCTION public.notify_action_item_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _profile RECORD;
  _creator_name text;
BEGIN
  SELECT COALESCE(full_name, email) INTO _creator_name
  FROM profiles WHERE id = NEW.created_by LIMIT 1;

  FOREACH _email IN ARRAY NEW.assigned_to
  LOOP
    IF TG_OP = 'UPDATE' AND _email = ANY(OLD.assigned_to) THEN CONTINUE; END IF;
    IF public.is_blocked_recipient(_email) THEN CONTINUE; END IF;

    SELECT id, email INTO _profile FROM profiles WHERE email = _email LIMIT 1;

    IF _profile.id IS NOT NULL THEN
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        _profile.id, _profile.email,
        'Action Item Assigned',
        COALESCE(_creator_name, 'Someone') || ' tagged you: ' || LEFT(NEW.title, 100),
        'task', '/'
      );

      PERFORM send_system_dm(
        _email,
        '📌 **Action Item**: ' || COALESCE(_creator_name, 'Someone') || ' tagged you in "' || NEW.title || '"'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 6. Direct message bell — silence if receiver blocked
CREATE OR REPLACE FUNCTION public.notify_on_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender_name TEXT;
  _receiver_email TEXT;
BEGIN
  SELECT email INTO _receiver_email FROM public.profiles WHERE id = NEW.receiver_id;

  IF public.is_blocked_recipient(_receiver_email) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, split_part(email, '@', 1)) INTO _sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, user_email, title, message, type, link)
  VALUES (
    NEW.receiver_id, COALESCE(_receiver_email, ''),
    'Message from ' || COALESCE(_sender_name, 'Someone'),
    LEFT(NEW.content, 100), 'info', '/chat'
  );

  RETURN NEW;
END;
$$;

-- 7. Channel messages — skip blocked recipients
CREATE OR REPLACE FUNCTION public.notify_on_channel_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile RECORD;
  _channel_name TEXT;
BEGIN
  SELECT name INTO _channel_name FROM public.chat_channels WHERE id = NEW.channel_id;

  FOR _profile IN
    SELECT id, email FROM public.profiles
     WHERE id != NEW.user_id
       AND NOT public.is_blocked_recipient(email)
  LOOP
    INSERT INTO public.notifications (user_id, user_email, title, message, type, link)
    VALUES (
      _profile.id, _profile.email,
      'New message in #' || COALESCE(_channel_name, 'chat'),
      COALESCE(NEW.user_name, split_part(NEW.user_email, '@', 1)) || ': ' || LEFT(NEW.content, 100),
      'info', '/chat'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 8. Web submission fanout — skip blocked recipients
CREATE OR REPLACE FUNCTION public.notify_on_new_web_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile RECORD;
BEGIN
  FOR _profile IN
    SELECT id, email FROM public.profiles
     WHERE email IS NOT NULL
       AND NOT public.is_blocked_recipient(email)
  LOOP
    INSERT INTO public.notifications (user_id, user_email, title, message, type, link)
    VALUES (
      _profile.id, _profile.email,
      'New Web Submission',
      COALESCE(NEW.full_name, 'Unknown') || ' — ' || COALESCE(NEW.company_name, NEW.email),
      'info', '/web-submissions'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 9. DM push — skip blocked receivers
CREATE OR REPLACE FUNCTION public.notify_dm_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_sender_name text;
  v_receiver_email text;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);
  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN RETURN NEW; END IF;

  SELECT email INTO v_receiver_email FROM profiles WHERE id = NEW.receiver_id LIMIT 1;
  IF public.is_blocked_recipient(v_receiver_email) THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, email) INTO v_sender_name
  FROM profiles WHERE id = NEW.sender_id LIMIT 1;

  IF EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.receiver_id) THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon_key),
      body := jsonb_build_object(
        'userId', NEW.receiver_id,
        'title', 'DM from ' || COALESCE(v_sender_name, 'Someone'),
        'body', LEFT(NEW.content, 100),
        'url', '/chat',
        'data', jsonb_build_object('messageId', NEW.id, 'senderId', NEW.sender_id, 'type', 'direct_message')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 10. Channel push — filter blocked users out of recipient array
CREATE OR REPLACE FUNCTION public.notify_chat_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_sender_name text;
  v_channel_name text;
  v_user_ids uuid[];
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);
  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, email) INTO v_sender_name
  FROM profiles WHERE id = NEW.user_id LIMIT 1;

  SELECT name INTO v_channel_name FROM chat_channels WHERE id = NEW.channel_id LIMIT 1;

  SELECT ARRAY_AGG(DISTINCT ps.user_id) INTO v_user_ids
  FROM push_subscriptions ps
  JOIN profiles p ON p.id = ps.user_id
  WHERE ps.user_id != NEW.user_id
    AND NOT public.is_blocked_recipient(p.email);

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon_key),
      body := jsonb_build_object(
        'userIds', v_user_ids,
        'title', COALESCE(v_sender_name, 'Someone') || ' in #' || COALESCE(v_channel_name, 'chat'),
        'body', LEFT(NEW.content, 100),
        'url', '/chat',
        'data', jsonb_build_object('messageId', NEW.id, 'channelId', NEW.channel_id, 'type', 'channel_message')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 11. Email notification triggers — skip if assignee blocked
CREATE OR REPLACE FUNCTION public.send_task_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_email text;
  assigner_name text;
  v_supabase_url text;
  v_anon_key text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.assignee IS DISTINCT FROM NEW.assignee AND NEW.assignee IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.assignee IS NOT NULL) THEN

    IF public.is_blocked_recipient(NEW.assignee) THEN RETURN NEW; END IF;

    SELECT COALESCE(full_name, email) INTO assigner_name
    FROM profiles WHERE email = NEW.created_by LIMIT 1;

    SELECT email INTO assigned_email FROM profiles WHERE email = NEW.assignee;

    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_anon_key := current_setting('app.settings.supabase_anon_key', true);

    IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL AND assigned_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification-email',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon_key),
        body := jsonb_build_object(
          'type','task_assignment',
          'recipientEmail', assigned_email,
          'recipientName', NEW.assignee,
          'data', jsonb_build_object(
            'taskTitle', NEW.title,
            'description', NEW.description,
            'priority', NEW.priority,
            'assignedBy', assigner_name
          )
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_opportunity_assignment_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_email text;
  account_name text;
  contact_name text;
  v_supabase_url text;
  v_anon_key text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN

    IF public.is_blocked_recipient(NEW.assigned_to) THEN RETURN NEW; END IF;

    SELECT name INTO account_name FROM accounts WHERE id = NEW.account_id;
    SELECT CONCAT(first_name, ' ', last_name) INTO contact_name FROM contacts WHERE id = NEW.contact_id;
    SELECT email INTO assigned_email FROM profiles WHERE email = NEW.assigned_to;

    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_anon_key := current_setting('app.settings.supabase_anon_key', true);

    IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL AND assigned_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification-email',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon_key),
        body := jsonb_build_object(
          'type','opportunity_assignment',
          'recipientEmail', assigned_email,
          'recipientName', NEW.assigned_to,
          'data', jsonb_build_object(
            'accountName', account_name,
            'contactName', contact_name,
            'stage', NEW.stage
          )
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_stage_change_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_email text;
  account_name text;
  v_supabase_url text;
  v_anon_key text;
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage AND NEW.assigned_to IS NOT NULL THEN
    IF public.is_blocked_recipient(NEW.assigned_to) THEN RETURN NEW; END IF;

    SELECT name INTO account_name FROM accounts WHERE id = NEW.account_id;
    SELECT email INTO assigned_email FROM profiles WHERE email = NEW.assigned_to;

    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_anon_key := current_setting('app.settings.supabase_anon_key', true);

    IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL AND assigned_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification-email',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon_key),
        body := jsonb_build_object(
          'type','stage_change',
          'recipientEmail', assigned_email,
          'recipientName', NEW.assigned_to,
          'data', jsonb_build_object(
            'accountName', account_name,
            'oldStage', OLD.stage,
            'newStage', NEW.stage
          )
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
