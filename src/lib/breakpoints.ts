/**
 * One number for "is this the compact navigation layout?" (#134).
 *
 * Three different answers used to be in play. useIsMobile() said 768px, the
 * Tailwind `lg:` classes gating the icon rail and the tab bar said 1024px, and
 * MobileAppDock was gated on useIsMobile(). So between 768 and 1023 — iPad
 * portrait, a laptop in split view — you got no icon rail (needs `lg`), no app
 * dock (needs isMobile), and a bottom tab bar. That band had the weakest
 * navigation in the app, and it was nobody's decision.
 *
 * NAV_BREAKPOINT is the boundary the chrome uses, and it is the same number
 * Tailwind's `lg` is set to in tailwind.config.ts, which imports this file so
 * the two cannot drift.
 *
 * useIsMobile() keeps its own 768px threshold on purpose: that one answers a
 * different question — "is this a phone-sized viewport?" — and drives
 * content-level choices like which dialog style to use.
 */
export const NAV_BREAKPOINT = 1024;
