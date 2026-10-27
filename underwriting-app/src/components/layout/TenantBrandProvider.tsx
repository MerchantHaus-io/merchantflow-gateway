import { useEffect, type ReactNode } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { toHslTriplet } from "@/lib/brand";

/**
 * Applies per-tenant branding at runtime: primary color → CSS variables (so the
 * whole UI recolors with no code change) and product name → document title.
 * This is what structurally replaces the origin CRM's ~121 hardcoded-brand refs.
 */
export function TenantBrandProvider({ children }: { children: ReactNode }) {
  const { settings } = useTenant();

  useEffect(() => {
    const root = document.documentElement;
    const triplet = toHslTriplet(settings?.primary_color);
    if (triplet) {
      root.style.setProperty("--primary", triplet);
      root.style.setProperty("--ring", triplet);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
    }
    document.title = settings?.product_name || "Underwriting";
  }, [settings?.primary_color, settings?.product_name]);

  return <>{children}</>;
}
