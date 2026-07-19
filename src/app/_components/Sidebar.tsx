'use client'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'

export function Sidebar() {
    const pathname = usePathname()
    const { user, signOut } = useAuth()

    return (
        <aside className="fixed left-0 top-0 z-10 flex h-screen w-64 flex-col border-r bg-gray-50 px-4 py-4">
            <div className="mb-8 flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-900">librarium</span>
            </div>

            <nav className="space-y-1">
                {
                    [
                        { href: '/', label: 'Dashboard' },
                        { href: '/libraries', label: 'Libraries' },
                        { href: '/patrons', label: 'Patrons' },
                        { href: '/borrowings', label: 'Borrowings' },
                    ].map(({ href, label }) => (
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
