export type OpportunityStage =
  | 'application_started'
  | 'discovery'
  | 'qualified'
  | 'opportunities'
  | 'underwriting_review'
  | 'processor_approval'
  | 'integration_setup'
  | 'gateway_submitted'
  | 'live_activated'
  | 'closed_won'
  | 'closed_lost';

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
    headerClass: 'bg-gradient-to-r from-blue-600 to-blue-500 text-white',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-100',
  },
  discovery: {
    label: 'Discovery',
    colorClass: 'bg-indigo-500',
    headerClass: 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  qualified: {
    label: 'Qualified',
    colorClass: 'bg-cyan-500',
    headerClass: 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  },
  opportunities: {
    label: 'Opportunities',
    colorClass: 'bg-teal-500',
    headerClass: 'bg-gradient-to-r from-teal-600 to-teal-500 text-white',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-100',
  },
  underwriting_review: {
    label: 'Underwriting Review',
    colorClass: 'bg-purple-500',
    headerClass: 'bg-gradient-to-r from-purple-600 to-purple-500 text-white',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-100',
  },
  processor_approval: {
    label: 'Processor Approval',
    colorClass: 'bg-pink-500',
    headerClass: 'bg-gradient-to-r from-pink-600 to-pink-500 text-white',
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-100',
  },
  integration_setup: {
    label: 'Integration Setup',
    colorClass: 'bg-orange-500',
    headerClass: 'bg-gradient-to-r from-orange-600 to-orange-500 text-white',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-100',
  },
  gateway_submitted: {
    label: 'Gateway Submitted',
    colorClass: 'bg-yellow-500',
    headerClass: 'bg-gradient-to-r from-amber-500 to-amber-400 text-white',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  live_activated: {
    label: 'Live / Activated',
    colorClass: 'bg-green-500',
    headerClass: 'bg-gradient-to-r from-green-600 to-green-500 text-white',
    badgeClass: 'bg-green-50 text-green-700 border-green-100',
  },
  closed_won: {
    label: 'Closed Won',
    colorClass: 'bg-emerald-600',
    headerClass: 'bg-gradient-to-r from-emerald-700 to-emerald-600 text-white',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  closed_lost: {
    label: 'Closed Lost',
    colorClass: 'bg-destructive',
    headerClass: 'bg-gradient-to-r from-rose-600 to-rose-500 text-white',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-100',
  },
};

export const PIPELINE_STAGES: OpportunityStage[] = [
  'application_started',
  'discovery',
  'qualified',
  'opportunities',
  'underwriting_review',
  'processor_approval',
  'integration_setup',
  'gateway_submitted',
  'live_activated',
  'closed_won',
  'closed_lost',
];
