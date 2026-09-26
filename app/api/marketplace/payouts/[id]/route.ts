export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/account-guard'
import { refreshPayoutAttempt, publicPayout } from '@/lib/marketplace/payouts'

const headers = { 'Cache-Control': 'private, no-store' }

// Reverifie aupres de pawaPay la derniere tentative d'un versement (ex. statut UNKNOWN apres une
// panne reseau) — reserve aux administrateurs. Ne cree jamais de nouvelle tentative : si la derniere
// est definitivement FAILED/REJECTED, seul le professionnel peut en soumettre une nouvelle (avec son
// numero Mobile Money) via POST /api/marketplace/bookings/:id/payout.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const { id } = await params
  try {
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id } })
    const attempt = payout.bookingId
      ? await prisma.paymentAttempt.findFirst({ where: { bookingId: payout.bookingId, kind: 'payout' }, orderBy: { attempt: 'desc' } })
      : null
    if (attempt) await refreshPayoutAttempt(attempt, true)
    const refreshed = await prisma.payout.findUniqueOrThrow({ where: { id } })
    return NextResponse.json({ payout: publicPayout(refreshed) }, { headers })
  } catch (e) {
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Relance de versement refusée', { category: database ? 'database' : 'business' })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
