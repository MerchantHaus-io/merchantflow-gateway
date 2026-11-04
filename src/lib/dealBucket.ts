import { resolveDisplayName, type Opportunity } from "@/types/opportunity";

/** Where a deal sits in its life: still being worked, won, or out. */
export type DealBucket = "open" | "won" | "lost";

/**
 * Open = still being worked. Won = closed_won outcome or status "won" (some
 * won merchants keep status "active" after go-live). Everything else with an
 * outcome or status "dead" is lost.
 */
export function dealBucket(o: Pick<Opportunity, "status" | "outcome_status">): DealBucket {
  if (o.outcome_status === "closed_won" || o.status === "won") return "won";
  if (o.outcome_status || o.status === "dead") return "lost";
  return "open";
}

/**
 * `assigned_to` is free text: most rows hold an email, some a display name
 * ("Darryn", "Taryn Engledoe"). Compare on every form the signed-in user
 * could be stored as, case-insensitively.
 */
export function isAssignedTo(
  assignedTo: string | null | undefined,
  user: { email?: string | null; name?: string | null },
): boolean {
  if (!assignedTo) return false;
  const value = assignedTo.trim().toLowerCase();
  const forms = new Set(
    [user.email, user.name, user.email ? resolveDisplayName(user.email) : null, user.email?.split("@")[0]]
      .filter((v): v is string => !!v)
      .map((v) => v.trim().toLowerCase()),
  );
  if (forms.has(value)) return true;
  // A stored name resolves to the same person as the user's email.
  const resolved = resolveDisplayName(assignedTo).trim().toLowerCase();
  return forms.has(resolved);
}

