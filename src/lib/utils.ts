import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Formatting helpers ─────────────────────────────────────────────────
// Use these across the app so dates / currencies / percents look consistent.

/** Canonical short date: "Apr 20, 2026". Returns empty string on invalid input. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return format(d, "MMM d, yyyy");
}

/** Short date + time: "Apr 20, 2026, 3:04 PM". Empty string on invalid input. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return format(d, "MMM d, yyyy, h:mm a");
}

/** USD currency with proper symbol, grouping, and 2 decimals. */
export function formatCurrency(value: number | string | null | undefined, opts?: { decimals?: number }): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "";
  const decimals = opts?.decimals ?? 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** Percentage with fixed decimals (default 1): "12.5%". */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(decimals)}%`;
}

/** Pluralize based on count: pluralize(1, "record") => "1 record", pluralize(3, "record") => "3 records". */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`;
}
