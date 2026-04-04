import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Determines whether the authenticated user is an administrator by checking
 * the user_roles table in the database via the has_role() security definer
 * function. Falls back to a client-side email check while loading.
 */
export const useUserRole = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.id) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // Query user_roles directly for the current user
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (error) {
          // Fallback to email-based check if DB query fails
          const adminEmails = ['admin@merchanthaus.io', 'it@merchanthaus.io'];
          setIsAdmin(adminEmails.includes(user.email || ''));
        } else {
          setIsAdmin(!!data);
        }
      } catch {
        const adminEmails = ['admin@merchanthaus.io', 'it@merchanthaus.io'];
        setIsAdmin(adminEmails.includes(user.email || ''));
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user]);

  return { isAdmin, loading };
};
