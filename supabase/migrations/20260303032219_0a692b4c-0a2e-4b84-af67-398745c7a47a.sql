
-- 1. Drop the DM bell notification trigger (DMs already show unread via read_at)
DROP TRIGGER IF EXISTS on_direct_message_notify ON public.direct_messages;

-- 2. Create a function to notify on new web submissions (applications)
CREATE OR REPLACE FUNCTION public.notify_on_new_web_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _profile RECORD;
BEGIN
  -- Notify all authenticated team members about new web submission
  FOR _profile IN SELECT id, email FROM public.profiles WHERE email IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, user_email, title, message, type, link)
    VALUES (
      _profile.id,
      _profile.email,
      'New Web Submission',
      COALESCE(NEW.full_name, 'Unknown') || ' — ' || COALESCE(NEW.company_name, NEW.email),
      'info',
      '/web-submissions'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger for new applications
CREATE TRIGGER on_new_web_submission
AFTER INSERT ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_web_submission();
