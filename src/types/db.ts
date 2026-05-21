import type { Tables } from "@/integrations/supabase/types";

export type Account            = Tables<"accounts">;
export type Contact            = Tables<"contacts">;
export type Opportunity        = Tables<"opportunities">;
export type DocumentRow        = Tables<"documents">;
export type ClientInteraction  = Tables<"client_interactions">;
export type OutreachCampaign   = Tables<"outreach_campaigns">;
export type SupportTicket          = Tables<"support_tickets">;
export type SupportTicketComment   = Tables<"support_ticket_comments">;
