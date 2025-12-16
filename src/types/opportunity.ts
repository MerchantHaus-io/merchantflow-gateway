export type OpportunityStage =
  | 'application_started'
  | 'discovery'
  | 'qualified'
  | 'application_prep'
  | 'underwriting_review'
  | 'processor_approval'
  | 'integration_setup'
  | 'gateway_submitted'
  | 'live_activated'
  | 'closed_won'
  | 'closed_lost';

// Service type determines which pipeline an opportunity belongs to
export type ServiceType = 'processing' | 'gateway_only';

export interface Account {
  id: string;
  name: string;
  status?: 'active' | 'dead';
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  fax?: string;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  account_id: string;
  contact_id: string;
  stage: OpportunityStage;
  status?: 'active' | 'dead';
  service_type?: ServiceType;
  referral_source?: string;
  username?: string;
  processing_services?: string[];
  value_services?: string[];
  agree_to_terms?: boolean;
  timezone?: string;
  language?: string;
  assigned_to?: string;
  stage_entered_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  account?: Account;
  contact?: Contact;

  /** Optional wizard state saved from the onboarding/preboarding flow */
  wizard_state?: OnboardingWizardState;

  /** Related documents belonging to this opportunity */
  documents?: Document[];
  /** Related activities logged for this opportunity */
  activities?: Activity[];
}

export interface Document {
  id: string;
  opportunity_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  opportunity_id: string;
  type: string;
  description: string | null;
  created_at: string;
}

export interface OnboardingWizardState {
  id: string;
  opportunity_id: string;
  progress: number;
  step_index: number;
  form_state: unknown;
  created_at: string;
  updated_at: string;
}

export const TEAM_MEMBERS = [
  'Taryn',
  'Darryn',
  'Jamie',
  'Yaseen',
  'Wesley',
  'Sales',
] as const;

export type TeamMember = typeof TEAM_MEMBERS[number];

export const TEAM_MEMBER_COLORS: Record<string, string> = {
  'Wesley': 'border-team-wesley',
  'Jamie': 'border-team-jamie',
  'Darryn': 'border-team-darryn',
  'Taryn': 'border-team-taryn',
  'Yaseen': 'border-team-yaseen',
  'Sales': 'border-team-sales',
};

// Map user emails to display names
export const EMAIL_TO_USER: Record<string, string> = {
  'dyan@merchanthaus.io': 'Wesley',
  'admin@merchanthaus.io': 'Jamie',
  'support@merchanthaus.io': 'Yaseen',
  'taryn@merchanthaus.io': 'Taryn',
  'sales@merchanthaus.io': 'Sales',
};

export const STAGE_CONFIG: Record<
  OpportunityStage,
  { label: string; colorClass: string; headerClass: string; badgeClass: string }
> = {
  application_started: {
    label: 'New',
    colorClass: 'bg-blue-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  discovery: {
    label: 'Discovery',
    colorClass: 'bg-indigo-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  qualified: {
    label: 'Qualified',
    colorClass: 'bg-cyan-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  application_prep: {
    label: 'Application Prep',
    colorClass: 'bg-teal-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  underwriting_review: {
    label: 'Underwriting',
    colorClass: 'bg-purple-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  processor_approval: {
    label: 'Approved',
    colorClass: 'bg-pink-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  integration_setup: {
    label: 'Integration',
    colorClass: 'bg-orange-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  gateway_submitted: {
    label: 'Gateway Submission',
    colorClass: 'bg-yellow-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  live_activated: {
    label: 'Live',
    colorClass: 'bg-green-500',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  closed_won: {
    label: 'Closed Won',
    colorClass: 'bg-emerald-600',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
  closed_lost: {
    label: 'Closed Lost',
    colorClass: 'bg-destructive',
    headerClass: 'bg-black text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
  },
};

// Processing Pipeline stages (full flow)
export const PROCESSING_PIPELINE_STAGES: OpportunityStage[] = [
  'application_started',
  'discovery',
  'qualified',
  'application_prep',
  'underwriting_review',
  'processor_approval',
  'integration_setup',
  'live_activated',
  'closed_won',
];

// Gateway Only Pipeline stages (simplified flow)
export const GATEWAY_ONLY_PIPELINE_STAGES: OpportunityStage[] = [
  'application_started',
  'discovery',
  'qualified',
  'gateway_submitted',
  'live_activated',
  'integration_setup',
  'closed_won',
];

// Legacy: All stages for backwards compatibility
export const PIPELINE_STAGES: OpportunityStage[] = [
  'application_started',
  'discovery',
  'qualified',
  'application_prep',
  'underwriting_review',
  'processor_approval',
  'integration_setup',
  'gateway_submitted',
  'live_activated',
  'closed_won',
  'closed_lost',
];

/**
 * Migration helper: Maps old 'opportunities' stage to new 'application_prep' stage
 * This ensures no data is lost during the stage rename
 */
export const migrateStage = (stage: string): OpportunityStage => {
  if (stage === 'opportunities') {
    return 'application_prep';
  }
  return stage as OpportunityStage;
};

/**
 * Determines the service type (pipeline) for an opportunity based on its attributes
 * - If service_type is explicitly set, use that
 * - If processing_services has items, it's a Processing opportunity
 * - If value_services includes gateway-only items, it's Gateway Only
 * - Default to Processing pipeline
 */
export const getServiceType = (opportunity: Opportunity): ServiceType => {
  // Explicit service_type takes precedence
  if (opportunity.service_type) {
    return opportunity.service_type;
  }

  // If processing_services is populated with any items, it's Processing
  if (opportunity.processing_services && opportunity.processing_services.length > 0) {
    return 'processing';
  }

  // If only value_services (gateway-only services) are present, it's Gateway Only
  if (opportunity.value_services && opportunity.value_services.length > 0) {
    return 'gateway_only';
  }

  // Default to processing
  return 'processing';
};
