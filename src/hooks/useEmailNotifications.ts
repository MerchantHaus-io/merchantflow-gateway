import { supabase } from "@/integrations/supabase/client";

type NotificationType = "stage_change" | "task_assignment" | "opportunity_assignment";

interface EmailNotificationData {
  type: NotificationType;
  recipientEmail: string;
  recipientName?: string;
  data: Record<string, unknown>;
}

export const sendEmailNotification = async ({
  type,
  recipientEmail,
  recipientName,
  data,
}: EmailNotificationData): Promise<boolean> => {
  try {
    console.log(`Sending ${type} email notification to ${recipientEmail}`);

    const { error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        type,
        recipientEmail,
        recipientName,
        data,
      },
    });

    if (error) {
      console.error("Failed to send email notification:", error);
      return false;
    }

    console.log("Email notification sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending email notification:", error);
    return false;
  }
};

// Helper to get user email from team member name
export const getTeamMemberEmail = (teamMemberName: string): string | null => {
  const emailMap: Record<string, string> = {
    "Yaseen": "yaseen@merchanthaus.io",
    "Taryn": "taryn@merchanthaus.io",
    "Kyle": "kyle@merchanthaus.io",
    "Ryan": "ryan@merchanthaus.io",
  };
  return emailMap[teamMemberName] || null;
};

// Send stage change notification
export const sendStageChangeEmail = async (
  assignedTo: string,
  accountName: string,
  oldStage: string,
  newStage: string,
  changedBy?: string
): Promise<boolean> => {
  const recipientEmail = getTeamMemberEmail(assignedTo);
  if (!recipientEmail) {
    console.log(`No email found for team member: ${assignedTo}`);
    return false;
  }

  return sendEmailNotification({
    type: "stage_change",
    recipientEmail,
    recipientName: assignedTo,
    data: {
      accountName,
      oldStage,
      newStage,
      changedBy,
    },
  });
};

// Send task assignment notification
export const sendTaskAssignmentEmail = async (
  assignee: string,
  taskTitle: string,
  description?: string,
  priority?: string,
  dueDate?: string,
  assignedBy?: string
): Promise<boolean> => {
  const recipientEmail = getTeamMemberEmail(assignee);
  if (!recipientEmail) {
    console.log(`No email found for team member: ${assignee}`);
    return false;
  }

  return sendEmailNotification({
    type: "task_assignment",
    recipientEmail,
    recipientName: assignee,
    data: {
      taskTitle,
      description,
      priority,
      dueDate,
      assignedBy,
    },
  });
};

// Send opportunity assignment notification
export const sendOpportunityAssignmentEmail = async (
  assignedTo: string,
  accountName: string,
  contactName?: string,
  stage?: string
): Promise<boolean> => {
  const recipientEmail = getTeamMemberEmail(assignedTo);
  if (!recipientEmail) {
    console.log(`No email found for team member: ${assignedTo}`);
    return false;
  }

  return sendEmailNotification({
    type: "opportunity_assignment",
    recipientEmail,
    recipientName: assignedTo,
    data: {
      accountName,
      contactName,
      stage,
    },
  });
};
