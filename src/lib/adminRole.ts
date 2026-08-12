/**
 * Resolving "is this user an admin?" from a `user_roles` lookup.
 *
 * Kept as a pure function, separate from the hook, so the decision can be
 * tested without React or a Supabase client — the same split used by
 * `redactCost` and `routeMatch`.
 *
 * The rule that matters: a lookup that **errored** is not the same as a lookup
 * that returned **no row**. Errored means "we do not know"; no row means "we
 * know, and they are not an admin". Both deny access, but only the first is
 * worth telling the user about, and neither may ever grant it.
 *
 * `AuthContext` already draws this distinction for referrer profiles via
 * `roleUnavailable`. This mirrors it.
 */

export interface AdminRoleLookup {
  /** The row returned by the `user_roles` query, if any. */
  data: unknown;
  /** The error returned by the query, if it failed. */
  error: unknown;
}

export interface AdminRoleState {
  /** True only when a successful lookup confirmed an admin role. */
  isAdmin: boolean;
  /**
   * True when the lookup failed, so admin status is genuinely unknown.
   * Callers gating a whole screen should distinguish this from a confirmed
   * denial and offer a retry rather than an "access denied".
   */
  roleUnavailable: boolean;
}

/** State for a signed-out user: not an admin, and that is known, not unknown. */
export const SIGNED_OUT_ADMIN_ROLE: AdminRoleState = {
  isAdmin: false,
  roleUnavailable: false,
};

/**
 * Decide admin state from a `user_roles` lookup result.
 *
 * Fails closed. There is deliberately no fallback that infers admin from an
 * email address: an email is not a permission, and treating a failed query as
 * grounds to consult a hardcoded list turns a transient network blip into a
 * privilege grant.
 */
export const resolveAdminRole = ({ data, error }: AdminRoleLookup): AdminRoleState => {
  if (error) {
    return { isAdmin: false, roleUnavailable: true };
  }
  return { isAdmin: Boolean(data), roleUnavailable: false };
};
