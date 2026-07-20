"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * AdminGuard – wraps any admin route.
 * Fetches the caller's profile; if role != 'system_admin', redirect to /.
 * Does NOT require the 'status' column (adds deference to pre-migration state).
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/signin");
      return;
    }

    (async () => {
      try {
        // Only check role — status column may not exist yet (migration pending)
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error || !profile || profile.role !== "system_admin") {
          router.push("/");
          return;
        }
      } catch {
        router.push("/");
        return;
      } finally {
        setChecking(false);
      }
    })();
  }, [user, authLoading, router]);

  if (authLoading || checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
