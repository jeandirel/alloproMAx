export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import {
  requireActingProfessional,
  submitOffer,
  reviseOffer,
  withdrawOffer,
  rejectOffer,
  acceptOffer,
  listOffersForServiceRequest,
  listMyOffers,
} from '@/lib/marketplace/offers'

const headers = { 'Cache-Control': 'private, no-store' }
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), serviceRequestId: z.string().min(1).max(100), amount: z.number().int().positive(), message: z.string().max(2000).optional(), expiresAt: z.string().datetime().optional() }),
  z.object({ action: z.literal('revise'), offerId: z.string().min(1).max(100), amount: z.number().int().positive(), message: z.string().max(2000).optional(), expiresAt: z.string().datetime().optional() }),
  z.object({ action: z.literal('withdraw'), offerId: z.string().min(1).max(100) }),
  z.object({ action: z.literal('reject'), offerId: z.string().min(1).max(100) }),
  z.object({ action: z.literal('accept'), offerId: z.string().min(1).max(100) }),
])

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const url = new URL(req.url)
  if (url.searchParams.get('view') === 'mine') {
    const professional = await requireActingProfessional(session.user.id).catch(() => null)
    if (!professional) return NextResponse.json({ error: 'Profil professionnel introuvable pour ce compte.' }, { status: 404, headers })
    return NextResponse.json({ offers: await listMyOffers(professional.id) }, { headers })
  }
  const serviceRequestId = url.searchParams.get('serviceRequestId') || ''
  if (!serviceRequestId) return NextResponse.json({ error: 'serviceRequestId requis.' }, { status: 400, headers })
  try {
    return NextResponse.json({ offers: await listOffersForServiceRequest(session.user.id, serviceRequestId) }, { headers })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action impossible.' }, { status: 403, headers })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  try {
    const origin = req.headers.get('origin')
    if (origin && ![req.headers.get('host'), req.headers.get('x-forwarded-host')].includes(new URL(origin).host)) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers })
    }
    const text = await req.text()
    if (text.length > 4000) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = input.parse(JSON.parse(text))
    if (body.action === 'submit') {
      const professional = await requireActingProfessional(session.user.id)
      const offer = await submitOffer({ professionalId: professional.id, serviceRequestId: body.serviceRequestId, amount: body.amount, message: body.message, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined })
      return NextResponse.json({ offer }, { headers })
    }
    if (body.action === 'revise') {
      const professional = await requireActingProfessional(session.user.id)
      const offer = await reviseOffer(professional.id, body.offerId, { amount: body.amount, message: body.message, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined })
      return NextResponse.json({ offer }, { headers })
    }
    if (body.action === 'withdraw') {
      const professional = await requireActingProfessional(session.user.id)
      const offer = await withdrawOffer(professional.id, body.offerId)
      return NextResponse.json({ offer }, { headers })
    }
    if (body.action === 'reject') {
      const offer = await rejectOffer(session.user.id, body.offerId)
      return NextResponse.json({ offer }, { headers })
    }
    const booking = await acceptOffer(session.user.id, body.offerId)
    return NextResponse.json({ booking }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action sur une offre refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
