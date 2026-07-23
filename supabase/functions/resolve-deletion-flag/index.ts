import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Simple JWT payload extractor
function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(jsonPayload);
}

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

    const { flagId, resolution, notes } = await req.json();

    if (!flagId || typeof flagId !== "string") {
      throw new Error("flagId is required");
    }
    if (!resolution || !["returned", "lost"].includes(resolution)) {
      throw new Error("resolution must be 'returned' or 'lost'");
    }

    // --- Extract caller from JWT in Authorization header ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");
    const token = authHeader.replace("Bearer ", "");
    const decoded = decodeJwtPayload(token) as { sub?: string };
    const callerJwtId = decoded.sub;
    if (!callerJwtId) throw new Error("Cannot extract caller identity from JWT");

    // --- Verify caller is system_admin ---
    const { data: callerCheck, error: callerCheckError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", callerJwtId)
      .single();

    if (callerCheckError || callerCheck?.role !== "system_admin") {
      throw new Error("Only system admins can resolve deletion flags");
    }

    // --- Fetch the flag to get borrow_id and library_id ---
    const { data: flag, error: flagError } = await supabase
      .from("user_deletion_flags")
      .select("borrow_id, copy_id, library_id")
      .eq("id", flagId)
      .single();

    if (flagError) throw new Error(flagError.message);
    if (!flag) throw new Error("Flag not found");

    if (!flag.borrow_id || !flag.copy_id || !flag.library_id) {
      throw new Error("Flag is missing required references");
    }

    // --- If resolution is 'returned', mark the borrow as returned ---
    if (resolution === "returned") {
      const now = new Date().toISOString().split("T")[0]; // date only for return_date
      const { error: borrowError } = await supabase
        .from("borrows")
        .update({
          return_date: now,
        })
        .eq("id", flag.borrow_id);

      if (borrowError) throw new Error(borrowError.message);
    }

    // --- Mark the flag as resolved ---
    const { error: flagUpdateError } = await supabase
      .from("user_deletion_flags")
      .update({
        status: resolution,
        notes: notes || null,
        resolved_by: callerJwtId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", flagId);

    if (flagUpdateError) throw new Error(flagUpdateError.message);

    // --- Count remaining pending flags for this library ---
    const { count: remainingPending } = await supabase
      .from("user_deletion_flags")
      .select("*", { count: "exact", head: true })
      .eq("library_id", flag.library_id)
      .eq("status", "pending");

    let libraryTransitions = false;

    // --- If zero pending flags remain, unarchive the library ---
    if (remainingPending === 0) {
      const { error: libError } = await supabase
        .from("libraries")
        .update({
          is_archived: false,
          library_status: "read_only",
        })
        .eq("id", flag.library_id);

      if (libError) throw new Error(libError.message);
      libraryTransitions = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        resolved: true,
        library_transitions: libraryTransitions,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
