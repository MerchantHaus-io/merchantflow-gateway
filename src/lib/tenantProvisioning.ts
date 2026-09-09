/**
 * Tenant provisioning + onboarding vocabulary shared by the admin screen and
 * (by duplication of the step keys only) the `provision-tenant` worker.
 *
 * The worker owns execution; this module owns labels, ordering and the
 * "is this tenant ready?" derivation the UI renders. Keeping the required
 * onboarding step list in one place stops the wizard and the worker's readiness
 * assertion drifting apart.
 */

export const PROVISIONING_STEPS = [
  { key: "validate_request", label: "Validate request" },
  { key: "create_tenant", label: "Create organisation" },
  { key: "default_settings", label: "Apply default settings and plan" },
  { key: "onboarding_state", label: "Open the setup wizard" },
  { key: "invite_admin", label: "Invite the first administrator" },
  { key: "audit_event", label: "Write audit record" },
  { key: "readiness_assert", label: "Readiness assertion" },
] as const;

export type ProvisioningStepKey = (typeof PROVISIONING_STEPS)[number]["key"];

export const stepLabel = (key: string): string =>
  PROVISIONING_STEPS.find((s) => s.key === key)?.label ?? key;

/** Setup wizard. Every step marked required must be done before Ready. */
export const ONBOARDING_STEPS = [
  { key: "welcome", label: "Welcome", required: false, help: "Introduce the workspace." },
  { key: "branding", label: "Name & branding", required: true, help: "Display name and colours." },
  { key: "sender_identity", label: "Sending identity", required: true, help: "Reply-to address used on outbound email." },
  { key: "pricing", label: "Confirm pricing basis", required: true, help: "Gateway and processing schedule for this ISO." },
  { key: "team", label: "Invite the team", required: true, help: "At least the first administrator." },
  { key: "integrations", label: "Connect integrations", required: false, help: "Optional; can be done later." },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export const REQUIRED_ONBOARDING_STEPS: string[] = ONBOARDING_STEPS.filter(
  (s) => s.required,
).map((s) => s.key);

export const onboardingProgress = (completed: string[] | null | undefined) => {
  const done = new Set(completed ?? []);
  const requiredDone = REQUIRED_ONBOARDING_STEPS.filter((k) => done.has(k));
  return {
    requiredTotal: REQUIRED_ONBOARDING_STEPS.length,
    requiredDone: requiredDone.length,
    complete: requiredDone.length === REQUIRED_ONBOARDING_STEPS.length,
    missing: REQUIRED_ONBOARDING_STEPS.filter((k) => !done.has(k)),
    percent: Math.round((requiredDone.length / REQUIRED_ONBOARDING_STEPS.length) * 100),
  };
};

export const TENANT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  provisioning: "Setting up",
  ready: "Ready",
  active: "Active",
  suspended: "Suspended",
  failed: "Setup failed",
  deactivated: "Deactivated",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Slug rules mirrored by the worker's validate_request step. */
export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export const isValidSlug = (slug: string): boolean => /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
