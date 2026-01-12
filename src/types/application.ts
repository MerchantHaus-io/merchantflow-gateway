// TypeScript interface for the Application data
// This corresponds to the 'applications' table in Supabase
// NOTE: You must create the 'applications' table in Supabase with matching columns

export interface Application {
  id?: string;
  full_name: string;
  email: string;
  phone?: string | null;
  company_name?: string | null;
  business_type?: string | null;
  monthly_volume?: string | null;
  message?: string | null;
  status?: 'pending' | 'reviewed' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

// Insert type (omits auto-generated fields)
export interface ApplicationInsert {
  full_name: string;
  email: string;
  phone?: string | null;
  company_name?: string | null;
  business_type?: string | null;
  monthly_volume?: string | null;
  message?: string | null;
  status?: 'pending' | 'reviewed' | 'approved' | 'rejected';
}

// Form data type for the apply form
export interface ApplicationFormData {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  business_type: string;
  monthly_volume: string;
  message: string;
}

// New Interface for the Detailed Merchant Application (from Public Website)
// Matches the 'merchant_applications' table created for the full 4-step intake
export interface PublicMerchantApplication {
  id: string;
  // Business Profile
  dba_name: string;
  dba_contact_first: string;
  dba_contact_last: string;
  dba_email: string;
  dba_phone: string;
  products?: string;
  nature_of_business?: string;
  
  // Locations
  dba_address?: string;
  dba_city?: string;
  dba_state?: string;
  dba_zip?: string;

  // Processing
  monthly_volume?: number;
  avg_ticket?: number;
  high_ticket?: number;
  
  // Meta
  status: 'pending' | 'converted' | 'archived';
  created_at: string;
  updated_at?: string;
  notes?: string;
}
