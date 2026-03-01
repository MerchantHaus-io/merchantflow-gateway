
ALTER TABLE public.client_interactions
  ADD COLUMN status text NOT NULL DEFAULT 'open',
  ADD COLUMN priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN channel text,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text,
  ADD COLUMN duration_minutes integer,
  ADD COLUMN follow_up_at timestamp with time zone,
  ADD COLUMN outcome text,
  ADD COLUMN resolution text,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_client_interaction_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_client_interactions_updated_at
  BEFORE UPDATE ON public.client_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_interaction_updated_at();

CREATE POLICY "Authenticated users can update client interactions"
  ON public.client_interactions FOR UPDATE
  USING (auth.uid() IS NOT NULL);
