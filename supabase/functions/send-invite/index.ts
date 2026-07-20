import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { email, data } = await req.json();

    if (!email || typeof email !== "string") {
      throw new Error("Valid email is required");
    }

    if (!data || typeof data !== "object") {
      throw new Error("User data (display_name, role) is required");
    }

    // Send invite with user metadata
    const { data: inviteResult, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(email, {
        data,
      });

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: inviteResult.user,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
