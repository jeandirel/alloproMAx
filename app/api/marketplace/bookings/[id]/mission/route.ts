export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireActingProfessional } from '@/lib/marketplace/offers'
import {
  professionalStartsRoute,
  professionalStartsMission,
  professionalSubmitsCompletionProof,
  clientValidatesCompletion,
} from '@/lib/marketplace/mission'

const headers = { 'Cache-Control': 'private, no-store' }
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start_route') }),
  z.object({ action: z.literal('start_mission') }),
  z.object({ action: z.literal('submit_completion') }),
  z.object({ action: z.literal('validate_completion') }),
])

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
    if (text.length > 500) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = input.parse(JSON.parse(text))
    if (body.action === 'validate_completion') {
      const booking = await clientValidatesCompletion(session.user.id, bookingId)
      return NextResponse.json({ booking }, { headers })
    }
    const professional = await requireActingProfessional(session.user.id)
    if (body.action === 'start_route') {
      const booking = await professionalStartsRoute(professional.id, bookingId)
      return NextResponse.json({ booking }, { headers })
    }
    if (body.action === 'start_mission') {
      const booking = await professionalStartsMission(professional.id, bookingId)
      return NextResponse.json({ booking }, { headers })
    }
    const proof = await professionalSubmitsCompletionProof(professional.id, bookingId, session.user.id)
    return NextResponse.json({ completionProof: proof }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action de mission refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
