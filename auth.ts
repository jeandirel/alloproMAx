import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { isDemoAuthEnabled } from '@/lib/demo-mode'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Google n'est proposé (dans les pages login/signup) et enregistré comme provider que si des
// identifiants réels sont configurés — jamais enregistré "à vide" : avec `session.strategy: 'jwt'`
// (voir plus bas) il n'y a aucune contrainte de configuration qui l'exigerait, contrairement à ce
// qu'aurait imposé une stratégie 'database'.
export function isGoogleAuthEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 jours — aligné sur le défaut NextAuth.
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

async function captureRequestMeta(): Promise<{ userAgent: string | null; ipAddress: string | null }> {
  // Ni le callback `signIn`, ni `jwt` ne reçoivent la requête brute (vérifié dans les types
  // @auth/core) : on s'appuie sur le contexte de requête (AsyncLocalStorage) que Next.js propage
  // à travers toute la chaîne asynchrone, le handler NextAuth étant un Route Handler Node normal.
  try {
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')
    return {
      userAgent: h.get('user-agent') || null,
      ipAddress: (forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip')) || null,
    }
  } catch {
    return { userAgent: null, ipAddress: null }
  }
}

function sanitizeSignupRole(value: unknown): string {
  return value === 'professional' ? 'professional' : 'user'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  // IMPORTANT : reste 'jwt', volontairement — @auth/core ne fait jamais passer un provider de
  // type 'credentials' par le chemin "session base de données" de l'adapter, quelle que soit la
  // stratégie configurée (vérifié dans lib/actions/callback/index.js). Comme le téléphone (et
  // l'email/mot de passe existant) sont tous les deux des Credentials providers, une stratégie
  // 'database' les laisserait sans aucune session révocable. À la place, les sessions révocables
  // ("Sécurité → Appareils connectés") sont gérées manuellement ci-dessous dans le callback `jwt`,
  // en réutilisant le modèle Session existant comme simple table — de façon uniforme pour TOUS
  // les providers (Google inclus : avec la stratégie 'jwt', l'adapter ne touche jamais non plus à
  // Session, seulement à User/Account).
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      id: 'demo-admin', name: 'Administration de démonstration', credentials: {},
      async authorize(_credentials, request) {
        if (!isDemoAuthEnabled()) return null
        const ip = getClientIp(request)
        if (!checkRateLimit(`demo-admin:${ip}`, 5, 15 * 60000).allowed) return null
        if (!checkRateLimit('global:demo-admin', 50, 15 * 60000).allowed) return null
        // No global administration: this identity only owns its isolated sandbox.
        const user = await prisma.user.create({data:{email:`${randomUUID()}@admin-demo.allopro.invalid`,name:'Administrateur Allo Pro (démo)',role:'demo_admin'}})
        return {id:user.id,email:user.email,name:user.name}
      },
    }),
    CredentialsProvider({
      id: 'demo-otp',
      name: 'Code de démonstration',
      credentials: { challenge: {}, code: {} },
      async authorize(credentials, request) {
        if (!isDemoAuthEnabled()) return null
        const ip = getClientIp(request)
        if (!checkRateLimit(`demo-otp:${ip}`, 20, 15 * 60000).allowed) return null
        if (!checkRateLimit('global:demo-otp', 200, 15 * 60000).allowed) return null
        if (typeof credentials.challenge !== 'string' || typeof credentials.code !== 'string') return null
        const challenge = await prisma.demoOtp.findUnique({ where: { id: credentials.challenge } })
        if (!challenge || challenge.used || challenge.expiresAt < new Date() || challenge.attempts >= 5) return null
        const attempt = await prisma.demoOtp.updateMany({ where: { id: challenge.id, used: false, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } })
        if (!attempt.count || createHash('sha256').update(challenge.id + credentials.code).digest('hex') !== challenge.codeHash) return null
        const consumed = await prisma.demoOtp.updateMany({ where: { id: challenge.id, used: false }, data: { used: true } })
        if (!consumed.count) return null
        const user = await prisma.user.create({ data: { email: `${randomUUID()}@otp.allopro.invalid`, name: 'Visiteur Allo Pro', role: 'demo' } })
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null
        const ip = getClientIp(request)
        const email = (credentials.email as string).toLowerCase()
        if (!checkRateLimit(`login-ip:${ip}`, 20, 15 * 60000).allowed) return null
        if (!checkRateLimit(`login-email:${email}`, 8, 15 * 60000).allowed) return null
        if (!checkRateLimit('global:login', 500, 15 * 60000).allowed) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user?.password) return null
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!isValid) return null
        if (user.suspended || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') return null
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
    // Authentification téléphone réelle : find-or-create d'un vrai User (distinct de 'demo-otp'
    // qui crée un compte jetable à chaque essai, sans jamais envoyer de SMS). Le code est émis via
    // app/login/actions.ts::requestPhoneOtp (lib/sms.ts) et vérifié ici contre PhoneOtp.
    CredentialsProvider({
      id: 'phone',
      name: 'Téléphone',
      credentials: { challenge: {}, code: {}, role: {} },
      async authorize(credentials, request) {
        const ip = getClientIp(request)
        if (!checkRateLimit(`phone-otp-verify:${ip}`, 20, 15 * 60000).allowed) return null
        if (!checkRateLimit('global:phone-otp-verify', 300, 15 * 60000).allowed) return null
        if (typeof credentials?.challenge !== 'string' || typeof credentials?.code !== 'string') return null
        const otp = await prisma.phoneOtp.findUnique({ where: { id: credentials.challenge } })
        if (!otp || otp.used || otp.expiresAt < new Date() || otp.attempts >= 5) return null
        const attempt = await prisma.phoneOtp.updateMany({ where: { id: otp.id, used: false, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } })
        if (!attempt.count || createHash('sha256').update(otp.id + credentials.code).digest('hex') !== otp.codeHash) return null
        const consumed = await prisma.phoneOtp.updateMany({ where: { id: otp.id, used: false }, data: { used: true } })
        if (!consumed.count) return null

        let user = await prisma.user.findUnique({ where: { phone: otp.phone } })
        if (!user) {
          user = await prisma.user.create({
            data: {
              phone: otp.phone,
              email: `${otp.phone}@phone.allopro.invalid`,
              name: 'Nouvel utilisateur',
              role: sanitizeSignupRole(credentials.role),
              authProvider: 'phone',
              phoneVerifiedAt: new Date(),
            },
          })
        } else {
          if (user.suspended || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') return null
          if (!user.phoneVerifiedAt) {
            user = await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } })
          }
        }
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
    ...(isGoogleAuthEnabled()
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    // Choke-point unique de sécurité, appelé par NextAuth pour TOUS les providers (y compris
    // Credentials, après un authorize() réussi) : un compte suspendu par un administrateur ou
    // définitivement supprimé ne doit jamais obtenir de session, quel que soit le chemin
    // d'authentification emprunté. `paused` et `deletion_requested` restent autorisés à se
    // reconnecter (l'utilisateur doit pouvoir revenir annuler sa pause/suppression).
    async signIn({ user }) {
      if (!user?.id) return false
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { accountStatus: true, suspended: true } })
      if (!dbUser) return false
      if (dbUser.suspended || dbUser.accountStatus === 'suspended' || dbUser.accountStatus === 'deleted') return false
      return true
    },
    async jwt({ token, user }) {
      const meta = await captureRequestMeta()
      if (user?.id) {
        // Connexion fraîche (tout provider confondu) : ouvre une nouvelle ligne Session
        // révocable en base — c'est cette ligne, pas le JWT lui-même, qui fait autorité pour
        // "Sécurité → Appareils connectés".
        const created = await prisma.session.create({
          data: {
            sessionToken: randomUUID(),
            userId: user.id,
            expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
            userAgent: meta.userAgent,
            ipAddress: meta.ipAddress,
          },
        })
        token.id = user.id
        token.sessionId = created.id
        return token
      }
      if (typeof token.sessionId === 'string') {
        const existing = await prisma.session.findUnique({ where: { id: token.sessionId } })
        if (!existing || existing.expires < new Date()) {
          // Session révoquée (déconnexion à distance) ou expirée : le token perd son identité,
          // ce que le callback `session` ci-dessous traduit en session non authentifiée.
          delete (token as Record<string, unknown>).id
          delete (token as Record<string, unknown>).sessionId
          return token
        }
        if (Date.now() - existing.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
          await prisma.session.update({
            where: { id: existing.id },
            data: { ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}) },
          }).catch(() => {})
        }
      }
      return token
    },
    async session({ session, token }) {
      if (!token?.id || !token?.sessionId) {
        return { ...session, user: undefined }
      }
      session.user.id = token.id as string
      // Id opaque de la ligne Session interne (jamais le sessionToken lui-même) — permet à
      // app/api/sessions de savoir laquelle est "l'appareil actuel" sans jamais déconnecter
      // l'utilisateur de sa propre session en cours via "Déconnecter tous les autres appareils".
      session.sessionId = token.sessionId as string
      return session
    },
  },
  events: {
    // Ne se déclenche que pour les comptes créés par l'adapter (Google) : les providers
    // Credentials (téléphone, mot de passe, démo) créent déjà leur User eux-mêmes dans authorize().
    async createUser({ user }) {
      if (!user.id) return
      await prisma.user.update({ where: { id: user.id }, data: { authProvider: 'google' } }).catch(() => {})
    },
    async signIn({ user }) {
      if (!user?.id) return
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
    },
  },
})
