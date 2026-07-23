import { Suspense } from "react";
import AdminGuard from "./_components/AdminGuard";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-slate-500 text-sm">Loading…</div>
        </div>
      }>
        <div className="min-h-screen bg-slate-50">
          <nav className="border-b border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-6 py-3 text-sm">
                <Link href="/admin" className="font-semibold text-slate-700 hover:text-slate-900">
                  Dashboard
                </Link>
                <Link href="/admin/users" className="text-slate-500 hover:text-slate-700">
                  Users
                </Link>
                <Link href="/admin/escalations" className="text-slate-500 hover:text-slate-700">
                  Escalations
                </Link>
                <Link href="/admin/settings" className="text-slate-500 hover:text-slate-700">
                  Settings
                </Link>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </Suspense>
    </AdminGuard>
  );
}
