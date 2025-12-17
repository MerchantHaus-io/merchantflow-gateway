-- Migration: Create applications table for merchant service applications
-- This table stores application form submissions from the /apply page

CREATE TABLE IF NOT EXISTS applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company_name TEXT,
    business_type TEXT,
    monthly_volume TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- Create index on created_at for sorting by date
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert applications (public form submissions)
CREATE POLICY "Allow public to insert applications"
    ON applications
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow authenticated users to view all applications
CREATE POLICY "Allow authenticated users to view applications"
    ON applications
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to update applications (e.g., change status)
CREATE POLICY "Allow authenticated users to update applications"
    ON applications
    FOR UPDATE
    TO authenticated
    USING (true);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_applications_updated_at();

-- Add comment to table for documentation
COMMENT ON TABLE applications IS 'Stores merchant service application form submissions from the public /apply page';
