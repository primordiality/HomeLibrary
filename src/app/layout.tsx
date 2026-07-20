import dynamic from 'next/dynamic'
import { AuthProvider } from '@/contexts/AuthContext'
import './globals.css'

const Sidebar = dynamic(
    () => import('@/app/_components/Sidebar').then(m => m.Sidebar),
    { ssr: false }
)

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
         <html lang="en">
             <body>
                 <AuthProvider>
                     <Sidebar />
                     <main className="ml-64 p-6">{children}</main>
                 </AuthProvider>
             </body>
         </html>
     )
}

export async function generateMetadata() {
    return { title: 'Librarium' }
}
