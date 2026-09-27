// Versement reel au professionnel une fois la mission validee (Booking.status='validee') — Phase 7.
// Miroir de lib/marketplace/refunds.ts (paiement pawaPay sortant) et de
// lib/marketplace/booking-payment.ts (choix operateur/numero au moment de l'action) : ici c'est le
// professionnel, pas le client, qui fournit son compte Mobile Money de destination. Le montant verse
// est fige a la creation du Payout a partir de l'OfferSnapshot (professionalNetAmount), diminue d'un
// providerFeeActual qui reste a 0 tant qu'il n'est pas connu (jamais devine a l'avance — voir
// lib/marketplace/pricing.ts::computePayoutAmount). validee -> payee ne se produit qu'a la
// confirmation verifiee du versement, jamais a la simple creation de la tentative.
import { randomUUID } from 'node:crypto'
import { Prisma, type PaymentAttempt, type Payout } from '@prisma/client'
import { prisma } from '../prisma'
import { isPayoutsEnabled } from './flags'
import { assertBookingTransition, assertPayoutTransition, type PayoutStatus } from './state-machine'
import { computePayoutAmount } from './pricing'
import {
  normalizePhone,
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

// Demande de versement par le professionnel — cree (ou reutilise) le Payout et sa tentative pawaPay.
// Idempotent : rejouer alors qu'une tentative non finale existe deja la renvoie sans en creer une
// seconde ; rejouer une fois 'verse' renvoie le Payout final sans nouvel appel reseau.
export async function requestPayout(params: { professionalId: string; bookingId: string; method: 'airtel' | 'moov'; phone: string }): Promise<{ payout: Payout; attempt: PaymentAttempt | null }> {
  if (!isPayoutsEnabled()) throw new Error('Les versements sont temporairement indisponibles.')
  const environment = pawaPayEnvironment()
  if (environment === 'mock') throw new Error('Versement temporairement indisponible : configuration pawaPay manquante.')
  // Tout l'appel reseau se fait hors transaction, comme prepareBookingDepositPayment.
  const options = extractOptions(await fetchPawaPayActiveConfig(environment), 'payout')
  const option = options.find((o) => o.method === params.method)
  if (!option) throw new Error('Cet opérateur n’est pas activé pour les versements dans votre configuration pawaPay.')
  const phoneNumber = normalizePhone(params.phone)

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${params.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: params.bookingId }, include: { professional: { select: { userId: true } } } })
    if (booking.professionalId !== params.professionalId) throw new Error('Cette réservation appartient à un autre compte.')
    if (booking.status !== 'validee' && booking.status !== 'payee') throw new Error('Cette réservation n’est pas encore éligible au versement.')
    if (!booking.offerSnapshotId) throw new Error('Aucune répartition figée pour cette réservation : versement indisponible.')

    let payout = await tx.payout.findUnique({ where: { bookingId: booking.id } })
    if (!payout) {
      const snapshot = await tx.offerSnapshot.findUniqueOrThrow({ where: { id: booking.offerSnapshotId } })
      const amount = computePayoutAmount(snapshot.professionalNetAmount, 0)
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount < option.min || amount > option.max) {
        throw new Error('Montant hors des limites autorisées par cet opérateur.')
      }
      payout = await tx.payout.create({
        data: { professionalId: params.professionalId, bookingId: booking.id, amount, currency: snapshot.currency, status: 'a_verser' },
      })
    }
    if (payout.status === 'verse') return { payout, attempt: null }

    const previous = await tx.paymentAttempt.findFirst({ where: { bookingId: booking.id, kind: 'payout' }, orderBy: { attempt: 'desc' } })
    if (previous && !isFinal(previous.status)) return { payout, attempt: previous }
    if ((previous?.attempt || 0) >= MAX_ATTEMPTS) throw new Error('Limite de tentatives atteinte pour ce versement.')

    if (payout.status === 'echoue') {
      assertPayoutTransition('echoue', 'a_verser')
      payout = await tx.payout.update({ where: { id: payout.id }, data: { status: 'a_verser' } })
    }

    const attempt = await tx.paymentAttempt.create({
      data: {
        id: randomUUID(),
        userId: booking.professional.userId,
        bookingId: booking.id,
        kind: 'payout',
        attempt: (previous?.attempt || 0) + 1,
        mode: environment,
        status: 'CREATED',
        amount: payout.amount,
        currency: payout.currency,
        provider: option.provider,
        phoneNumber,
      },
    })
    const actorExists = await tx.user.findUnique({ where: { id: booking.professional.userId }, select: { id: true } })
    await tx.auditLog.create({
      data: {
        actorId: actorExists ? booking.professional.userId : null,
        actorRole: 'professionnel',
        action: 'payment_attempt.created',
        targetType: 'PaymentAttempt',
        targetId: attempt.id,
        metadata: { kind: 'payout', bookingId: booking.id, payoutId: payout.id, amount: payout.amount, mode: environment },
      },
    })
    return { payout, attempt }
  }, { maxWait: 5000, timeout: 10000 })
}

// Applique un statut verifie a une tentative de versement — miroir de
// lib/marketplace/refunds.ts::recordRefundAttemptStatus.
async function recordPayoutAttemptStatus(attemptId: string, status: TransactionStatus, failureCode: string | null): Promise<PaymentAttempt> {
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
    if (updated.kind !== 'payout' || !updated.bookingId) return updated
    const payout = await tx.payout.findUnique({ where: { bookingId: updated.bookingId } })
    if (!payout) return updated
    if (status === 'COMPLETED' && payout.status !== 'verse') {
      assertPayoutTransition(payout.status as PayoutStatus, 'verse')
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'verse', provider: updated.provider, phoneNumber: updated.phoneNumber, transactionRef: updated.id, processedAt: new Date() },
      })
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${updated.bookingId} FOR UPDATE`
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: updated.bookingId } })
      if (booking.status === 'validee') {
        assertBookingTransition('validee', 'payee')
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'payee' } })
      }
      await tx.ledgerEntry.create({
        data: {
          bookingId: booking.id,
          payoutId: payout.id,
          paymentAttemptId: updated.id,
          type: 'professional_payout',
          amount: -payout.amount,
          currency: payout.currency,
          description: `Versement professionnel — réservation ${booking.code}`,
        },
      })
    } else if ((status === 'FAILED' || status === 'REJECTED') && payout.status !== 'echoue') {
      assertPayoutTransition(payout.status as PayoutStatus, 'echoue')
      await tx.payout.update({ where: { id: payout.id }, data: { status: 'echoue' } })
    }
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Verifie (et, si autorise, soumet) une tentative aupres de pawaPay — miroir de
// lib/marketplace/refunds.ts::refreshRefundAttempt.
export async function refreshPayoutAttempt(attempt: PaymentAttempt, allowSubmission = false): Promise<{ attempt: PaymentAttempt; message: string }> {
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
    if (result) return { attempt: await recordPayoutAttemptStatus(attempt.id, result.status, result.failureCode), message: '' }
    return { attempt, message: 'pawaPay ne retrouve pas encore cette opération. Réessayez dans quelques instants.' }
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'INVALID_RESPONSE'
    console.error('Vérification pawaPay (versement) impossible', { paymentAttemptId: attempt.id, code })
    let updated = attempt
    if (allowSubmission && ['CREATED', 'UNKNOWN'].includes(attempt.status)) updated = await recordPayoutAttemptStatus(attempt.id, 'UNKNOWN', code)
    return { attempt: updated, message: e instanceof ProviderError ? e.message : 'Réponse pawaPay non conforme. Le versement reste à vérifier.' }
  }
}

// Point d'entree webhook — toujours re-verifie via l'appel authentifie, jamais le corps du callback.
export async function handlePawaPayPayoutCallback(paymentAttemptId: string): Promise<{ attempt: PaymentAttempt } | null> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } })
  if (!attempt || attempt.kind !== 'payout') return null
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
  return { attempt: await recordPayoutAttemptStatus(attempt.id, verified.status, verified.failureCode) }
}

export function publicPayout(p: Payout) {
  return {
    id: p.id,
    bookingId: p.bookingId,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    phone: p.phoneNumber ? `••••${p.phoneNumber.slice(-4)}` : null,
    transactionRef: p.transactionRef,
    processedAt: p.processedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }
}
