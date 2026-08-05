CREATE OR REPLACE FUNCTION public.notify_on_new_scoping_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, user_email, title, message, type, link)
  SELECT p.id,
         p.email,
         'New scoping form received',
         COALESCE(NEW.legal_business_name, 'A prospect') || ' submitted a Payments & Gateway Scoping Form.',
         'info',
         '/admin/web-submissions'
  FROM public.profiles p
  WHERE NOT public.is_blocked_recipient(p.email);
  RETURN NEW;
END;
$$;