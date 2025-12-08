export type OpportunityStage = 
  | 'application_started'
  | 'discovery'
  | 'qualified'
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

  /** Related documents belonging to this opportunity */
  documents?: Document[];
  /** Related activities logged for this opportunity */
  activities?: Activity[];
}

export interface Document {
  id: string;
  opportunity_id: string;
  name: string;
  url: string;
  uploaded_at: string;
}

export interface Activity {
  id: string;
  opportunity_id: string;
  type: string;
  description: string | null;
  created_at: string;
}

export const TEAM_MEMBERS = [
  'Taryn',
  'Darryn',
  'Jamie',
  'Yaseen',
  'Wesley',
  'Leo',
] as const;

export type TeamMember = typeof TEAM_MEMBERS[number];

export const TEAM_MEMBER_COLORS: Record<string, string> = {
  'Wesley': 'border-team-wesley',
  'Leo': 'border-team-leo',
  'Jamie': 'border-team-jamie',
  'Darryn': 'border-team-darryn',
  'Taryn': 'border-team-taryn',
  'Yaseen': 'border-team-yaseen',
};

export const STAGE_CONFIG: Record<OpportunityStage, { label: string; colorClass: string }> = {
  application_started: { label: 'New', colorClass: 'bg-blue-500' },
  discovery: { label: 'Discovery', colorClass: 'bg-indigo-500' },
  qualified: { label: 'Qualified', colorClass: 'bg-cyan-500' },
  underwriting_review: { label: 'Underwriting Review', colorClass: 'bg-purple-500' },
  processor_approval: { label: 'Processor Approval', colorClass: 'bg-pink-500' },
  integration_setup: { label: 'Integration Setup', colorClass: 'bg-orange-500' },
  gateway_submitted: { label: 'Gateway Submitted', colorClass: 'bg-yellow-500' },
  live_activated: { label: 'Live / Activated', colorClass: 'bg-green-500' },
  closed_won: { label: 'Closed Won', colorClass: 'bg-emerald-600' },
  closed_lost: { label: 'Closed Lost', colorClass: 'bg-destructive' },
};

export const PIPELINE_STAGES: OpportunityStage[] = [
  'application_started',
  'discovery', 
  'qualified',
  'underwriting_review',
  'processor_approval',
  'integration_setup',
  'gateway_submitted',
  'live_activated',
  'closed_won',
  'closed_lost',
];
