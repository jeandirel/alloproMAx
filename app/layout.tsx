import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import { PwaSupport } from '@/components/pwa-support'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { AuthProvider } from '@/components/auth-provider'

export const dynamic = 'force-dynamic'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const, themeColor: '#0B6E4F' }

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Allo-Pro — Le bon professionnel, au bon moment',
  description: 'Trouvez des professionnels vérifiés pour vos services à domicile à Libreville, Gabon. Plomberie, électricité, ménage et plus.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Allo-Pro — Le bon professionnel, au bon moment',
    description: 'Marketplace de services à domicile au Gabon',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
      </head>
      <body className={`${inter.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans bg-background text-foreground`}>
        <AuthProvider>
          {children}
          <Toaster />
          <ChunkLoadErrorHandler />
          <PwaSupport />
        </AuthProvider>
      </body>
    </html>
  )
}
