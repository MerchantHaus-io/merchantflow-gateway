import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Determines whether the authenticated user is an administrator. The check is
 * currently email-based so it can run fully on the client without additional
 * database lookups. Returns both the admin flag and a loading indicator so
 * consumers can avoid flash states.
 */
export const useUserRole = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.email) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Check if user is the designated admin
      const isAdminEmail = user.email === 'admin@merchanthaus.io';
      setIsAdmin(isAdminEmail);
      setLoading(false);
    };

    checkAdminStatus();
  }, [user]);

  return { isAdmin, loading };
};
