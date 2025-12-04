export type PipelineStage = 
  | 'lead'
  | 'contacted'
  | 'application'
  | 'underwriting'
  | 'approval'
  | 'live'
  | 'declined';

export interface Merchant {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  monthlyVolume: number;
  businessType: string;
  stage: PipelineStage;
  createdAt: Date;
  notes?: string;
  assignedTo?: string;
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

export const STAGE_CONFIG: Record<PipelineStage, { label: string; colorClass: string; defaultOwner: TeamMember }> = {
  lead: { label: 'Lead', colorClass: 'bg-team-wesley', defaultOwner: 'Wesley' },
  contacted: { label: 'Contacted', colorClass: 'bg-team-wesley', defaultOwner: 'Wesley' },
  application: { label: 'Application', colorClass: 'bg-team-leo', defaultOwner: 'Leo' },
  underwriting: { label: 'Underwriting', colorClass: 'bg-team-leo', defaultOwner: 'Leo' },
  approval: { label: 'Approval', colorClass: 'bg-team-jamie', defaultOwner: 'Jamie' },
  live: { label: 'Live', colorClass: 'bg-team-darryn', defaultOwner: 'Darryn' },
  declined: { label: 'Declined', colorClass: 'bg-destructive', defaultOwner: 'Taryn' },
};

export const PIPELINE_STAGES: PipelineStage[] = [
  'lead',
  'contacted', 
  'application',
  'underwriting',
  'approval',
  'live',
  'declined',
];
