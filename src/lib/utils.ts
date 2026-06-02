import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Coerce an unknown value (e.g. a Supabase jsonb column) into a typed array.
 * Returns [] when the value is not an array — guards against jsonb records
 * that were historically written as an object instead of an array.
 */
export const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
