ALTER TABLE public.action_items
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_type text,
  ADD COLUMN attachment_size integer;