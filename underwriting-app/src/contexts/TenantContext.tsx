import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import type { Database, OrgRole, Json } from "@/integrations/supabase/types";

type Org = Database["public"]["Tables"]["orgs"]["Row"];
type OrgSettings = Database["public"]["Tables"]["org_settings"]["Row"];

export interface TenantState {
  loading: boolean;
  org: Org | null;
  settings: OrgSettings | null;
  role: OrgRole | null;
  /** True once membership has been resolved and the user has no org yet. */
  needsOrg: boolean;
  refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantState | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Org | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setOrg(null);
      setSettings(null);
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // v1: first membership wins. An org switcher can be layered on later.
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setOrg(null);
      setSettings(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const [{ data: orgRow }, { data: settingsRow }] = await Promise.all([
      supabase.from("orgs").select("*").eq("id", membership.org_id).maybeSingle(),
      supabase.from("org_settings").select("*").eq("org_id", membership.org_id).maybeSingle(),
    ]);

    setOrg(orgRow ?? null);
    setSettings(settingsRow ?? null);
    setRole((membership.role as OrgRole) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  return (
    <TenantContext.Provider
      value={{
        loading: authLoading || loading,
        org,
        settings,
        role,
        needsOrg: !authLoading && !loading && !!user && !org,
        refresh: load,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}

/** Convenience accessor for a typed house-rules object. */
export function houseRules(settings: OrgSettings | null): Record<string, Json> {
  return (settings?.house_rules as Record<string, Json>) ?? {};
}
