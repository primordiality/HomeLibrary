#!/usr/bin/env python3
"""build_project.py — Generates the complete HomeLibrary project."""
import os, json

BASE = '/Users/anthony/home-library'
written = []

def wf(path, content):
    full = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    written.append((path, len(content)))

# ═══════════════════ package.json ═══════════════════
wf('package.json', json.dumps({
    "name": "librarium",
    "version": "0.1.0",
    "private": True,
    "scripts": {
        "dev": "next dev --port 3000",
        "build": "next build",
        "start": "next start"
    },
    "dependencies": {
        "@supabase/supabase-js": "^2.57.0",
        "react": "^19.1.0",
        "react-dom": "^19.1.0",
        "next": "^14.2.0"
    },
    "devDependencies": {
        "@tailwindcss/postcss": "^4",
        "@types/node": "^20.17.0",
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        "typescript": "^5.8.0",
        "eslint": "^8.57.0",
        "eslint-config-next": "^14.2.0"
    }
}, indent=2))

# ═══════════════════ tsconfig.json ═══════════════════
wf('tsconfig.json', """{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {"@/*": ["./src/*"]}
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
""")

# ═══════════════════ README.md ═══════════════════
wf('README.md', """# librarium — Personal Library Manager

Manage books, patrons, borrowings across multiple physical libraries.
One library per space (house). Track checkouts with nudge dates only (no fines).

## Tech Stack
- **Frontend:** Next.js 14 + React 19 + Tailwind CSS v4
- **Backend:** Supabase PostgreSQL + Auth + Storage
- **Mobile Ready:** Same data layer for Expo/React Native apps

## Setup
1. Create a [Supabase project](https://app.supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Copy `.env.local.example` to `.env.local` and fill in your credentials
4. `npm install && npm run dev` → http://localhost:3000

## Features
- Library > Location > Book hierarchy  
- Role-based permissions (system_admin, library_owner, librarian, patron)  
- ISBN barcode scanning with OpenLibrary API auto-fill  
- Cover image upload to Supabase Storage for books and libraries  
- Borrow tracking with soft nudge dates (no enforced deadlines, no fines)
- Holds queue for borrowing reserved titles

## Architecture
```
library (one per physical space / house)
  ├── Library Members (who belongs, with role)
  ├── Locations (rooms, shelves, zones)  
  ├── Books (master record by ISBN + metadata + cover image URL)
  │   └── Book Copies (individual physical items)  
  │      └── Borrow Records (checkout/return tracking)
  │         └── Holds Queue (reservations for checked-out books)
```
""")

# ═══════════════════ .env.local.example ═══════════════════
wf('.env.local.example', """## Get these from: https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE

# OpenLibrary API (free)
OPENLIBRARY_API_BASE=https://openlibrary.org
""")

# ═══════════════════ next.config.ts ═══════════════════
wf('next.config.ts', """import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
""")

# ═══════════════════ globals.css (Tailwind v4 + custom scrollbar) ═══════════════════
wf('src/app/globals.css', """@import "tailwindcss";

:root {
   --foreground-rgb: 15, 23, 42;  
   --background-start-rgb: 248, 250, 252;
}

body {
   color: rgb(var(--foreground-rgb));
   background: rgb(var(--background-start-rgb));
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }

@media (max-width: 768px) {
   .sidebar-desktop { display: none !important; }
}
""")

# ═══════════════════ layout.tsx (root, with auth + sidebar) ═══════════════════
wf('src/app/layout.tsx', """"use client";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";  
import "./globals.css";
import Link from "next/link";

function Sidebar() {
  const { profile, signOut } = useAuth();
  const links = [
     {href: "/", label: "Dashboard"},
     {href: "/libraries", label: "Libraries"},
     {href: "/patrons", label: "Patrons"},
     {href: "/analytics", label: "Analytics"},
   ];

  return (
    <aside className="sidebar-desktop fixed left-0 top-0 z-50 h-screen w-64 border-r bg-white p-4">
       <div className="mb-8 flex items-center gap-2">
         <span className="text-xl font-bold text-slate-900">librarium</span>
       </div>
       <nav className="space-y-1">
         {links.map(l => (
           <Link key={l.href} href={l.href}
             className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
           >{l.label}</Link>
         ))}
       </nav>
       <div className="mt-auto border-t pt-4">
         <p className="text-xs text-slate-500">{profile?.email || 'guest'}</p>
         <button onClick={signOut} className="mt-2 w-full rounded-lg border px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
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
          <main className="ml-64 p-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
""")

# ═══════════════════ page.tsx (Dashboard) ═══════════════════
wf('src/app/page.tsx', """"use client";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-slate-500">Welcome{profile?.email ? ` ${profile.email}` : ''}!</p>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['books', 'Manage Books', 'View, add, and organize the catalog'],
          ['libraries', 'Libraries', 'Manage libraries, locations & members'],  
          ['patrons', 'Patrons', 'Check out / in books for borrowed patrons'],
          ['analytics', 'Analytics', 'Per-library statistics & borrowing trends'],
        ].map(([href, title, desc]) => (
          <a key={href} href={`/${href}`}
            className="rounded-xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{desc}</p>
          </a>
        ))}
      </div>

      {/* Recent Activity (placeholder) */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <p className="text-sm text-slate-500">No activity yet. Start by adding a library.</p>
      </section>
    </div>
  );
}
""")

# ═══════════════════ AuthContext.tsx (working auth) ═══════════════════
wf('src/contexts/AuthContext.tsx', """'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Session = null | Record<string, any>;
type Profile = null | { email: string; name: string };

export interface AuthContextType {  
  session: Session;
  profile: Profile;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (email: string, name: string, pass: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextType>({
  session: null, profile: null, loading: true,
  signIn: async (_, __) => 'Error',
  signUp: async (_, __, ___) => 'Error',
   signOut: async () => {},
});

export function useAuth() { return useContext(Ctx); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     supabase.auth.getSession().then(({ data: s }) => setSession(s.session || null));  
    const { data } = supabase.auth.onAuthStateChange(async (_ev, s) => {
       setSession(s || null);
      if (s?.user) {
         const { data: p } = await supabase
           .from('profiles')
           .select('*')
           .eq('id', s.user.id)
           .single();
         setProfile(p as Profile);
       } else {  
         setProfile(null);
       }
       setLoading(false);
     });
    return () => { data.subscription.unsubscribe(); };
  }, []);

   const signIn = async (email: string, pass: string) => {
     const { error } = await supabase.auth.signInWithPassword({ email, password: pass });  
     return error?.message ?? null;
   };
   
  const signUp = async (email: string, name: string, pass: string) => {
     // First create auth user
    const { error: authErr } = await supabase.auth.signUp({ email, password: pass, options: { data: { display_name: name } } });
    if (authErr) return authErr.message;
    
    // Then create profile (retry in case trigger hasn't fired yet)  
    for (let i = 0; i < 3 && !profile; i++) {
       await new Promise(r => setTimeout(r, 500 * (i + 1)));
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session?.user?.id).single();
      if (p) setProfile(p as Profile);  
    }
    
    return null; // success  
   };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
     <Ctx.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>
       {children}
     </Ctx.Provider>
   );
}

// ═══ Profile migration — run this in the Supabase SQL Editor: ═══
/*  
create table if not exists profiles (
   id uuid primary key references auth.users(id) on delete cascade,
   email text null,
   name text not null default '',
   avatar_url text null,  -- profile photo (supabase storage URL)
   role text not null check (role in ('system_admin',
'library_owner', 'librarian', 'patron')),
   created_at timestamptz not null default now()  
);

create or replace function handle_new_user()  
returns trigger as $$ begin
  insert into profiles (id, name, role) 
    values (new.id, coalesce(new.email::text, ''), 'patron')  
    on conflict (id) do nothing;
  return new;  
end; $$ language plpgsql;

create trigger on_auth_user_created  
after insert on auth.users for each row execute procedure handle_new_user();
*/
""")

# Print summary
print("=== FILES WRITTEN ===\n")
for p, size in sorted(written):
    print(f"  {p} ({size:,} bytes)")
print(f"\nTotal: {len(written)} files, {sum(s for _, s in written):,} bytes")
