import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'crypto'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      id: 'demo-admin', name: 'Administration de démonstration', credentials: {},
      async authorize() {
        // No global administration: this identity only owns its isolated sandbox.
        const user = await prisma.user.create({data:{email:`${randomUUID()}@admin-demo.allopro.invalid`,name:'Administrateur Allo-Pro (démo)',role:'demo_admin'}})
        return {id:user.id,email:user.email,name:user.name}
      },
    }),
    CredentialsProvider({
      id: 'demo-otp',
      name: 'Code de démonstration',
      credentials: { challenge: {}, code: {} },
      async authorize(credentials) {
        if (typeof credentials.challenge !== 'string' || typeof credentials.code !== 'string') return null
        const challenge = await prisma.demoOtp.findUnique({ where: { id: credentials.challenge } })
        if (!challenge || challenge.used || challenge.expiresAt < new Date() || challenge.attempts >= 5) return null
        const attempt = await prisma.demoOtp.updateMany({ where: { id: challenge.id, used: false, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } })
        if (!attempt.count || createHash('sha256').update(challenge.id + credentials.code).digest('hex') !== challenge.codeHash) return null
        const consumed = await prisma.demoOtp.updateMany({ where: { id: challenge.id, used: false }, data: { used: true } })
        if (!consumed.count) return null
        const user = await prisma.user.create({ data: { email: `${randomUUID()}@otp.allopro.invalid`, name: 'Visiteur Allo-Pro', role: 'demo' } })
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user?.password) return null
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!isValid) return null
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user && token?.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
