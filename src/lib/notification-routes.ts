// Deterministic route resolution for notifications.
// Precedence:
//   1. Explicit `link` stored on the notification row (source of truth).
//   2. `notification_category` -> route.
//   3. `type` -> route (mobile overrides applied when opts.mobile === true).
// No keyword / free-text inference is performed.

export interface NotificationRouteInput {
  type?: string | null;
  link?: string | null;
  notification_category?: string | null;
}

export interface ResolveOptions {
  /** When true, apply mobile-specific route overrides (bottom-nav targets). */
  mobile?: boolean;
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

// Mobile bottom-nav routes differ for a handful of types.
// Keys not present here fall through to NOTIFICATION_TYPE_ROUTES.
export const MOBILE_NOTIFICATION_TYPE_ROUTES: Record<string, string> = {
  // Mobile bottom-nav uses /tasks (not /my-tasks) as the primary tab.
  task: "/tasks",
  task_assignment: "/tasks",
  // Mobile launcher exposes /pipeline for the primary board view.
  stage_change: "/pipeline",
  milestone: "/pipeline",
};

// Notifications flagged as deletion approvals/rejections use the generic
// success/warning `type`, so route them via `notification_category` first.
const CATEGORY_ROUTES: Record<string, string> = {
  stage_change: "/opportunities",
  task_assignment: "/my-tasks",
};

const MOBILE_CATEGORY_ROUTES: Record<string, string> = {
  stage_change: "/pipeline",
  task_assignment: "/tasks",
};

export function resolveNotificationRoute(
  n: NotificationRouteInput,
  opts: ResolveOptions = {},
): string | null {
  if (n.link && n.link.startsWith("/")) return n.link;

  const categoryMap = opts.mobile ? MOBILE_CATEGORY_ROUTES : CATEGORY_ROUTES;
  if (n.notification_category && categoryMap[n.notification_category]) {
    return categoryMap[n.notification_category];
  }

  if (n.type) {
    if (opts.mobile && MOBILE_NOTIFICATION_TYPE_ROUTES[n.type]) {
      return MOBILE_NOTIFICATION_TYPE_ROUTES[n.type];
    }
    if (NOTIFICATION_TYPE_ROUTES[n.type]) {
      return NOTIFICATION_TYPE_ROUTES[n.type];
    }
  }

  return null;
}
