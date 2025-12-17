import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the user is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Verify user is admin using their token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user || user.email !== "admin@merchanthaus.io") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting data export for admin:", user.email);

    // Fetch all tables
    const tables = [
      "accounts",
      "applications",
      "contacts", 
      "opportunities",
      "tasks",
      "activities",
      "comments",
      "documents",
      "notifications",
      "deletion_requests",
      "profiles",
      "user_roles",
      "onboarding_wizard_states",
    ];

    const exportData: Record<string, unknown[]> = {};

    for (const table of tables) {
      const { data, error } = await adminClient.from(table).select("*");
      if (error) {
        console.error(`Error fetching ${table}:`, error);
        exportData[table] = [];
      } else {
        exportData[table] = data || [];
      }
      console.log(`Exported ${table}: ${exportData[table].length} records`);
    }

    // Create export metadata
    const metadata = {
      exported_at: new Date().toISOString(),
      exported_by: user.email,
      table_counts: Object.fromEntries(
        Object.entries(exportData).map(([k, v]) => [k, v.length])
      ),
    };

    // Return as JSON (client will create ZIP)
    return new Response(
      JSON.stringify({ data: exportData, metadata }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
