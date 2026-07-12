// Deterministic route resolution for notifications.
// Precedence:
//   1. Explicit `link` stored on the notification row (source of truth).
//   2. Exact `type` -> route mapping below.
// No keyword / free-text inference is performed.

export interface NotificationRouteInput {
  type?: string | null;
  link?: string | null;
  notification_category?: string | null;
}

// Every known `notifications.type` produced by the app maps here.
// Add new types alongside the insert site that introduces them.
export const NOTIFICATION_TYPE_ROUTES: Record<string, string> = {
  // Task / stage activity
  task: "/my-tasks",
  task_assignment: "/my-tasks",
  stage_change: "/opportunities",

  // Calendar & meetings
  calendar: "/calendar",
  meeting: "/calendar",

  // Pipeline & merchant flow
  milestone: "/opportunities",
  portal_lead: "/admin/web-submissions",
  application: "/opportunities",

  // Comms
  call: "/notifications",
  sms: "/notifications",
  message: "/notifications",

  // Finance
  nmi_webhook: "/reports/transactions",
  transaction: "/reports/transactions",
  commission: "/commissions",

  // Ops / admin
  inactivity_reminder: "/settings",
  deletion_request: "/admin/deletion-requests",
  support: "/support",

  // Category fallbacks used by NotificationBell
  general: "/notifications",
};

// Notifications flagged as deletion approvals/rejections use the generic
// success/warning `type`, so route them via `notification_category` first.
const CATEGORY_ROUTES: Record<string, string> = {
  stage_change: "/opportunities",
  task_assignment: "/my-tasks",
};

export function resolveNotificationRoute(
  n: NotificationRouteInput,
): string | null {
  if (n.link && n.link.startsWith("/")) return n.link;
  if (n.notification_category && CATEGORY_ROUTES[n.notification_category]) {
    return CATEGORY_ROUTES[n.notification_category];
  }
  if (n.type && NOTIFICATION_TYPE_ROUTES[n.type]) {
    return NOTIFICATION_TYPE_ROUTES[n.type];
  }
  return null;
}
