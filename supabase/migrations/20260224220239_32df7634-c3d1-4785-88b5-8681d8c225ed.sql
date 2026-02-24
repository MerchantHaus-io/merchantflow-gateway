-- Add recording_url column to call_logs for storing Quo recording links
ALTER TABLE public.call_logs ADD COLUMN recording_url text NULL;