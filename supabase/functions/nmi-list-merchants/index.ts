import { corsHeaders } from "@supabase/supabase-js/cors";

const NMI_V4_BASE = "https://secure.nmi.com/api/v4";
const NMI_GATEWAY_BASE = "https://merchanthausio.transactiongateway.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("NMI_API_KEY");
    if (!apiKey) {
      return json({ error: "NMI_API_KEY not configured" }, 500);
    }

    // Try v3 Boarding API at white-label URL first (more detailed data)
    let merchants = await fetchV3Roster(apiKey);

    // Fall back to v4 Partner API if v3 fails
    if (!merchants) {
      console.log("v3 Boarding API unavailable, falling back to v4...");
      merchants = await fetchV4Roster(apiKey);
    }

    if (!merchants) {
      return json({ error: "Could not fetch merchant roster from NMI" }, 502);
    }

    return json({ merchants, total: merchants.length });
  } catch (err) {
    console.error("nmi-list-merchants error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// v3 Boarding API — richer data (processors, services, status details)
async function fetchV3Roster(apiKey: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${NMI_GATEWAY_BASE}/api/v3/affiliate/gateways`, {
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`v3 Boarding API error [${res.status}]:`, text.substring(0, 200));
      return null;
    }

    const data = await res.json();
    const gateways = Array.isArray(data) ? data : data.gateways ?? data.data ?? [];

    return gateways.map((g: any) => ({
      merchant_id: String(g.id ?? ""),
      company_name: g.company ?? g.company_name ?? null,
      dba_name: g.dba_name ?? null,
      status: g.status ?? null,
      gateway_id: String(g.id ?? ""),
      contact_email: g.contact_email ?? null,
      created_at: g.created_at ?? g.date_created ?? null,
      // v3-specific fields
      processors: g.processors ?? null,
      services: g.services ?? null,
      url: g.url ?? null,
    }));
  } catch (err) {
    console.warn("v3 Boarding API fetch failed:", err);
    return null;
  }
}

// v4 Partner API — basic roster
async function fetchV4Roster(apiKey: string): Promise<any[] | null> {
  const allMerchants: any[] = [];
  let offset = 0;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const url = `${NMI_V4_BASE}/merchants?offset=${offset}&maxResults=${pageSize}`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("NMI v4 API error:", res.status, text);
      return allMerchants.length > 0 ? allMerchants : null;
    }

    const data = await res.json();
    const merchants = Array.isArray(data) ? data : data.merchants ?? data.data ?? [];

    if (merchants.length === 0) {
      hasMore = false;
    } else {
      for (const m of merchants) {
        allMerchants.push({
          merchant_id: String(m.merchant_id ?? m.id ?? ""),
          company_name: m.company_name ?? m.company ?? m.dba_name ?? m.name ?? null,
          dba_name: m.dba_name ?? null,
          status: m.status ?? null,
          gateway_id: String(m.gateway_id ?? m.merchant_id ?? m.id ?? ""),
          created_at: m.created_at ?? m.date_created ?? null,
        });
      }
      offset += merchants.length;
      if (merchants.length < pageSize) hasMore = false;
    }
  }

  return allMerchants;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
