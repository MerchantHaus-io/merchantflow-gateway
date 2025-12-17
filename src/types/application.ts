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
