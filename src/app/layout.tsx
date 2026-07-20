import dynamic from 'next/dynamic'
import { AuthProvider } from '@/contexts/AuthContext'
import AuthLayout from '@/app/_components/AuthLayout'
import './globals.css'

const Sidebar = dynamic(
    () => import('@/app/_components/Sidebar').then(m => m.Sidebar),
    { ssr: false }
)

export default function RootLayout({ children }: { children: React.ReactNode }) {
    const Sidebar = dynamic(
        () => import('@/app/_components/Sidebar').then(m => m.Sidebar),
        { ssr: false }
    )

    return (
         <html lang="en">
             <body>
                 <AuthProvider>
                     <AuthLayout sidebar={<Sidebar />}>
                         {children}
                     </AuthLayout>
                 </AuthProvider>
             </body>
         </html>
    )
}

export async function generateMetadata() {
    return { title: 'Librarium' }
}
