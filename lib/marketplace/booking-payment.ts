// Paiement reel de l'acompte d'une Booking issue de la negociation (ServiceRequest -> Offer ->
// acceptation). Miroir exact de lib/marketplace/contact-unlock.ts (elle-meme miroir de
// lib/payment-server.ts) adapte a Booking/OfferSnapshot — volontairement duplique plutot que
// factorise, pour que les deux flux (deblocage de contact, acompte de reservation) restent
// independants l'un de l'autre.
import { randomUUID } from 'node:crypto'
import { Prisma, type PaymentAttempt, type Booking } from '@prisma/client'
import { prisma } from '../prisma'
import { assertBookingTransition, type BookingStatus } from './state-machine'
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

async function activeDepositOptions(environment: 'sandbox' | 'production') {
  return extractOptions(await fetchPawaPayActiveConfig(environment), 'deposit')
}

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

// Cree (ou reutilise) la tentative de paiement pawaPay pour l'acompte d'une Booking — miroir de
// lib/marketplace/contact-unlock.ts::prepareContactUnlockPayment.
export async function prepareBookingDepositPayment(params: { bookingId: string; userId: string; method: 'airtel' | 'moov'; phone: string }) {
  const environment = pawaPayEnvironment()
  if (environment === 'mock') throw new Error('Paiement temporairement indisponible : configuration pawaPay manquante.')
  const options = await activeDepositOptions(environment)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${params.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: params.bookingId } })
    if (booking.userId !== params.userId) throw new Error('Cette réservation appartient à un autre compte.')
    if (booking.paymentStatus === 'paye') return { booking, attempt: null as PaymentAttempt | null }
    if (booking.status !== 'en_attente') throw new Error('Cette réservation n’accepte plus de paiement d’acompte.')
    const previous = await tx.paymentAttempt.findFirst({ where: { bookingId: booking.id, kind: 'deposit' }, orderBy: { attempt: 'desc' } })
    if (previous && !isFinal(previous.status)) return { booking, attempt: previous }
    if ((previous?.attempt || 0) >= MAX_ATTEMPTS) throw new Error('Limite de tentatives atteinte pour cette réservation.')
    const option = options.find((o) => o.method === params.method)
    if (!option) throw new Error('Cet opérateur n’est pas activé dans votre configuration pawaPay au Gabon.')
    const phoneNumber = normalizePhone(params.phone)
    if (!Number.isSafeInteger(booking.totalPrice) || booking.totalPrice < option.min || booking.totalPrice > option.max) {
      throw new Error('Montant hors des limites autorisées par cet opérateur.')
    }
    const attempt = await tx.paymentAttempt.create({
      data: {
        id: randomUUID(),
        userId: params.userId,
        bookingId: booking.id,
        kind: 'deposit',
        attempt: (previous?.attempt || 0) + 1,
        mode: environment,
        status: 'CREATED',
        amount: booking.totalPrice,
        currency: 'XAF',
        provider: option.provider,
        phoneNumber,
      },
    })
    const actorExists = await tx.user.findUnique({ where: { id: params.userId }, select: { id: true } })
    await tx.auditLog.create({
      data: {
        actorId: actorExists ? params.userId : null,
        actorRole: 'client',
        action: 'payment_attempt.created',
        targetType: 'PaymentAttempt',
        targetId: attempt.id,
        metadata: { kind: 'deposit', bookingId: booking.id, amount: booking.totalPrice, mode: environment },
      },
    })
    return { booking, attempt }
  }, { maxWait: 5000, timeout: 10000 })
}

// Applique un statut verifie a une tentative d'acompte — miroir de
// lib/marketplace/contact-unlock.ts::recordContactUnlockAttemptStatus. Le paiement confirme
// debloque la suite de la mission (comme le fait deja le parcours demo, voir
// lib/marketplace-engine.ts : aucune action professionnelle avant paiement confirme) — ici,
// l'acceptation de l'Offer ayant deja valu accord mutuel sur le prix, la confirmation du paiement
// fait directement avancer la Booking de 'en_attente' a 'acceptee'.
async function recordBookingDepositAttemptStatus(attemptId: string, status: TransactionStatus, failureCode: string | null): Promise<PaymentAttempt> {
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
    if (!updated.bookingId || updated.kind !== 'deposit') return updated
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${updated.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: updated.bookingId } })
    if (status === 'COMPLETED' && booking.paymentStatus !== 'paye') {
      const snapshot = booking.offerSnapshotId ? await tx.offerSnapshot.findUnique({ where: { id: booking.offerSnapshotId } }) : null
      const data: Prisma.BookingUpdateInput = { paymentStatus: 'paye' }
      if (booking.status === 'en_attente') {
        assertBookingTransition('en_attente', 'acceptee')
        data.status = 'acceptee'
      }
      await tx.booking.update({ where: { id: booking.id }, data })
      if (snapshot) {
        await tx.ledgerEntry.create({
          data: {
            bookingId: booking.id,
            paymentAttemptId: updated.id,
            type: 'platform_fee',
            amount: snapshot.platformFeeAmount,
            currency: snapshot.currency,
            description: `Commission plateforme — réservation ${booking.code}`,
          },
        })
      }
    }
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Verifie (et, si autorise, soumet) une tentative aupres de pawaPay — miroir de
// lib/marketplace/contact-unlock.ts::refreshContactUnlockAttempt.
export async function refreshBookingDepositAttempt(attempt: PaymentAttempt, allowSubmission = false): Promise<{ attempt: PaymentAttempt; message: string }> {
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
    if (result) return { attempt: await recordBookingDepositAttemptStatus(attempt.id, result.status, result.failureCode), message: '' }
    return { attempt, message: 'pawaPay ne retrouve pas encore cette opération. Réessayez dans quelques instants.' }
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'INVALID_RESPONSE'
    console.error('Vérification pawaPay (acompte de réservation) impossible', { paymentAttemptId: attempt.id, code })
    let updated = attempt
    if (allowSubmission && ['CREATED', 'UNKNOWN'].includes(attempt.status)) updated = await recordBookingDepositAttemptStatus(attempt.id, 'UNKNOWN', code)
    return { attempt: updated, message: e instanceof ProviderError ? e.message : 'Réponse pawaPay non conforme. Le paiement reste à vérifier.' }
  }
}

// Point d'entree webhook — toujours re-verifie via l'appel authentifie, jamais le corps du
// callback, et n'applique un effet qu'une seule fois par (attempt, statut verifie) grace a
// PaymentProviderEvent (voir app/api/marketplace/payments/pawapay/callback/route.ts).
export async function handlePawaPayBookingDepositCallback(paymentAttemptId: string): Promise<{ attempt: PaymentAttempt } | null> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } })
  if (!attempt || attempt.kind !== 'deposit' || !attempt.bookingId) return null
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
  return { attempt: await recordBookingDepositAttemptStatus(attempt.id, verified.status, verified.failureCode) }
}

export async function getBookingForViewer(viewerUserId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { professional: { select: { userId: true } } } })
  if (!booking) return null
  if (booking.userId !== viewerUserId && booking.professional.userId !== viewerUserId) return null
  return booking
}

export async function listBookingsForClient(clientId: string) {
  return prisma.booking.findMany({ where: { userId: clientId }, orderBy: { createdAt: 'desc' } })
}

export async function listBookingsForProfessional(professionalId: string) {
  return prisma.booking.findMany({ where: { professionalId }, orderBy: { createdAt: 'desc' } })
}

export function publicBooking(b: Booking) {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    paymentStatus: b.paymentStatus,
    address: b.address,
    quartier: b.quartier,
    date: b.date.toISOString(),
    urgent: b.urgent,
    basePrice: b.basePrice,
    serviceFee: b.serviceFee,
    totalPrice: b.totalPrice,
    createdAt: b.createdAt.toISOString(),
  }
}

export function publicPaymentAttempt(t: PaymentAttempt) {
  return {
    id: t.id,
    kind: t.kind,
    attempt: t.attempt,
    mode: t.mode,
    status: t.status,
    amount: t.amount,
    currency: t.currency,
    provider: t.provider,
    phone: `••••${t.phoneNumber.slice(-4)}`,
    failureCode: t.failureCode,
    createdAt: t.createdAt.toISOString(),
  }
}
