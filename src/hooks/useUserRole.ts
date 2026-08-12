import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  resolveAdminRole,
  SIGNED_OUT_ADMIN_ROLE,
  type AdminRoleState,
} from "@/lib/adminRole";

/**
 * Determines whether the authenticated user is an administrator by reading the
 * `user_roles` table (RLS lets a user read their own roles).
 *
 * Fails closed: if the lookup errors, `isAdmin` is false and `roleUnavailable`
 * is true so callers can tell "we could not check" from "checked, not an
 * admin". Admin status is never inferred from an email address — see
 * `src/lib/adminRole.ts` for why.
 */
export const useUserRole = () => {
  const { user } = useAuth();
  const [state, setState] = useState<AdminRoleState>(SIGNED_OUT_ADMIN_ROLE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guards against a slow response for a previous user landing after the
    // account has changed and setting admin state for the wrong person.
    let cancelled = false;

    const checkAdminStatus = async () => {
      if (!user?.id) {
        setState(SIGNED_OUT_ADMIN_ROLE);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!cancelled) setState(resolveAdminRole({ data, error }));
      } catch (error) {
        if (!cancelled) setState(resolveAdminRole({ data: null, error }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAdminStatus();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isAdmin: state.isAdmin, roleUnavailable: state.roleUnavailable, loading };
};
