const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NMI_BASE = "https://secure.nmi.com/api/v4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("NMI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "NMI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allMerchants: any[] = [];
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${NMI_BASE}/merchants?offset=${offset}&maxResults=${pageSize}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(apiKey + ":")}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("NMI API error:", res.status, text);
        return new Response(
          JSON.stringify({ error: "NMI API error", status: res.status, detail: text }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();

      // The v4 API may return merchants in different shapes depending on partner config
      const merchants = Array.isArray(data) ? data : data.merchants ?? data.data ?? [];

      if (merchants.length === 0) {
        hasMore = false;
      } else {
        for (const m of merchants) {
          allMerchants.push({
            merchant_id: m.merchant_id ?? m.id ?? null,
            company_name: m.company_name ?? m.company ?? m.dba_name ?? m.name ?? null,
            dba_name: m.dba_name ?? null,
            status: m.status ?? null,
            gateway_id: m.gateway_id ?? null,
            created_at: m.created_at ?? m.date_created ?? null,
          });
        }
        offset += merchants.length;
        if (merchants.length < pageSize) hasMore = false;
      }
    }

    return new Response(
      JSON.stringify({ merchants: allMerchants, total: allMerchants.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("nmi-list-merchants error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
