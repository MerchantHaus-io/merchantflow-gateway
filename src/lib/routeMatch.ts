/**
 * Path matching on whole segments.
 *
 * A bare `pathname.startsWith(base)` is wrong for URLs and has now caused the
 * same bug three times in this codebase:
 *
 *   - `/contacts` matched the public route `/contact`, stripping the internal
 *     widgets from a staff page (audit 1 #1)
 *   - `/reports/transactions` matched both the Merchants group and the Reports
 *     group in the icon rail, lighting up two sections at once (#108)
 *   - `/support-request` matched `/support`, so the header's Ops/Support pill
 *     showed "Support" on the public request form (#109)
 *
 * `/support` contains `/support-request`; `/support/` does not.
 */
export function isPathWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Length of the matched prefix, or -1 when it doesn't match.
 *
 * Lets a caller pick the most specific of several candidate matches — the
 * icon rail uses it so `/reports/transactions` resolves to the group that owns
 * that exact path rather than whichever group happened to be listed first.
 */
export function pathMatchDepth(pathname: string, base: string): number {
  return isPathWithin(pathname, base) ? base.length : -1;
}
