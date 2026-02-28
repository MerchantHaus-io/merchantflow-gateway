export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  createdBy?: string;
  createdAt: string;
  status: "open" | "in_progress" | "done";
  priority?: TaskPriority;
  dueAt?: string;
  relatedOpportunityId?: string;
  relatedContactId?: string;
  comments?: string;
  source?: "manual" | "sla" | "notice";
  // Related entity info
  accountName?: string;
  contactName?: string;
}

export type TaskInput = {
  title: string;
  description?: string;
  assignee: string;
  createdBy?: string;
  priority?: TaskPriority;
  dueAt?: string;
  relatedOpportunityId?: string;
  relatedContactId?: string;
  comments?: string;
  source?: "manual" | "sla" | "notice";
};
