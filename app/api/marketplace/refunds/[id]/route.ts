export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/account-guard'
import { processApprovedRefund, refreshRefundAttempt, publicRefund } from '@/lib/marketplace/refunds'

const headers = { 'Cache-Control': 'private, no-store' }

// Relance/verifie l'execution reelle d'un remboursement deja approuve (ex. premiere tentative
// UNKNOWN/FAILED aupres de pawaPay) — reserve aux administrateurs, aucune action client requise.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const { id } = await params
  try {
    const { attempt } = await processApprovedRefund(id)
    if (attempt) await refreshRefundAttempt(attempt, true)
    const refund = await prisma.refund.findUniqueOrThrow({ where: { id } })
    return NextResponse.json({ refund: publicRefund(refund) }, { headers })
  } catch (e) {
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Relance de remboursement refusée', { category: database ? 'database' : 'business' })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
