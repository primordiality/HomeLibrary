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

    const { libraryId } = await req.json();

    if (!libraryId || typeof libraryId !== "string") {
      throw new Error("libraryId is required");
    }

    // --- Drop all active holds against this library ---
    const { data: activeHolds, error: holdsError } = await supabase
      .from("holds")
      .select("id")
      .eq("library_id", libraryId)
      .in("status", ["waiting", "accepted"]);

    if (holdsError) throw new Error(holdsError.message);

    let holdsDropped = 0;

    if (activeHolds && activeHolds.length > 0) {
      const holdIds = activeHolds.map((h: { id: string }) => h.id);
      const { error: cancelError } = await supabase
        .from("holds")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .in("id", holdIds);

      if (cancelError) throw new Error(cancelError.message);
      holdsDropped = holdIds.length;
    }

    // --- Find all outstanding borrows against this library ---
    const { data: libraryCopies, error: copiesError } = await supabase
      .from("book_copies")
      .select("id")
      .eq("library_id", libraryId);

    if (copiesError) throw new Error(copiesError.message);

    if (!libraryCopies || libraryCopies.length === 0) {
      // No copies in this library — just archive it
      const { error: archiveError } = await supabase
        .from("libraries")
        .update({ is_archived: true })
        .eq("id", libraryId);

      if (archiveError) throw new Error(archiveError.message);

      return new Response(
        JSON.stringify({
          success: true,
          holds_dropped: 0,
          borrows_escalated: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const copyIds = libraryCopies.map((c) => c.id);

    // Outstanding = no return_date
    const { data: outstandingBorrows, error: borrowsError } = await supabase
      .from("borrows")
      .select("id, copy_id")
      .in("copy_id", copyIds)
      .is("return_date", null);

    if (borrowsError) throw new Error(borrowsError.message);

    let borrowsEscalated = 0;

    if (outstandingBorrows && outstandingBorrows.length > 0) {
      // Check which already have escalation rows in user_deletion_flags
      const borrowIds = outstandingBorrows.map((b: { id: string }) => b.id);
      const { data: existingFlags, error: flagsError } = await supabase
        .from("user_deletion_flags")
        .select("borrow_id")
        .in("borrow_id", borrowIds);

      if (flagsError) throw new Error(flagsError.message);

      const alreadyEscalated = new Set(
        (existingFlags || []).map((f: { borrow_id: string }) => f.borrow_id),
      );

      const newFlags = outstandingBorrows.filter(
        (b: { id: string }) => !alreadyEscalated.has(b.id),
      );

      if (newFlags.length > 0) {
        const flagRows = newFlags.map((borrow: { id: string; copy_id: string }) => ({
          library_id: libraryId,
          borrow_id: borrow.id,
          copy_id: borrow.copy_id,
          status: "pending",
        }));

        const { error: flagError } = await supabase
          .from("user_deletion_flags")
          .insert(flagRows);

        if (flagError) throw new Error(flagError.message);
        borrowsEscalated = flagRows.length;
      }
    }

    // --- Archive the library ---
    const { error: archiveError } = await supabase
      .from("libraries")
      .update({ is_archived: true })
      .eq("id", libraryId);

    if (archiveError) throw new Error(archiveError.message);

    return new Response(
      JSON.stringify({
        success: true,
        holds_dropped: holdsDropped,
        borrows_escalated: borrowsEscalated,
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
