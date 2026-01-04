import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get profiles without avatars
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .is("avatar_url", null);

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "All profiles already have avatars", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${profiles.length} profiles without avatars`);

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const profile of profiles) {
      try {
        // Generate a unique avatar prompt based on email
        const name = profile.full_name || profile.email?.split("@")[0] || "User";
        const seed = profile.email || profile.id;
        
        // Create diverse prompts based on email hash
        const colors = ["blue", "purple", "green", "orange", "teal", "coral", "indigo", "amber"];
        const styles = ["geometric shapes", "abstract waves", "soft gradients", "minimal circles", "organic patterns"];
        const hash = seed.split("").reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
        const color = colors[hash % colors.length];
        const style = styles[hash % styles.length];

        const prompt = `Create a professional, modern avatar profile picture with ${style} in ${color} tones. Abstract, minimalist design suitable for a business application. No text, no faces. Clean, corporate aesthetic with subtle depth and lighting. Square format, centered composition.`;

        console.log(`Generating avatar for ${profile.email} with prompt: ${prompt}`);

        // Generate image using Lovable AI
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image-preview",
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`AI API error for ${profile.email}:`, errorText);
          results.push({ email: profile.email, success: false, error: `AI API error: ${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!imageData) {
          console.error(`No image generated for ${profile.email}`);
          results.push({ email: profile.email, success: false, error: "No image in response" });
          continue;
        }

        // Extract base64 data (remove data URL prefix)
        const base64Match = imageData.match(/^data:image\/\w+;base64,(.+)$/);
        if (!base64Match) {
          console.error(`Invalid image data format for ${profile.email}`);
          results.push({ email: profile.email, success: false, error: "Invalid image format" });
          continue;
        }

        const base64Data = base64Match[1];
        const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

        // Upload to Supabase Storage
        const fileName = `${profile.id}/avatar-generated.png`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, imageBytes, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Upload error for ${profile.email}:`, uploadError);
          results.push({ email: profile.email, success: false, error: `Upload failed: ${uploadError.message}` });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
        const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

        // Update profile with new avatar URL
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: avatarUrl })
          .eq("id", profile.id);

        if (updateError) {
          console.error(`Profile update error for ${profile.email}:`, updateError);
          results.push({ email: profile.email, success: false, error: `Update failed: ${updateError.message}` });
          continue;
        }

        console.log(`Successfully generated and set avatar for ${profile.email}`);
        results.push({ email: profile.email, success: true });

        // Small delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Error processing ${profile.email}:`, err);
        results.push({ email: profile.email, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        message: `Generated avatars for ${successCount} of ${profiles.length} profiles`,
        updated: successCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
