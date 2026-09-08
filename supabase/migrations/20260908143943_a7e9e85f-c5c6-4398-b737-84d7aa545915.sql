CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON public.notifications (user_id, read);
CREATE INDEX IF NOT EXISTS notifications_user_created_at_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON public.tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON public.tasks (assignee, status);
CREATE INDEX IF NOT EXISTS tasks_related_opportunity_idx ON public.tasks (related_opportunity_id);
CREATE INDEX IF NOT EXISTS tasks_related_contact_idx ON public.tasks (related_contact_id);