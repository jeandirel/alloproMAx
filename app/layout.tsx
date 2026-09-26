import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import { PwaSupport } from '@/components/pwa-support'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { AuthProvider } from '@/components/auth-provider'
import { I18nProvider } from '@/lib/i18n/context'
import { CookieConsent } from '@/components/cookie-consent'

export const dynamic = 'force-dynamic'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const, themeColor: '#0B6E4F' }

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Allo Pro — Trouvez un professionnel près de chez vous au Gabon',
  description: 'Plomberie, électricité, ménage, coiffure, mécanique, informatique et bien plus. Trouvez un professionnel près de chez vous, partout au Gabon.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Allo Pro — Trouvez un professionnel près de chez vous au Gabon',
    description: 'Plateforme de mise en relation avec des professionnels locaux au Gabon.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <Script src="https://apps.abacus.ai/chatllm/appllm-lib.js" strategy="afterInteractive" />
      </head>
      <body className={`${inter.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans bg-background text-foreground`}>
        <a href="#contenu-principal" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-emerald-dark focus:px-4 focus:py-2 focus:text-white">
          Aller au contenu principal
        </a>
        <AuthProvider>
          <I18nProvider locale="fr">
            {/* Cible du lien d'évitement : un simple div, pas un <main> — presque toutes les
                routes définissent déjà leur propre <main> (app-shell, pages client, etc.),
                et l'imbriquer ici produirait un <main> dans un <main> (HTML invalide). */}
            <div id="contenu-principal">{children}</div>
            <CookieConsent />
            <Toaster />
            <ChunkLoadErrorHandler />
            <PwaSupport />
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
