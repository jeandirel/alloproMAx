export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { openDispute, addDisputeMessage, getDisputeForViewer } from '@/lib/marketplace/disputes'
import { prisma } from '@/lib/prisma'

const headers = { 'Cache-Control': 'private, no-store' }
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), reason: z.string().min(1).max(4000) }),
  z.object({ action: z.literal('message'), message: z.string().min(1).max(4000) }),
])

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const { id: bookingId } = await params
  const dispute = await prisma.dispute.findUnique({ where: { bookingId }, select: { id: true } })
  if (!dispute) return NextResponse.json({ dispute: null }, { headers })
  const detail = await getDisputeForViewer(session.user.id, dispute.id)
  if (!detail) return NextResponse.json({ error: 'Litige introuvable.' }, { status: 404, headers })
  return NextResponse.json({ dispute: detail }, { headers })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const { id: bookingId } = await params
  try {
    const origin = req.headers.get('origin')
    if (origin && ![req.headers.get('host'), req.headers.get('x-forwarded-host')].includes(new URL(origin).host)) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers })
    }
    const text = await req.text()
    if (text.length > 4000) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = input.parse(JSON.parse(text))
    if (body.action === 'open') {
      const dispute = await openDispute(session.user.id, bookingId, body.reason)
      return NextResponse.json({ dispute }, { headers })
    }
    const dispute = await prisma.dispute.findUnique({ where: { bookingId } })
    if (!dispute) return NextResponse.json({ error: 'Aucun litige ouvert sur cette réservation.' }, { status: 404, headers })
    const viewable = await getDisputeForViewer(session.user.id, dispute.id)
    if (!viewable) return NextResponse.json({ error: 'Litige introuvable.' }, { status: 404, headers })
    const actorRole = viewable.booking.userId === session.user.id ? 'client' : 'professionnel'
    const event = await addDisputeMessage(session.user.id, actorRole, dispute.id, body.message)
    return NextResponse.json({ event }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action sur un litige refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
