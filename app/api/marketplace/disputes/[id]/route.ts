export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/account-guard'
import { resolveDispute, addDisputeMessage, getDisputeForViewer } from '@/lib/marketplace/disputes'
import { processApprovedRefund, refreshRefundAttempt, publicRefund } from '@/lib/marketplace/refunds'

const headers = { 'Cache-Control': 'private, no-store' }
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve'), decision: z.enum(['refund', 'release']), decisionReason: z.string().min(1).max(4000), refundAmount: z.number().int().positive().optional() }),
  z.object({ action: z.literal('message'), message: z.string().min(1).max(4000) }),
])

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const { id } = await params
  const dispute = await getDisputeForViewer(session.user.id, id)
  if (dispute) return NextResponse.json({ dispute }, { headers })
  const admin = await requireAdminApi()
  if ('response' in admin) return NextResponse.json({ error: 'Litige introuvable.' }, { status: 404, headers })
  const full = await prisma.dispute.findUnique({ where: { id }, include: { booking: true, events: { orderBy: { createdAt: 'asc' } } } })
  if (!full) return NextResponse.json({ error: 'Litige introuvable.' }, { status: 404, headers })
  return NextResponse.json({ dispute: full }, { headers })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const origin = req.headers.get('origin')
    if (origin && ![req.headers.get('host'), req.headers.get('x-forwarded-host')].includes(new URL(origin).host)) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers })
    }
    const text = await req.text()
    if (text.length > 4000) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = input.parse(JSON.parse(text))

    if (body.action === 'resolve') {
      const admin = await requireAdminApi()
      if ('response' in admin) return admin.response
      const { dispute, refund } = await resolveDispute(admin.user.id, id, body.decision, body.decisionReason, body.refundAmount)
      if (!refund) return NextResponse.json({ dispute, refund: null }, { headers })
      // Declenchement immediat du paiement reel du remboursement — systeme, pas d'action client
      // requise (le remboursement retourne au meme compte Mobile Money que l'acompte d'origine).
      // Une erreur ici (pawaPay indisponible) ne doit pas faire echouer la resolution du litige,
      // deja actee : le remboursement reste 'approved'/'processing' et pourra etre relance.
      try {
        const { attempt } = await processApprovedRefund(refund.id)
        if (attempt) await refreshRefundAttempt(attempt, true)
      } catch {
        console.error('Déclenchement immédiat du remboursement impossible, à relancer manuellement', { refundId: refund.id })
      }
      const refreshed = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })
      return NextResponse.json({ dispute, refund: publicRefund(refreshed) }, { headers })
    }

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
    const viewable = await getDisputeForViewer(session.user.id, id)
    if (!viewable) {
      const admin = await requireAdminApi()
      if ('response' in admin) return admin.response
    }
    const actorRole = viewable ? (viewable.booking.userId === session.user.id ? 'client' : 'professionnel') : 'administrateur'
    const event = await addDisputeMessage(session.user.id, actorRole, id, body.message)
    return NextResponse.json({ event }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action sur un litige refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
