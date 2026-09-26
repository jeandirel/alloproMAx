// Cycle de vie du litige (Phase 6) : ouverture par le client ou le professionnel, resolution par un
// administrateur. La resolution est le seul point qui decide de l'issue financiere — 'release' fait
// simplement avancer la Booking comme une validation normale (voir lib/marketplace/mission.ts),
// 'refund' cree la demande de remboursement (lib/marketplace/refunds.ts execute ensuite le paiement
// reel aupres de pawaPay). Jamais de remboursement sans decision explicite tracee ici.
import { prisma } from '../prisma'
import { assertBookingTransition, type BookingStatus } from './state-machine'
import type { Dispute } from '@prisma/client'

// Idempotent : si un litige est deja ouvert sur cette Booking, le renvoie plutot que d'en creer un
// second (Dispute.bookingId est @unique) ou de relancer une transition qui leverait sinon.
export async function openDispute(actorId: string, bookingId: string, reason: string): Promise<Dispute> {
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new Error('Un motif est requis pour ouvrir un litige.')
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { professional: { select: { userId: true } } } })
    const isClient = booking.userId === actorId
    const isProfessional = booking.professional.userId === actorId
    if (!isClient && !isProfessional) throw new Error('Cette réservation appartient à un autre compte.')
    const actorRole = isClient ? 'client' as const : 'professionnel' as const
    const existing = await tx.dispute.findUnique({ where: { bookingId } })
    if (existing && existing.status === 'ouvert') return existing
    if (booking.status !== 'litige') assertBookingTransition(booking.status as BookingStatus, 'litige')
    const dispute = existing
      ? await tx.dispute.update({ where: { id: existing.id }, data: { status: 'ouvert', reason: trimmedReason, decision: null, decisionReason: null, resolvedById: null, resolvedAt: null } })
      : await tx.dispute.create({ data: { bookingId, reason: trimmedReason, status: 'ouvert' } })
    if (booking.status !== 'litige') await tx.booking.update({ where: { id: bookingId }, data: { status: 'litige' } })
    const actorExists = await tx.user.findUnique({ where: { id: actorId }, select: { id: true } })
    await tx.disputeEvent.create({
      data: { disputeId: dispute.id, actorId: actorExists ? actorId : null, actorRole, message: trimmedReason },
    })
    await tx.auditLog.create({
      data: { actorId: actorExists ? actorId : null, actorRole, action: 'marketplace.dispute.opened', targetType: 'Booking', targetId: bookingId, metadata: { disputeId: dispute.id } },
    })
    return dispute
  }, { maxWait: 5000, timeout: 10000 })
}

export async function addDisputeMessage(actorId: string, actorRole: 'client' | 'professionnel' | 'administrateur', disputeId: string, message: string) {
  const trimmed = message.trim()
  if (!trimmed) throw new Error('Message vide.')
  const actorExists = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } })
  return prisma.disputeEvent.create({
    data: { disputeId, actorId: actorExists ? actorId : null, actorRole, message: trimmed },
  })
}

// Decision administrative — jamais prise automatiquement. 'release' : le litige n'invalide pas la
// mission, elle reprend son cours normal vers la validation. 'refund' : cree la demande de
// remboursement (statut 'approved', la decision administrative valant deja approbation) — voir
// lib/marketplace/refunds.ts::processApprovedRefund pour l'execution reelle du paiement.
export async function resolveDispute(adminId: string, disputeId: string, decision: 'refund' | 'release', decisionReason: string, refundAmount?: number) {
  const trimmedReason = decisionReason.trim()
  if (!trimmedReason) throw new Error('Un motif de décision est requis.')
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Dispute" WHERE id = ${disputeId} FOR UPDATE`
    const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } })
    if (dispute.status === 'resolu') return { dispute, refund: null }
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: dispute.bookingId } })
    const targetBookingStatus: BookingStatus = decision === 'release' ? 'validee' : 'annulee'
    assertBookingTransition(booking.status as BookingStatus, targetBookingStatus)

    let refund = null
    if (decision === 'refund') {
      const deposit = await tx.paymentAttempt.findFirst({
        where: { bookingId: booking.id, kind: 'deposit', status: 'COMPLETED' },
        orderBy: { attempt: 'desc' },
      })
      if (!deposit) throw new Error('Aucun acompte confirmé à rembourser pour cette réservation.')
      const amount = refundAmount ?? booking.totalPrice
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > deposit.amount) {
        throw new Error('Montant de remboursement invalide.')
      }
      refund = await tx.refund.create({
        data: {
          bookingId: booking.id,
          requestedById: adminId,
          reason: trimmedReason,
          amount,
          status: 'approved',
          decidedById: adminId,
          decidedAt: new Date(),
          decisionReason: trimmedReason,
        },
      })
    }

    await tx.booking.update({ where: { id: booking.id }, data: { status: targetBookingStatus } })
    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: 'resolu', decision, decisionReason: trimmedReason, resolvedById: adminId, resolvedAt: new Date() },
    })
    const actorExists = await tx.user.findUnique({ where: { id: adminId }, select: { id: true } })
    await tx.disputeEvent.create({
      data: { disputeId, actorId: actorExists ? adminId : null, actorRole: 'administrateur', message: trimmedReason },
    })
    await tx.auditLog.create({
      data: {
        actorId: actorExists ? adminId : null,
        actorRole: 'administrateur',
        action: 'marketplace.dispute.resolved',
        targetType: 'Booking',
        targetId: booking.id,
        metadata: { disputeId, decision, refundId: refund?.id ?? null },
      },
    })
    return { dispute: await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } }), refund }
  }, { maxWait: 5000, timeout: 10000 })
}

export async function getDisputeForViewer(viewerUserId: string, disputeId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { booking: { include: { professional: { select: { userId: true } } } }, events: { orderBy: { createdAt: 'asc' } } },
  })
  if (!dispute) return null
  if (dispute.booking.userId !== viewerUserId && dispute.booking.professional.userId !== viewerUserId) return null
  return dispute
}

export async function listOpenDisputesForAdmin() {
  return prisma.dispute.findMany({ where: { status: 'ouvert' }, orderBy: { createdAt: 'asc' }, include: { booking: true } })
}
