import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Data Access Layer (DAL) centralisant TOUTES les vérifications d'autorisation réelles — suit le
// modèle documenté par Next.js lui-même (node_modules/next/dist/docs/01-app/02-guides/authentication.md) :
// proxy.ts ne fait que des vérifications optimistes (présence d'un cookie, pas de base de
// données) ; ici, chaque appel relit l'état réel en base. Ne jamais faire confiance à un rôle ou
// un statut mis en cache dans le JWT/cookie — cette fonction est le SEUL endroit qui doit décider
// "qui est connecté, avec quel statut, quel rôle".
//
// DTO volontairement restreint : jamais le User Prisma complet (pas de hash de mot de passe, etc.).
export interface CurrentUser {
  id: string
  name: string | null
  email: string
  phone: string | null
  image: string | null
  role: string
  accountStatus: string
  pausedAt: Date | null
  deletionRequestedAt: Date | null
  deletionScheduledAt: Date | null
  professionalId: string | null
}

const CURRENT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  accountStatus: true,
  suspended: true,
  pausedAt: true,
  deletionRequestedAt: true,
  deletionScheduledAt: true,
  professional: { select: { id: true } },
} as const

/**
 * Renvoie `null` si non authentifié, si le compte est suspendu/supprimé, ou si la session a été
 * révoquée à distance (voir auth.ts::jwt — le token perd alors son `id`).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: CURRENT_USER_SELECT })
  if (!user) return null
  if (user.suspended || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    image: user.image,
    role: user.role,
    accountStatus: user.accountStatus,
    pausedAt: user.pausedAt,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionScheduledAt: user.deletionScheduledAt,
    professionalId: user.professional?.id ?? null,
  }
}

/** Server Components / pages : redirige vers /login si non authentifié. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/** Server Components / pages réservées aux admins : redirige les autres vers /accueil. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (!['admin', 'demo_admin'].includes(user.role)) redirect('/accueil')
  return user
}

/**
 * Route Handlers / Server Actions : pas de redirection HTTP, une réponse JSON 401 explicite.
 * Usage : `const r = await requireApiUser(); if ('response' in r) return r.response; const { user } = r`
 */
export async function requireApiUser(): Promise<{ user: CurrentUser } | { response: NextResponse }> {
  const user = await getCurrentUser()
  if (!user) return { response: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) }
  return { user }
}

/** Mêmes garanties que requireApiUser, avec en plus la vérification de rôle EN BASE (jamais depuis un cookie). */
export async function requireAdminApi(): Promise<{ user: CurrentUser } | { response: NextResponse }> {
  const result = await requireApiUser()
  if ('response' in result) return result
  if (!['admin', 'demo_admin'].includes(result.user.role)) {
    return { response: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }) }
  }
  return result
}
