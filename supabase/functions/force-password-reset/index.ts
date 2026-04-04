import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    const ADMIN_EMAILS = ['admin@merchanthaus.io', 'it@merchanthaus.io'];
    if (authError || !caller || !ADMIN_EMAILS.includes(caller.email || '')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all users
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw listError;
    }

    console.log(`Found ${users.length} users to update`);

    // Update each user's metadata to require password change
    const results = [];
    for (const user of users) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { 
          user_metadata: { 
            ...user.user_metadata,
            must_change_password: true 
          } 
        }
      );
      
      if (updateError) {
        console.error(`Failed to update user ${user.email}:`, updateError);
        results.push({ email: user.email, success: false, error: updateError.message });
      } else {
        console.log(`Updated user ${user.email} - must_change_password set to true`);
        results.push({ email: user.email, success: true });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Updated ${results.filter(r => r.success).length} of ${users.length} users`,
        results 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in force-password-reset:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
