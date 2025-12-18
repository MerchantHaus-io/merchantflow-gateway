-- Create function to notify on task assignment
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_user_id uuid;
  assigned_email text;
BEGIN
  -- Only trigger if assignee changed and is not null
  IF (TG_OP = 'UPDATE' AND OLD.assignee IS DISTINCT FROM NEW.assignee AND NEW.assignee IS NOT NULL) 
     OR (TG_OP = 'INSERT' AND NEW.assignee IS NOT NULL) THEN
    
    -- Get user id and email from profiles by email
    SELECT id, email INTO assigned_user_id, assigned_email
    FROM profiles
    WHERE email = NEW.assignee;
    
    IF assigned_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        assigned_user_id,
        assigned_email,
        'Task Assigned',
        'You have been assigned a new task: ' || NEW.title,
        'task',
        '/tasks'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create function to notify on opportunity assignment
CREATE OR REPLACE FUNCTION public.notify_opportunity_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      INSERT INTO notifications (user_id, user_email, title, message, type, link)
      VALUES (
        assigned_user_id,
        assigned_email,
        'Opportunity Assigned',
        'You have been assigned to opportunity: ' || COALESCE(account_name, 'Unknown Account'),
        'opportunity',
        '/'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
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