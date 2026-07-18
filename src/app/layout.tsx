"use client";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import "./globals.css";
import Link from "next/link";

function Sidebar() {
  const { profile, signOut, session } = useAuth();
  
  return (
    <aside className="sidebar-desktop fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r bg-white p-4">
      {/* Brand */}
      <div className="mb-8 flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-slate-900">librarium</span>
      </div>

      {/* Nav Links */}
      <nav className="space-y-1">
        {[
          { href: "/", label: "Dashboard" },
          { href: "/libraries", label: "Libraries" },
          { href: "/patrons", label: "Patrons & Borrowings" },
          { href: "/catalog", label: "Catalog" },
          { href: "/analytics", label: "Analytics" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* User Actions */}
      <div className="mt-auto border-t pt-4">
        <p className="text-sm text-slate-500">Signed in as {profile?.name || "User"}</p>
        <button
          onClick={signOut}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <Sidebar />
          <main className="ml-64 p-6 md:p-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
