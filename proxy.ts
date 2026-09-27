import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Vérification OPTIMISTE uniquement (présence d'un cookie, aucun accès base de données) — conforme
// au guide officiel (node_modules/next/dist/docs/01-app/02-guides/authentication.md) : Proxy sert
// de première ligne rapide pour rediriger un visiteur manifestement déconnecté, mais ne fait
// jamais autorité. La vérification réelle (rôle, statut de compte, révocation de session) reste
// entièrement dans app/(app)/layout.tsx (`auth()`) et lib/account-guard.ts pour chaque route/action
// sensible — jamais ici.
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token']

function hasSessionCookie(request: NextRequest): boolean {
  const all = request.cookies.getAll()
  return all.some((c) => SESSION_COOKIE_NAMES.some((name) => c.name === name || c.name.startsWith(`${name}.`)))
}

export function proxy(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/accueil/:path*',
    '/administration/:path*',
    '/espace-pro/:path*',
    '/favoris/:path*',
    '/messages/:path*',
    '/notifications/:path*',
    '/onboarding/:path*',
    '/profil/:path*',
    '/reservations/:path*',
    '/reserver/:path*',
  ],
}
