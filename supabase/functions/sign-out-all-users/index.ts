import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin emails allowed to perform this action
const ADMIN_EMAILS = ['admin@merchanthaus.io', 'darryn@merchanthaus.io'];

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create regular client to verify the requesting user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('User verification error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    if (!ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '')) {
      console.log('Non-admin user attempted sign-out-all:', user.email);
      return new Response(
        JSON.stringify({ error: 'Only admins can perform this action' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Admin user initiating sign-out-all:', user.email);

    // Get all users
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      return new Response(
        JSON.stringify({ error: 'Failed to list users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${users.length} users to sign out`);

    // Sign out each user by invalidating their sessions
    let signedOutCount = 0;
    const errors: string[] = [];

    for (const targetUser of users) {
      try {
        // Sign out user globally (invalidates all their sessions)
        const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUser.id, 'global');
        
        if (signOutError) {
          console.error(`Error signing out user ${targetUser.email}:`, signOutError);
          errors.push(`${targetUser.email}: ${signOutError.message}`);
        } else {
          signedOutCount++;
          console.log(`Signed out user: ${targetUser.email}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Exception signing out user ${targetUser.email}:`, err);
        errors.push(`${targetUser.email}: ${errorMessage}`);
      }
    }

    console.log(`Sign-out complete. ${signedOutCount}/${users.length} users signed out.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully signed out ${signedOutCount} of ${users.length} users`,
        signedOutCount,
        totalUsers: users.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sign out all users error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
