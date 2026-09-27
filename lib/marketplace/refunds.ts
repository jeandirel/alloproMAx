// Execution reelle d'un remboursement approuve (Refund.status='approved', voir
// lib/marketplace/disputes.ts::resolveDispute) aupres de pawaPay. Miroir de
// lib/marketplace/booking-payment.ts/contact-unlock.ts, adapte au kind='refund' : le remboursement
// est renvoye au meme compte Mobile Money (telephone + operateur) que l'acompte d'origine, jamais a
// un compte fourni a posteriori — voir PaymentAttempt.depositId qui fige l'encaissement source.
import { randomUUID } from 'node:crypto'
import { Prisma, type PaymentAttempt, type Refund } from '@prisma/client'
import { prisma } from '../prisma'
import { isRefundsEnabled } from './flags'
import { assertRefundTransition, type RefundStatus } from './state-machine'
import {
  pawaPayEnvironment,
  fetchPawaPayActiveConfig,
  extractOptions,
  initiatePawaPayTransaction,
  checkPawaPayStatus,
  ProviderError,
  type PawaPayTransactionLike,
} from '../pawapay'
import { isFinal, type PaymentKind, type TransactionStatus } from '../payment-types'

const MAX_ATTEMPTS = 10
const RECHECK_THROTTLE_MS = 20000

function toPawaPayTransactionLike(attempt: PaymentAttempt): PawaPayTransactionLike {
  return {
    id: attempt.id,
    kind: attempt.kind as PaymentKind,
    amount: attempt.amount,
    currency: attempt.currency,
    clientReferenceId: attempt.bookingId ?? attempt.id,
    phoneNumber: attempt.phoneNumber,
    provider: attempt.provider,
    depositId: attempt.depositId,
  }
}

// Cree (ou reutilise) la tentative de paiement pawaPay pour un Refund deja approuve — jamais appele
// tant que la decision (dispute ou admin) n'a pas explicitement approuve le remboursement.
export async function processApprovedRefund(refundId: string): Promise<{ refund: Refund; attempt: PaymentAttempt | null }> {
  if (!isRefundsEnabled()) throw new Error('Les remboursements sont temporairement indisponibles.')
  const environment = pawaPayEnvironment()
  if (environment === 'mock') throw new Error('Remboursement temporairement indisponible : configuration pawaPay manquante.')
  const refundPreview = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })
  const depositPreview = await prisma.paymentAttempt.findFirst({
    where: { bookingId: refundPreview.bookingId, kind: 'deposit', status: 'COMPLETED' },
    orderBy: { attempt: 'desc' },
  })
  if (!depositPreview) throw new Error('Aucun acompte confirmé à rembourser pour cette réservation.')
  // Tout l'appel reseau se fait hors transaction, comme prepareContactUnlockPayment.
  const options = extractOptions(await fetchPawaPayActiveConfig(environment), 'refund')
  const option = options.find((o) => o.provider === depositPreview.provider)
  if (!option) throw new Error('Cet opérateur n’accepte pas les remboursements dans votre configuration pawaPay.')

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
    if (refund.status === 'completed') return { refund, attempt: null }
    if (refund.status !== 'approved' && refund.status !== 'processing' && refund.status !== 'failed') {
      throw new Error('Ce remboursement n’a pas encore été approuvé.')
    }
    const previous = await tx.paymentAttempt.findFirst({
      where: { bookingId: refund.bookingId, kind: 'refund' },
      orderBy: { attempt: 'desc' },
    })
    if (previous && !isFinal(previous.status)) return { refund, attempt: previous }
    if ((previous?.attempt || 0) >= MAX_ATTEMPTS) throw new Error('Limite de tentatives atteinte pour ce remboursement.')

    const deposit = await tx.paymentAttempt.findFirst({
      where: { bookingId: refund.bookingId, kind: 'deposit', status: 'COMPLETED' },
      orderBy: { attempt: 'desc' },
    })
    if (!deposit) throw new Error('Aucun acompte confirmé à rembourser pour cette réservation.')
    if (refund.amount > deposit.amount) throw new Error('Le remboursement dépasse le montant encaissé.')
    if (deposit.provider !== option.provider) throw new Error('Cet opérateur n’accepte pas les remboursements dans votre configuration pawaPay.')

    if (refund.status === 'approved') assertRefundTransition('approved', 'processing')
    else if (refund.status === 'failed') assertRefundTransition('failed', 'processing')

    const attempt = await tx.paymentAttempt.create({
      data: {
        id: randomUUID(),
        userId: deposit.userId,
        bookingId: refund.bookingId,
        kind: 'refund',
        attempt: (previous?.attempt || 0) + 1,
        mode: environment,
        status: 'CREATED',
        amount: refund.amount,
        currency: deposit.currency,
        provider: deposit.provider,
        phoneNumber: deposit.phoneNumber,
        depositId: deposit.id,
      },
    })
    await tx.refund.update({ where: { id: refundId }, data: { status: 'processing' } })
    const actorExists = await tx.user.findUnique({ where: { id: deposit.userId }, select: { id: true } })
    await tx.auditLog.create({
      data: {
        actorId: actorExists ? deposit.userId : null,
        actorRole: 'system',
        action: 'payment_attempt.created',
        targetType: 'PaymentAttempt',
        targetId: attempt.id,
        metadata: { kind: 'refund', bookingId: refund.bookingId, refundId, amount: refund.amount, mode: environment },
      },
    })
    return { refund: await tx.refund.findUniqueOrThrow({ where: { id: refundId } }), attempt }
  }, { maxWait: 5000, timeout: 10000 })
}

// Applique un statut verifie a une tentative de remboursement — miroir de
// lib/marketplace/booking-payment.ts::recordBookingDepositAttemptStatus.
async function recordRefundAttemptStatus(attemptId: string, status: TransactionStatus, failureCode: string | null): Promise<PaymentAttempt> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id = ${attemptId} FOR UPDATE`
    const current = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
    if (isFinal(current.status)) return current
    const updated = await tx.paymentAttempt.update({ where: { id: attemptId }, data: { status, failureCode } })
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorRole: 'system',
        action: 'payment_attempt.status_changed',
        targetType: 'PaymentAttempt',
        targetId: attemptId,
        metadata: { kind: current.kind, status, previousStatus: current.status },
      },
    })
    if (updated.kind !== 'refund' || !updated.bookingId) return updated
    const refund = await tx.refund.findFirst({ where: { bookingId: updated.bookingId, status: { in: ['processing', 'failed'] } }, orderBy: { createdAt: 'desc' } })
    if (!refund) return updated
    if (status === 'COMPLETED' && refund.status !== 'completed') {
      assertRefundTransition(refund.status as RefundStatus, 'completed')
      await tx.refund.update({ where: { id: refund.id }, data: { status: 'completed' } })
      await tx.ledgerEntry.create({
        data: {
          bookingId: updated.bookingId,
          paymentAttemptId: updated.id,
          type: 'refund',
          amount: -updated.amount,
          currency: updated.currency,
          description: `Remboursement — réservation ${updated.bookingId}`,
        },
      })
    } else if ((status === 'FAILED' || status === 'REJECTED') && refund.status !== 'failed') {
      assertRefundTransition(refund.status as RefundStatus, 'failed')
      await tx.refund.update({ where: { id: refund.id }, data: { status: 'failed' } })
    }
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Verifie (et, si autorise, soumet) une tentative aupres de pawaPay — miroir de
// lib/marketplace/booking-payment.ts::refreshBookingDepositAttempt.
export async function refreshRefundAttempt(attempt: PaymentAttempt, allowSubmission = false): Promise<{ attempt: PaymentAttempt; message: string }> {
  if (isFinal(attempt.status)) return { attempt, message: '' }
  const environment = attempt.mode as 'sandbox' | 'production'
  const claimed = await prisma.paymentAttempt.updateMany({
    where: {
      id: attempt.id,
      status: { notIn: ['COMPLETED', 'FAILED', 'REJECTED'] },
      OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(Date.now() - RECHECK_THROTTLE_MS) } }],
    },
    data: { checkedAt: new Date() },
  })
  if (!claimed.count) {
    return { attempt: await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } }), message: 'Vérification déjà en cours ou récente. Réessayez dans quelques instants.' }
  }
  const t = toPawaPayTransactionLike(attempt)
  try {
    let result = await checkPawaPayStatus(t, environment)
    if (!result && allowSubmission && ['CREATED', 'UNKNOWN'].includes(attempt.status)) result = await initiatePawaPayTransaction(t, environment)
    if (result) return { attempt: await recordRefundAttemptStatus(attempt.id, result.status, result.failureCode), message: '' }
    return { attempt, message: 'pawaPay ne retrouve pas encore cette opération. Réessayez dans quelques instants.' }
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'INVALID_RESPONSE'
    console.error('Vérification pawaPay (remboursement) impossible', { paymentAttemptId: attempt.id, code })
    let updated = attempt
    if (allowSubmission && ['CREATED', 'UNKNOWN'].includes(attempt.status)) updated = await recordRefundAttemptStatus(attempt.id, 'UNKNOWN', code)
    return { attempt: updated, message: e instanceof ProviderError ? e.message : 'Réponse pawaPay non conforme. Le remboursement reste à vérifier.' }
  }
}

// Point d'entree webhook — toujours re-verifie via l'appel authentifie, jamais le corps du callback.
export async function handlePawaPayRefundCallback(paymentAttemptId: string): Promise<{ attempt: PaymentAttempt } | null> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } })
  if (!attempt || attempt.kind !== 'refund') return null
  if (isFinal(attempt.status)) return { attempt }
  const environment = attempt.mode as 'sandbox' | 'production'
  const verified = await checkPawaPayStatus(toPawaPayTransactionLike(attempt), environment)
  if (!verified) return { attempt }
  try {
    await prisma.paymentProviderEvent.create({
      data: { provider: 'pawapay', providerEventId: `${attempt.id}:${verified.status}`, paymentAttemptId: attempt.id },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { attempt }
    throw e
  }
  return { attempt: await recordRefundAttemptStatus(attempt.id, verified.status, verified.failureCode) }
}

export function publicRefund(r: Refund) {
  return {
    id: r.id,
    bookingId: r.bookingId,
    amount: r.amount,
    status: r.status,
    reason: r.reason,
    decisionReason: r.decisionReason,
    createdAt: r.createdAt.toISOString(),
  }
}
