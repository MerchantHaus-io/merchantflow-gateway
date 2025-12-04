-- Add assigned_to column to opportunities table
ALTER TABLE public.opportunities 
ADD COLUMN assigned_to text;