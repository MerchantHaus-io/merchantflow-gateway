export type OpportunityStage =
  | 'discovery'
  | 'qualified'
  | 'application_prep'
  | 'underwriting_review'
  | 'processor_approval'
  | 'gateway_submitted'
  | 'integration_setup'
  | 'testing'
  | 'go_live_ready';

export type OutcomeStatus =
  | 'closed_won'
  | 'closed_lost'
  | 'disqualified'
  | 'no_decision'
  | 'underwriting_declined';

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
  sla_status?: 'green' | 'amber' | 'red' | null;
  // Outcome fields
  outcome_status?: OutcomeStatus | null;
  outcome_reason?: string | null;
  outcome_notes?: string | null;
  outcome_closed_at?: string | null;
  outcome_closed_by?: string | null;
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
  'admin@merchanthaus.io': 'Jamie',
  'darryn@merchanthaus.io': 'Darryn',
  'support@merchanthaus.io': 'Yaseen',
  'sales@merchanthaus.io': 'Wesley',
  'taryn@merchanthaus.io': 'Taryn',
};

// Allowed emails that can access the dashboard
export const ALLOWED_EMAILS = [
  'darryn@merchanthaus.io',
];

// Helper to get team member name from email
export const getTeamMemberFromEmail = (email: string | undefined | null): string | null => {
  if (!email) return null;
  return EMAIL_TO_USER[email.toLowerCase()] || null;
};

// Helper to check if email is allowed - only specific team members
export const isEmailAllowed = (email: string | undefined | null): boolean => {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
};

export const STAGE_CONFIG: Record<
  OpportunityStage,
  { label: string; colorClass: string; headerClass: string; badgeClass: string; color: string; icon: string }
> = {
  discovery: {
    label: 'Discovery',
    colorClass: 'bg-zinc-600',
    headerClass: 'bg-zinc-600 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#52525b',
    icon: '🔍',
  },
  qualified: {
    label: 'Qualified',
    colorClass: 'bg-zinc-700',
    headerClass: 'bg-zinc-700 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#3f3f46',
    icon: '✓',
  },
  application_prep: {
    label: 'App Prep',
    colorClass: 'bg-slate-600',
    headerClass: 'bg-slate-600 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#475569',
    icon: '📝',
  },
  underwriting_review: {
    label: 'Underwriting',
    colorClass: 'bg-slate-700',
    headerClass: 'bg-slate-700 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#334155',
    icon: '📊',
  },
  processor_approval: {
    label: 'Approved',
    colorClass: 'bg-slate-800',
    headerClass: 'bg-slate-800 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#1e293b',
    icon: '✅',
  },
  gateway_submitted: {
    label: 'Gateway Setup',
    colorClass: 'bg-gray-700',
    headerClass: 'bg-gray-700 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#374151',
    icon: '🚀',
  },
  integration_setup: {
    label: 'Integration',
    colorClass: 'bg-gray-800',
    headerClass: 'bg-gray-800 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#1f2937',
    icon: '⚙️',
  },
  testing: {
    label: 'Testing',
    colorClass: 'bg-indigo-700',
    headerClass: 'bg-indigo-700 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#4338ca',
    icon: '🧪',
  },
  go_live_ready: {
    label: 'Go Live Ready',
    colorClass: 'bg-emerald-600',
    headerClass: 'bg-emerald-600 text-white',
    badgeClass: 'bg-white/20 text-white border-white/30',
    color: '#059669',
    icon: '🎯',
  },
};

// Outcome config for display
export const OUTCOME_CONFIG: Record<
  OutcomeStatus,
  { label: string; color: string; bgClass: string; textClass: string; icon: string }
> = {
  closed_won: {
    label: 'Closed Won',
    color: '#16a34a',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    icon: '🏆',
  },
  closed_lost: {
    label: 'Closed Lost',
    color: '#dc2626',
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-600 dark:text-red-400',
    icon: '✗',
  },
  disqualified: {
    label: 'Disqualified',
    color: '#9333ea',
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-600 dark:text-purple-400',
    icon: '🚫',
  },
  no_decision: {
    label: 'No Decision / Dead',
    color: '#71717a',
    bgClass: 'bg-zinc-500/10',
    textClass: 'text-zinc-600 dark:text-zinc-400',
    icon: '💀',
  },
  underwriting_declined: {
    label: 'Underwriting Declined',
    color: '#ea580c',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-600 dark:text-orange-400',
    icon: '⛔',
  },
};

export const OUTCOME_REASONS: Record<OutcomeStatus, string[]> = {
  closed_won: [
    'Live and billing ready',
    'First transaction processed',
    'Activated by onboarding',
  ],
  closed_lost: [
    'Competitor selected',
    'Pricing',
    'Product gap',
    'Timeline',
    'Integration complexity',
    'Withdrawn',
  ],
  disqualified: [
    'Unsupported MCC',
    'Geography not supported',
    'Volume too small',
    'Not a fit',
    'Duplicate / invalid opportunity',
    'Fraudulent',
  ],
  no_decision: [
    'No response',
    'Project paused',
    'Budget removed',
    'Internal priorities changed',
    'Withdrawn',
  ],
  underwriting_declined: [
    'Risk profile',
    'Restricted business type',
    'Chargeback concern',
    'Incomplete documentation',
    'Processor decline',
  ],
};

// Active pipeline stages (no terminal/outcome stages)
export const ACTIVE_PIPELINE_STAGES: OpportunityStage[] = [
  'discovery',
  'qualified',
  'application_prep',
  'underwriting_review',
  'processor_approval',
  'gateway_submitted',
  'integration_setup',
  'testing',
  'go_live_ready',
];

// Processing Pipeline stages
export const PROCESSING_PIPELINE_STAGES: OpportunityStage[] = [
  'discovery',
  'qualified',
  'application_prep',
  'underwriting_review',
  'processor_approval',
  'integration_setup',
  'testing',
  'go_live_ready',
];

// Gateway Only Pipeline stages
export const GATEWAY_ONLY_PIPELINE_STAGES: OpportunityStage[] = [
  'discovery',
  'qualified',
  'gateway_submitted',
  'integration_setup',
  'testing',
  'go_live_ready',
];

// Legacy: All stages for backwards compatibility
export const PIPELINE_STAGES: OpportunityStage[] = ACTIVE_PIPELINE_STAGES;

// Unified single-row pipeline (used by the board)
export const UNIFIED_PIPELINE_STAGES: OpportunityStage[] = ACTIVE_PIPELINE_STAGES;

/**
 * Migration helper: Maps old stage names to current stages
 */
export const migrateStage = (stage: string): OpportunityStage => {
  const STAGE_MIGRATION: Record<string, OpportunityStage> = {
    'opportunities': 'application_prep',
    'application_started': 'discovery',
    'live_activated': 'go_live_ready',
    'closed_won': 'go_live_ready',
    'closed_lost': 'discovery',
  };
  return STAGE_MIGRATION[stage] || (stage as OpportunityStage);
};

/**
 * Determines the service type (pipeline) for an opportunity based on its attributes
 */
export const getServiceType = (opportunity: Opportunity): ServiceType => {
  if (opportunity.service_type) return opportunity.service_type;
  if (opportunity.processing_services && opportunity.processing_services.length > 0) return 'processing';
  if (opportunity.value_services && opportunity.value_services.length > 0) return 'gateway_only';
  return 'processing';
};
