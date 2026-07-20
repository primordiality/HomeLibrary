import { Suspense } from "react";
import AdminGuard from "./_components/AdminGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-slate-500 text-sm">Loading…</div>
        </div>
      }>
        {children}
      </Suspense>
    </AdminGuard>
  );
}
