import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvFetch, kurvJson, adminClient } from "../_shared/kurv.ts";

// Proxies reusable EMS reference list endpoints for the wizard.
const MAP: Record<string, { method: "GET" | "POST"; path: string }> = {
  mccs: { method: "GET", path: "/api/v1/MCCs" },
  mccs_with_categories: { method: "GET", path: "/api/v1/MCCs/WithCategories" },
  owner_titles: { method: "GET", path: "/api/v1/Owners/Titles" },
  ownership_types: { method: "GET", path: "/api/v1/Owners/OwnershipTypes" },
  sales_people: { method: "GET", path: "/api/v1/SalesPeople" },
  document_types: { method: "GET", path: "/api/v1/Documents/Types" },
  area_types: { method: "GET", path: "/api/v1/AreaTypes" },
  location_types: { method: "GET", path: "/api/v1/LocationTypes" },
  zone_types: { method: "GET", path: "/api/v1/ZoneTypes" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  try {
    const url = new URL(req.url);
    const list = url.searchParams.get("list");
    if (!list || !MAP[list]) {
      return kurvJson({ error: "Unknown list", available: Object.keys(MAP) }, 400);
    }
    const cfg = MAP[list];
    const res = await kurvFetch(cfg.path, { method: cfg.method }, adminClient());
    const text = await res.text();
    if (!res.ok) return kurvJson({ error: "Kurv API error", status: res.status, body: text }, 502);
    try { return kurvJson(JSON.parse(text)); } catch { return kurvJson({ raw: text }); }
  } catch (err) {
    return kurvJson({ error: (err as Error).message }, 500);
  }
});
