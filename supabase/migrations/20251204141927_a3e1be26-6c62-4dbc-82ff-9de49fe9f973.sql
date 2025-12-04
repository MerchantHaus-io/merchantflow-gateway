-- Drop restrictive policies and add public read access for development
DROP POLICY IF EXISTS "Authenticated users can view all merchants" ON public.merchants;
DROP POLICY IF EXISTS "Authenticated users can create merchants" ON public.merchants;
DROP POLICY IF EXISTS "Authenticated users can update merchants" ON public.merchants;
DROP POLICY IF EXISTS "Authenticated users can delete merchants" ON public.merchants;

-- Allow public read access
CREATE POLICY "Anyone can view merchants" 
ON public.merchants 
FOR SELECT 
USING (true);

-- Allow public insert for development
CREATE POLICY "Anyone can create merchants" 
ON public.merchants 
FOR INSERT 
WITH CHECK (true);

-- Allow public update for development
CREATE POLICY "Anyone can update merchants" 
ON public.merchants 
FOR UPDATE 
USING (true);

-- Allow public delete for development
CREATE POLICY "Anyone can delete merchants" 
ON public.merchants 
FOR DELETE 
USING (true);