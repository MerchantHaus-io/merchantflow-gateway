export type PipelineStage = 
  | 'lead'
  | 'contacted'
  | 'proposal'
  | 'underwriting'
  | 'approved'
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

export const STAGE_CONFIG: Record<PipelineStage, { label: string; colorClass: string }> = {
  lead: { label: 'Lead', colorClass: 'bg-stage-lead' },
  contacted: { label: 'Contacted', colorClass: 'bg-stage-contacted' },
  proposal: { label: 'Proposal', colorClass: 'bg-stage-proposal' },
  underwriting: { label: 'Underwriting', colorClass: 'bg-stage-underwriting' },
  approved: { label: 'Approved', colorClass: 'bg-stage-approved' },
  declined: { label: 'Declined', colorClass: 'bg-stage-declined' },
};

export const PIPELINE_STAGES: PipelineStage[] = [
  'lead',
  'contacted', 
  'proposal',
  'underwriting',
  'approved',
  'declined',
];
