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

    const { profileId } = await req.json();

    if (!profileId || typeof profileId !== "string") {
      throw new Error("profileId is required");
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
      throw new Error("Only system admins can delete users");
    }

    // --- Get target profile ---
    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", profileId)
      .single();

    if (targetError) throw new Error(targetError.message);
    if (!targetProfile) throw new Error("Profile not found");

    // --- Single-admin guard ---
    const { count: remainingAdmins } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "system_admin")
      .neq("id", profileId)
      .is("deleted_at", null);

    if (remainingAdmins === 0) {
      throw new Error("Cannot delete the last active system_admin");
    }

    // --- Find all unreturned borrows for this user ---
    const { data: unreturnedBorrows, error: borrowsError } = await supabase
      .from("borrows")
      .select("id, copy_id")
      .eq("patron_user_id", profileId)
      .is("return_date", null);

    if (borrowsError) throw new Error(borrowsError.message);

    let borrowsEscalated = 0;

    if (unreturnedBorrows && unreturnedBorrows.length > 0) {
      const copyIds = unreturnedBorrows.map((b: { copy_id: string }) => b.copy_id);
      const { data: copies, error: copiesError } = await supabase
        .from("book_copies")
        .select("id, library_id")
        .in("id", copyIds);

      if (copiesError) throw new Error(copiesError.message);

      const copyToLibrary = new Map<string, string>(
        copies.map((c) => [c.id, c.library_id]),
      );

      // Create user_deletion_flags for each unreturned borrow
      const flags = unreturnedBorrows.map((borrow: { id: string; copy_id: string }) => ({
        borrow_id: borrow.id,
        copy_id: borrow.copy_id,
        library_id: copyToLibrary.get(borrow.copy_id),
        deleted_user_id: profileId,
        status: "pending",
      }));

      const nonNullFlags = flags.filter((f) => f.library_id !== undefined);

      if (nonNullFlags.length > 0) {
        const { error: flagError } = await supabase
          .from("user_deletion_flags")
          .insert(nonNullFlags);

        if (flagError) throw new Error(flagError.message);
        borrowsEscalated = nonNullFlags.length;
      }
    }

    // --- Find all active holds for this user and cancel them ---
    const { data: activeHolds, error: holdsError } = await supabase
      .from("holds")
      .select("id")
      .eq("patron_user_id", profileId)
      .in("status", ["waiting", "accepted"]);

    if (holdsError) throw new Error(holdsError.message);

    let holdsReleased = 0;

    if (activeHolds && activeHolds.length > 0) {
      const holdIds = activeHolds.map((h: { id: string }) => h.id);
      const { error: cancelError } = await supabase
        .from("holds")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .in("id", holdIds);

      if (cancelError) throw new Error(cancelError.message);
      holdsReleased = holdIds.length;
    }

    // --- If user is library_owner, call archive-library ---
    let libraryArchived = false;

    if (targetProfile.role === "library_owner") {
      const { data: myLibrary, error: libError } = await supabase
        .from("libraries")
        .select("id")
        .eq("owner_id", profileId)
        .single();

      if (!libError && myLibrary) {
        const archiveUrl = `${supabaseUrl}/functions/v1/archive-library`;
        const archiveResp = await fetch(archiveUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ libraryId: myLibrary.id }),
        });

        if (archiveResp.ok) {
          libraryArchived = true;
        } else {
          const archiveBody = await archiveResp.json();
          console.error("archive-library failed:", archiveBody);
          throw new Error(
            `Failed to archive library: ${archiveBody.error || "unknown error"}`,
          );
        }
      }
    }

    // --- Soft-delete the profile ---
    const { error: deleteError } = await supabase
      .from("profiles")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (deleteError) throw new Error(deleteError.message);

    return new Response(
      JSON.stringify({
        success: true,
        borrows_escalated: borrowsEscalated,
        holds_released: holdsReleased,
        library_archived: libraryArchived,
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
