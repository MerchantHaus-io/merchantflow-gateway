export interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  createdBy?: string;
  createdAt: string;
  status: "open" | "in_progress" | "done";
  dueAt?: string;
  relatedOpportunityId?: string;
  relatedContactId?: string;
  comments?: string;
  source?: "manual" | "sla";
}

export type TaskInput = {
  title: string;
  description?: string;
  assignee: string;
  createdBy?: string;
  dueAt?: string;
  relatedOpportunityId?: string;
  relatedContactId?: string;
  comments?: string;
  source?: "manual" | "sla";
};
