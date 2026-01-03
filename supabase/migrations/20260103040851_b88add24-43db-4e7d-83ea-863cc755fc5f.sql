-- Create function to send email on task assignment
CREATE OR REPLACE FUNCTION public.send_task_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  assigned_email text;
  assigner_name text;
  v_supabase_url text;
  v_anon_key text;
BEGIN
  -- Only trigger if assignee changed and is not null
  IF (TG_OP = 'UPDATE' AND OLD.assignee IS DISTINCT FROM NEW.assignee AND NEW.assignee IS NOT NULL) 
     OR (TG_OP = 'INSERT' AND NEW.assignee IS NOT NULL) THEN
    
    -- Get assigner name
    SELECT COALESCE(full_name, email) INTO assigner_name 
    FROM profiles 
    WHERE email = NEW.created_by 
    LIMIT 1;

    -- Get assigned user email from profiles
    SELECT email INTO assigned_email
    FROM profiles
    WHERE email = NEW.assignee;

    -- Get Supabase URL and anon key from environment
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_anon_key := current_setting('app.settings.supabase_anon_key', true);

    -- Only attempt to send email if we have configuration
    IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL AND assigned_email IS NOT NULL THEN
      -- Use pg_net to call the edge function asynchronously
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := jsonb_build_object(
          'type', 'task_assignment',
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
$function$;

-- Create function to send email on opportunity stage change
CREATE OR REPLACE FUNCTION public.send_stage_change_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  assigned_email text;
  account_name text;
  v_supabase_url text;
  v_anon_key text;
BEGIN
  -- Only trigger if stage changed and there's an assigned user
  IF OLD.stage IS DISTINCT FROM NEW.stage AND NEW.assigned_to IS NOT NULL THEN
    
    -- Get account name
    SELECT name INTO account_name FROM accounts WHERE id = NEW.account_id;
    
    -- Get assigned user email from profiles
    SELECT email INTO assigned_email
    FROM profiles
    WHERE email = NEW.assigned_to;

    -- Get Supabase URL and anon key from environment
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_anon_key := current_setting('app.settings.supabase_anon_key', true);

    -- Only attempt to send email if we have configuration
    IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL AND assigned_email IS NOT NULL THEN
      -- Use pg_net to call the edge function asynchronously
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := jsonb_build_object(
          'type', 'stage_change',
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
$function$;

-- Create function to send email on opportunity assignment
CREATE OR REPLACE FUNCTION public.send_opportunity_assignment_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  assigned_email text;
  account_name text;
  contact_name text;
  v_supabase_url text;
  v_anon_key text;
BEGIN
  -- Only trigger if assigned_to changed and is not null
  IF (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
    
    -- Get account name
    SELECT name INTO account_name FROM accounts WHERE id = NEW.account_id;
    
    -- Get contact name
    SELECT CONCAT(first_name, ' ', last_name) INTO contact_name FROM contacts WHERE id = NEW.contact_id;
    
    -- Get assigned user email from profiles
    SELECT email INTO assigned_email
    FROM profiles
    WHERE email = NEW.assigned_to;

    -- Get Supabase URL and anon key from environment
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_anon_key := current_setting('app.settings.supabase_anon_key', true);

    -- Only attempt to send email if we have configuration
    IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL AND assigned_email IS NOT NULL THEN
      -- Use pg_net to call the edge function asynchronously
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := jsonb_build_object(
          'type', 'opportunity_assignment',
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
$function$;