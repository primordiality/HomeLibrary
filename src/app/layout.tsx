import dynamic from 'next/dynamic'

const Sidebar = dynamic(
   () => import('@/app/_components/Sidebar').then(m => m.Sidebar),
   { ssr: false }
)

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Sidebar />
                <main className="ml-64 p-6">{children}</main>
            </body>
        </html>
    )
}

export async function generateMetadata() {
    return { title: 'Librarium' }
}
