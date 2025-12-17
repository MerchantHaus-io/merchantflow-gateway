-- Create applications table for public application submissions
CREATE TABLE public.applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company_name text,
  business_type text,
  monthly_volume text,
  message text,
  status text DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
WITH CHECK (true);

-- Only authenticated users can view
CREATE POLICY "Authenticated users can view applications"
ON public.applications
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admin can update/delete
CREATE POLICY "Admin can update applications"
ON public.applications
FOR UPDATE
USING (is_admin_email());

CREATE POLICY "Admin can delete applications"
ON public.applications
FOR DELETE
USING (is_admin_email());