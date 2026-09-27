export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireActingProfessional } from '@/lib/marketplace/offers'
import { requestPayout, refreshPayoutAttempt, publicPayout } from '@/lib/marketplace/payouts'
import { publicPaymentAttempt } from '@/lib/marketplace/booking-payment'

const headers = { 'Cache-Control': 'private, no-store' }
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('initiate'), method: z.enum(['airtel', 'moov']), phone: z.string().min(1).max(30) }),
  z.object({ action: z.literal('refresh'), paymentAttemptId: z.string().uuid() }),
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
    if (text.length > 4000) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = input.parse(JSON.parse(text))
    const professional = await requireActingProfessional(session.user.id)
    if (body.action === 'initiate') {
      const { payout, attempt } = await requestPayout({ professionalId: professional.id, bookingId, method: body.method, phone: body.phone })
      if (!attempt) return NextResponse.json({ payout: publicPayout(payout) }, { headers })
      const result = await refreshPayoutAttempt(attempt, true)
      return NextResponse.json({ payout: publicPayout(payout), attempt: publicPaymentAttempt(result.attempt), message: result.message }, { headers })
    }
    const attempt = await prisma.paymentAttempt.findFirst({ where: { id: body.paymentAttemptId, userId: session.user.id, kind: 'payout', bookingId } })
    if (!attempt) return NextResponse.json({ error: 'Tentative de versement introuvable.' }, { status: 404, headers })
    const result = await refreshPayoutAttempt(attempt)
    return NextResponse.json({ attempt: publicPaymentAttempt(result.attempt), message: result.message }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action de versement refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
