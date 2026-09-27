import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    // Optionnel : une session dont la ligne Session (base) a été révoquée (déconnexion à
    // distance) ou a expiré perd son `user` dans le callback `session` de auth.ts — voir
    // lib/account-guard.ts pour la vérification côté serveur qui s'appuie là-dessus.
    user?: {
      id: string
    } & DefaultSession['user']
    sessionId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    sessionId?: string
  }
}
