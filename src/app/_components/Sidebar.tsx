'use client'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface MenuItem {
    href: string
    label: string
}

export function Sidebar() {
    const pathname = usePathname()
    const { user, signOut } = useAuth()
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                if (!user) {
                    setIsAdmin(false)
                    return
                }
                const { data, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()
                if (error) {
                    setIsAdmin(false)
                    return
                }
                if (!cancelled) setIsAdmin(data?.role === 'system_admin')
            } catch {
                if (!cancelled) setIsAdmin(false)
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
            ...(isAdmin ? [{ href: '/admin/users', label: 'User Management' }] : []),
        ]
        : [
            { href: '/signin', label: 'Sign In' },
            { href: '/register', label: 'Register' },
        ]

    return (
         <aside className="fixed left-0 top-0 z-10 flex h-screen w-64 flex-col border-r bg-gray-50 px-4 py-4">
             <div className="mb-8 flex items-center gap-2">
                 <span className="text-xl font-bold tracking-tight text-slate-900">librarium</span>
             </div>

             <nav className="space-y-1">
                 {menuItems.map(({ href, label }) => (
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
                 ))}
             </nav>

             <div className="mt-auto pt-4 border-t">
                 <p className="text-sm text-gray-500 truncate">
                     Signed in as{' '}
                     <span className={user ? 'font-medium text-slate-900' : 'text-red-500'}>
                         {user?.email || 'Not logged in'}
                     </span>
                 </p>
                 {signOut && (
                     <button onClick={() => signOut()}>Sign Out</button>
                 )}
             </div>
         </aside>
     )
}
