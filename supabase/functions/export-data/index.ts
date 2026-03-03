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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role via user_roles table (service client bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Starting data export for admin:", user.email);

    // Fetch all tables including chat data
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
      "chat_channels",
      "chat_messages",
      "direct_messages",
      "message_reactions",
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
