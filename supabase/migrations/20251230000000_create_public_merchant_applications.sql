-- Create table for detailed public submissions
CREATE TABLE IF NOT EXISTS merchant_applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Business Profile
    dba_name TEXT,
    products TEXT,
    nature_of_business TEXT,
    dba_contact_first TEXT,
    dba_contact_last TEXT,
    dba_phone TEXT,
    dba_email TEXT,
    dba_address TEXT,
    dba_address2 TEXT,
    dba_city TEXT,
    dba_state TEXT,
    dba_zip TEXT,

    -- Legal Info
    legal_entity_name TEXT,
    legal_phone TEXT,
    legal_email TEXT,
    tin TEXT,
    ownership_type TEXT,
    formation_date DATE,
    state_incorporated TEXT,
    legal_address TEXT,
    legal_address2 TEXT,
    legal_city TEXT,
    legal_state TEXT,
    legal_zip TEXT,

    -- Processing Info
    has_existing_processor TEXT,
    is_switching_processor TEXT,
    current_processor_name TEXT,
    has_var_sheet TEXT,
    monthly_volume NUMERIC,
    avg_ticket NUMERIC,
    high_ticket NUMERIC,
    swiped_pct NUMERIC,
    keyed_pct NUMERIC,
    moto_pct NUMERIC,
    ecom_pct NUMERIC,
    b2c_pct NUMERIC,
    b2b_pct NUMERIC,
    
    -- Other
    website TEXT,
    sic_mcc TEXT,
    
    -- Checklist & Metadata
    has_bank_statements TEXT,
    has_voided_check TEXT,
    has_gov_id TEXT,
    has_articles_org TEXT,
    has_tax_doc TEXT,
    docs_link TEXT,
    notes TEXT,
    gateway_only_confirmed TEXT,
    
    status TEXT DEFAULT 'pending', -- 'pending', 'converted', 'archived'
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Public can INSERT, Authenticated CRM users can VIEW/EDIT
ALTER TABLE merchant_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert" ON merchant_applications FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public update own" ON merchant_applications FOR UPDATE TO anon USING (true);
CREATE POLICY "Staff view all" ON merchant_applications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff update all" ON merchant_applications FOR UPDATE TO authenticated USING (true);
