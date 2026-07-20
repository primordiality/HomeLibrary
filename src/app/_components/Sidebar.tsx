'use client'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface MenuItem {
    href: string
    label: string
}

export function Sidebar() {
    const pathname = usePathname()
    const { user, loading: authLoading, signOut } = useAuth()
    const [isAdmin, setIsAdmin] = useState(false)
    const [registrationEnabled, setRegistrationEnabled] = useState(false)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                if (!user) {
                    setIsAdmin(false)
                    setRegistrationEnabled(false)
                    return
                }

                // Check if user is system_admin
                const { data: profile, error: profileErr } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()

                if (!profileErr && profile?.role === 'system_admin') {
                    setIsAdmin(true)
                } else {
                    setIsAdmin(false)
                }

                // Check if any library has public registration enabled
                const { data: settings, error: settingsErr } = await supabase
                    .from('library_settings')
                    .select('library_id, allow_public_registration')
                    .eq('allow_public_registration', true)
                    .limit(1)

                if (!settingsErr && settings && settings.length > 0) {
                    setRegistrationEnabled(true)
                } else {
                    setRegistrationEnabled(false)
                }
            } catch {
                if (!cancelled) {
                    setIsAdmin(false)
                    setRegistrationEnabled(false)
                }
            }
        })()
        return () => { cancelled = true }
    }, [user])

    const menuItems: MenuItem[] = user
        ? [
            { href: '/', label: 'Dashboard' },
            { href: '/catalog', label: 'Catalog' },
            { href: '/libraries', label: 'Libraries' },
            { href: '/patrons', label: 'Patrons' },
            { href: '/borrowings', label: 'Borrowings' },
            { href: '/analytics', label: 'Analytics' },
            ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
        ]
        : [
            { href: '/signin', label: 'Sign In' },
            ...(registrationEnabled ? [{ href: '/register', label: 'Register' }] : []),
        ]

    return (
         <aside className="fixed left-0 top-0 z-10 flex h-screen w-64 flex-col border-r bg-gray-50 px-4 py-4">
             <div className="mb-8 flex items-center gap-2">
                 <span className="text-xl font-bold tracking-tight text-slate-900">librarium</span>
             </div>

             <nav className="space-y-1">
                 {authLoading ? (
                     <div className="text-sm text-slate-400">Loading…</div>
                 ) : (
                     menuItems.map(({ href, label }) => (
                        <Link
                           key={href}
                           href={href}
                           className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                               pathname === href
                                    ? 'bg-gray-200 text-slate-900'
                                    : 'text-slate-600 hover:bg-gray-100 hover:text-slate-900'
                           }`}
                        >
                            {label}
                        </Link>
                     ))
                 )}
             </nav>

             <div className="mt-auto pt-4 border-t">
                 {authLoading ? (
                     <div className="text-sm text-slate-400">Loading…</div>
                 ) : (
                     <>
                         <p className="text-sm text-gray-500 truncate">
                             {user ? 'Signed in as' : 'Not logged in'}
                             {user && (
                                 <>
                                     {' '}
                                     <span className="font-medium text-slate-900">
                                         {user.email}
                                     </span>
                                 </>
                             )}
                         </p>
                         {user && (
                             <button onClick={() => signOut()}>Sign Out</button>
                         )}
                     </>
                 )}
             </div>
         </aside>
     )
}
