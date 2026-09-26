export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { requireApiUser } from '@/lib/account-guard'

/** Liste des appareils connectés de l'utilisateur courant ("Sécurité → Appareils connectés"). */
export async function GET() {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  const session = await auth()
  const rows = await prisma.session.findMany({
    where: { userId: result.user.id },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expires: true },
  })
  return NextResponse.json({
    sessions: rows.map((r) => ({ ...r, current: r.id === session?.sessionId })),
  })
}

/** "Déconnecter tous les autres appareils" — garde toujours la session en cours active. */
export async function DELETE() {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  const session = await auth()
  await prisma.session.deleteMany({
    where: { userId: result.user.id, ...(session?.sessionId ? { id: { not: session.sessionId } } : {}) },
  })
  return NextResponse.json({ ok: true })
}
