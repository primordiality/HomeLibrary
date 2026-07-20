'use client'

import { usePathname } from 'next/navigation'

export default function AuthLayout({ children, sidebar }: { children: React.ReactNode; sidebar: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/signin' || pathname === '/register' || pathname.startsWith('/register/')

  return (
    <>
      {!isAuthPage && sidebar}
      <main className={isAuthPage ? 'flex items-center justify-center min-h-screen' : 'ml-64 p-6'}>
        {children}
      </main>
    </>
  )
}
