-- Create a function to get or create the general channel
CREATE OR REPLACE FUNCTION public.get_or_create_general_channel()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  channel_id uuid;
BEGIN
  SELECT id INTO channel_id FROM chat_channels WHERE name = 'general' LIMIT 1;
  
  IF channel_id IS NULL THEN
    INSERT INTO chat_channels (name, created_by)
    VALUES ('general', NULL)
    RETURNING id INTO channel_id;
  END IF;
  
  RETURN channel_id;
END;
$function$;

-- Create function to post system messages to general chat
CREATE OR REPLACE FUNCTION public.post_system_chat_message(
  p_content text,
  p_channel_name text DEFAULT 'general'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_channel_id uuid;
  v_system_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  -- Get or create the channel
  SELECT id INTO v_channel_id FROM chat_channels WHERE name = p_channel_name LIMIT 1;
  
  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels (name, created_by)
    VALUES (p_channel_name, NULL)
    RETURNING id INTO v_channel_id;
  END IF;
  
  -- Insert the system message
  INSERT INTO chat_messages (channel_id, user_id, user_email, user_name, content)
  VALUES (v_channel_id, v_system_user_id, 'system@ops.internal', 'Ops-Update', p_content);
END;
$function$;

-- Create function to send DM from system to a user
CREATE OR REPLACE FUNCTION public.send_system_dm(
  p_receiver_email text,
  p_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receiver_id uuid;
  v_system_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  -- Get receiver user id from profiles
  SELECT id INTO v_receiver_id FROM profiles WHERE email = p_receiver_email LIMIT 1;
  
  IF v_receiver_id IS NOT NULL THEN
    INSERT INTO direct_messages (sender_id, receiver_id, content)
    VALUES (v_system_user_id, v_receiver_id, p_content);
  END IF;
END;
$function$;

-- Update task assignment trigger to also post chat messages
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assigned_user_id uuid;
  assigned_email text;
  assigner_name text;
BEGIN
  -- Only trigger if assignee changed and is not null
  IF (TG_OP = 'UPDATE' AND OLD.assignee IS DISTINCT FROM NEW.assignee AND NEW.assignee IS NOT NULL) 
     OR (TG_OP = 'INSERT' AND NEW.assignee IS NOT NULL) THEN
    
    -- Get assigner name
    SELECT COALESCE(full_name, email) INTO assigner_name 
    FROM profiles 
    WHERE email = NEW.created_by 
    LIMIT 1;
    
    -- Get user id and email from profiles by email
    SELECT id, email INTO assigned_user_id, assigned_email
    FROM profiles
    WHERE email = NEW.assignee;
    
    IF assigned_user_id IS NOT NULL THEN
      -- Create notification
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        assigned_user_id,
        assigned_email,
        'Task Assigned',
        'You have been assigned a new task: ' || NEW.title,
        'task',
        '/tasks'
      );
      
      -- Send DM to assigned user
      PERFORM send_system_dm(
        NEW.assignee,
        '📋 **Task Assigned**: ' || NEW.title || COALESCE(E'\n' || NEW.description, '')
      );
    END IF;
    
    -- Post to general chat
    PERFORM post_system_chat_message(
      '📋 **Task Assignment**: ' || COALESCE(assigner_name, 'Someone') || ' assigned task "' || NEW.title || '" to ' || NEW.assignee
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update opportunity assignment trigger to also post chat messages
CREATE OR REPLACE FUNCTION public.notify_opportunity_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assigned_user_id uuid;
  assigned_email text;
  account_name text;
BEGIN
  -- Only trigger if assigned_to changed and is not null
  IF (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
    
    -- Get account name
    SELECT name INTO account_name FROM accounts WHERE id = NEW.account_id;
    
    -- Get user id and email from profiles by email
    SELECT id, email INTO assigned_user_id, assigned_email
    FROM profiles
    WHERE email = NEW.assigned_to;
    
    IF assigned_user_id IS NOT NULL THEN
      -- Create notification
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        assigned_user_id,
        assigned_email,
        'Opportunity Assigned',
        'You have been assigned to opportunity: ' || COALESCE(account_name, 'Unknown Account'),
        'opportunity',
        '/'
      );
      
      -- Send DM to assigned user
      PERFORM send_system_dm(
        NEW.assigned_to,
        '🎯 **Pipeline Assignment**: You have been assigned to opportunity "' || COALESCE(account_name, 'Unknown Account') || '"'
      );
    END IF;
    
    -- Post to general chat
    PERFORM post_system_chat_message(
      '🎯 **Pipeline Assignment**: ' || COALESCE(account_name, 'Unknown Account') || ' assigned to ' || NEW.assigned_to
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create triggers if they don't exist
DROP TRIGGER IF EXISTS on_task_assignment ON tasks;
CREATE TRIGGER on_task_assignment
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assignment();

DROP TRIGGER IF EXISTS on_opportunity_assignment ON opportunities;
CREATE TRIGGER on_opportunity_assignment
  AFTER INSERT OR UPDATE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION notify_opportunity_assignment();

-- Ensure general channel exists
SELECT get_or_create_general_channel();