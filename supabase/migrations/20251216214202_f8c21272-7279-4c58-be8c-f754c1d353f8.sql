-- Create deletion_requests table
CREATE TABLE public.deletion_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,
  requester_email TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'opportunity', 'account', 'contact'
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Deletion requests policies (authenticated can create, admin can view all)
CREATE POLICY "Authenticated users can create deletion requests"
ON public.deletion_requests FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view own requests"
ON public.deletion_requests FOR SELECT
USING (auth.uid()::text = requester_id::text OR is_admin_email());

CREATE POLICY "Admin can update deletion requests"
ON public.deletion_requests FOR UPDATE
USING (is_admin_email());

CREATE POLICY "Admin can delete deletion requests"
ON public.deletion_requests FOR DELETE
USING (is_admin_email());

-- Notifications policies (users see own notifications)
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);