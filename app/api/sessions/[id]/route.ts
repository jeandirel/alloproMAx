export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireApiUser } from '@/lib/account-guard'

/** Révoque un appareil précis — la clause `userId` empêche de révoquer la session d'un autre compte. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  const { id } = await params
  const deleted = await prisma.session.deleteMany({ where: { id, userId: result.user.id } })
  if (!deleted.count) return NextResponse.json({ error: 'Session introuvable.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
