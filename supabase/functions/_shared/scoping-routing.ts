// Pure routing logic for scoping submissions (Phase 2A).
//
// DELIBERATELY FREE OF DENO APIs AND REMOTE IMPORTS.
//
// `tsc` does not cover `supabase/functions/` — those files are Deno and sit in
// no tsconfig — so edge-function logic normally ships unchecked by every local
// gate. This module is importable from `src/`, which means the moment a test
// under `src/` imports it, TypeScript follows the import and typechecks it AND
// vitest executes it. See `src/lib/scopingRouting.test.ts`.
//
// Keep it that way: no `Deno.*`, no `https://` imports, no side effects. If you
// need those, they belong in the function body, not here.

/** Integration routes that imply gateway-only, i.e. no merchant processing. */
export const GATEWAY_ONLY_ROUTES = [
  "Direct API",
  "Hosted payment page",
  "Embedded fields/Collect.js",
  "Plugin or cart extension",
  "Mobile SDK",
] as const;

/**
 * Derive `opportunities.service_type` from the scoping form's
 * `integration_route` multi-select.
 *
 * Decision, 10 Aug 2026: default to `processing`, and only return
 * `gateway_only` when EVERY selected route is gateway-only. This matches the
 * live distribution (processing 77, gateway_only 14) rather than a guess, and
 * it fails safe: a mislabelled `processing` deal gets corrected on the
 * discovery call, whereas a mislabelled `gateway_only` one can be routed to
 * the wrong workflow before anyone looks at it.
 *
 * "Countertop/POS terminal" and "Virtual terminal only" are terminal options,
 * so their presence always yields `processing`. "Not sure — advise us" is not
 * in the gateway-only set, so it also yields `processing`.
 *
 * Empty, null or unrecognised input yields `processing` — the safe default.
 */
export function deriveServiceType(
  integrationRoute: readonly string[] | null | undefined,
): "processing" | "gateway_only" {
  if (!Array.isArray(integrationRoute)) return "processing";

  const routes = integrationRoute
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  if (routes.length === 0) return "processing";

  const gatewayOnly = new Set<string>(GATEWAY_ONLY_ROUTES);
  return routes.every((r) => gatewayOnly.has(r)) ? "gateway_only" : "processing";
}

/**
 * One business day from `from`, as an ISO timestamp.
 *
 * Saturday and Sunday are skipped. Public holidays are NOT handled — there is
 * no holiday calendar in this system, and inventing one here would be a guess
 * that silently shifts every SLA. Computed in UTC so it is deterministic and
 * testable; the CRM renders in the viewer's timezone anyway.
 */
export function oneBusinessDayFrom(from: Date): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + 1);
  // 0 = Sunday, 6 = Saturday
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString();
}

/**
 * Escape ILIKE wildcards so a value is matched literally.
 *
 * Contacts are matched on email, and matching has to be case-insensitive
 * (`ILIKE`) because addresses are stored as typed. But `_` is a legal email
 * character AND an ILIKE single-character wildcard, so an unescaped
 * `jo_bloggs@x.test` also matches `joXbloggs@x.test` — quietly attaching a
 * submission to the WRONG contact's account. `%` is the same problem, wider.
 *
 * Backslash is escaped first, otherwise it would double-escape the escapes.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
}

/** Trimmed non-empty string, or null. Used to avoid writing "" into columns. */
export function cleanStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * A short team-facing summary. Deliberately a handful of fields, not all 89 —
 * the brief is explicit that the notification is a summary and a deep link.
 */
export function buildTeamSummary(fields: {
  legalBusinessName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  monthlyVolume: string | null;
  currentlyProcessing: string | null;
  serviceType: string;
}): string {
  const lines = [
    `Business: ${fields.legalBusinessName ?? "—"}`,
    `Contact: ${fields.contactName ?? "—"}${fields.contactEmail ? ` <${fields.contactEmail}>` : ""}`,
    `Monthly volume: ${fields.monthlyVolume ?? "—"}`,
    `Currently processing: ${fields.currentlyProcessing ?? "—"}`,
    `Service type: ${fields.serviceType}`,
  ];
  return lines.join("\n");
}
