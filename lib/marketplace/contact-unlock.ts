import { randomUUID } from 'node:crypto'
import { Prisma, type PaymentAttempt } from '@prisma/client'
import { prisma } from '../prisma'
import { getMarketplaceSettings } from './settings'
import { isContactUnlockEnabled } from './flags'
import { assertContactUnlockTransition, type ContactUnlockStatus } from './state-machine'
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

function requireEnabled(): void {
  if (!isContactUnlockEnabled()) throw new Error('Le déblocage de contact est temporairement indisponible.')
}

async function activeDepositOptions(environment: 'sandbox' | 'production') {
  return extractOptions(await fetchPawaPayActiveConfig(environment), 'deposit')
}

function toPawaPayTransactionLike(attempt: PaymentAttempt): PawaPayTransactionLike {
  return {
    id: attempt.id,
    kind: attempt.kind as PaymentKind,
    amount: attempt.amount,
    currency: attempt.currency,
    clientReferenceId: attempt.contactUnlockId ?? attempt.id,
    phoneNumber: attempt.phoneNumber,
    provider: attempt.provider,
    depositId: attempt.depositId,
  }
}

// Cree (ou reutilise) la demande de deblocage — reutilise la meme ligne a travers les tentatives de
// paiement (echec -> nouvelle tentative sur le meme ContactUnlock), jamais une ligne par tentative.
export async function createOrGetContactUnlock(clientId: string, professionalId: string) {
  requireEnabled()
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { suspended: true, paused: true, deletedAt: true, kycStatus: true },
  })
  if (!professional) throw new Error('Professionnel introuvable.')
  if (professional.suspended || professional.paused || professional.deletedAt || professional.kycStatus !== 'verifie') {
    throw new Error('Ce professionnel n’est pas disponible pour un déblocage de contact.')
  }
  const existing = await prisma.contactUnlock.findFirst({
    where: { clientId, professionalId, status: { in: ['pending', 'paid', 'failed'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return existing
  const settings = await getMarketplaceSettings()
  return prisma.contactUnlock.create({
    data: { clientId, professionalId, amount: settings.contactUnlockFeeAmount, currency: settings.currency },
  })
}

// Cree (ou reutilise) la tentative de paiement pawaPay pour un ContactUnlock donne — miroir de
// lib/payment-server.ts::preparePayment, adapte a PaymentAttempt/ContactUnlock (jamais 'mock' ici :
// sans jeton pawaPay configure, le deblocage de contact reste indisponible plutot que simule).
export async function prepareContactUnlockPayment(params: {
  contactUnlockId: string
  userId: string
  method: 'airtel' | 'moov'
  phone: string
}) {
  requireEnabled()
  const environment = pawaPayEnvironment()
  if (environment === 'mock') throw new Error('Paiement temporairement indisponible : configuration pawaPay manquante.')
  // Tout l'appel reseau se fait hors transaction, comme preparePayment.
  const options = await activeDepositOptions(environment)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContactUnlock" WHERE id = ${params.contactUnlockId} FOR UPDATE`
    const unlock = await tx.contactUnlock.findUniqueOrThrow({ where: { id: params.contactUnlockId } })
    if (unlock.clientId !== params.userId) throw new Error('Ce déblocage de contact appartient à un autre compte.')
    if (unlock.status === 'paid') return { unlock, attempt: null as PaymentAttempt | null }
    if (unlock.status === 'refunded') throw new Error('Ce déblocage a été remboursé. Recommencez la demande depuis le profil du professionnel.')
    const previous = await tx.paymentAttempt.findFirst({
      where: { contactUnlockId: unlock.id, kind: 'deposit' },
      orderBy: { attempt: 'desc' },
    })
    if (previous && !isFinal(previous.status)) return { unlock, attempt: previous }
    if ((previous?.attempt || 0) >= MAX_ATTEMPTS) throw new Error('Limite de tentatives atteinte pour ce déblocage de contact.')
    if (unlock.status === 'failed') {
      assertContactUnlockTransition('failed', 'pending')
      await tx.contactUnlock.update({ where: { id: unlock.id }, data: { status: 'pending' } })
    }
    const option = options.find((o) => o.method === params.method)
    if (!option) throw new Error('Cet opérateur n’est pas activé dans votre configuration pawaPay au Gabon.')
    const phoneNumber = normalizePhone(params.phone)
    if (!Number.isSafeInteger(unlock.amount) || unlock.amount < option.min || unlock.amount > option.max) {
      throw new Error('Montant hors des limites autorisées par cet opérateur.')
    }
    const attempt = await tx.paymentAttempt.create({
      data: {
        id: randomUUID(),
        userId: params.userId,
        contactUnlockId: unlock.id,
        kind: 'deposit',
        attempt: (previous?.attempt || 0) + 1,
        mode: environment,
        status: 'CREATED',
        amount: unlock.amount,
        currency: unlock.currency,
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
        metadata: { kind: 'deposit', contactUnlockId: unlock.id, amount: unlock.amount, mode: environment },
      },
    })
    return { unlock, attempt }
  }, { maxWait: 5000, timeout: 10000 })
}

// Applique un statut verifie a une tentative — miroir de lib/payment-server.ts::recordStatus.
// Idempotent : un attempt deja final n'est jamais retraite (protege contre un double credit du
// grand livre en cas de webhook redelivre en concurrence).
async function recordContactUnlockAttemptStatus(attemptId: string, status: TransactionStatus, failureCode: string | null): Promise<PaymentAttempt> {
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
    if (!updated.contactUnlockId) return updated
    await tx.$queryRaw`SELECT id FROM "ContactUnlock" WHERE id = ${updated.contactUnlockId} FOR UPDATE`
    const unlock = await tx.contactUnlock.findUniqueOrThrow({ where: { id: updated.contactUnlockId } })
    if (status === 'COMPLETED' && unlock.status !== 'paid') {
      assertContactUnlockTransition(unlock.status as ContactUnlockStatus, 'paid')
      await tx.contactUnlock.update({ where: { id: unlock.id }, data: { status: 'paid', unlockedAt: new Date() } })
      await tx.ledgerEntry.create({
        data: {
          contactUnlockId: unlock.id,
          paymentAttemptId: updated.id,
          type: 'contact_unlock_fee',
          amount: unlock.amount,
          currency: unlock.currency,
          description: `Frais de déblocage de contact — professionnel ${unlock.professionalId}`,
        },
      })
    } else if ((status === 'FAILED' || status === 'REJECTED') && unlock.status === 'pending') {
      assertContactUnlockTransition('pending', 'failed')
      await tx.contactUnlock.update({ where: { id: unlock.id }, data: { status: 'failed' } })
    }
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Verifie (et, si autorise, soumet) une tentative aupres de pawaPay — miroir de
// lib/payment-server.ts::refreshPayment. `allowSubmission` distingue l'action explicite du client
// (peut soumettre une tentative CREATED) du rapprochement webhook (jamais de soumission).
export async function refreshContactUnlockAttempt(attempt: PaymentAttempt, allowSubmission = false): Promise<{ attempt: PaymentAttempt; message: string }> {
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
    if (result) return { attempt: await recordContactUnlockAttemptStatus(attempt.id, result.status, result.failureCode), message: '' }
    return { attempt, message: 'pawaPay ne retrouve pas encore cette opération. Réessayez dans quelques instants.' }
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'INVALID_RESPONSE'
    console.error('Vérification pawaPay (déblocage de contact) impossible', { paymentAttemptId: attempt.id, code })
    let updated = attempt
    if (allowSubmission && ['CREATED', 'UNKNOWN'].includes(attempt.status)) updated = await recordContactUnlockAttemptStatus(attempt.id, 'UNKNOWN', code)
    return { attempt: updated, message: e instanceof ProviderError ? e.message : 'Réponse pawaPay non conforme. Le paiement reste à vérifier.' }
  }
}

// Point d'entree webhook : toujours re-verifie via l'appel authentifie (jamais le corps du callback),
// et n'applique un effet qu'une seule fois par (attempt, statut verifie) grace a PaymentProviderEvent.
export async function handlePawaPayContactUnlockCallback(paymentAttemptId: string): Promise<{ attempt: PaymentAttempt } | null> {
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: paymentAttemptId } })
  if (!attempt || attempt.kind !== 'deposit' || !attempt.contactUnlockId) return null
  if (isFinal(attempt.status)) return { attempt }
  const environment = attempt.mode as 'sandbox' | 'production'
  const verified = await checkPawaPayStatus(toPawaPayTransactionLike(attempt), environment)
  if (!verified) return { attempt }
  try {
    await prisma.paymentProviderEvent.create({
      data: { provider: 'pawapay', providerEventId: `${attempt.id}:${verified.status}`, paymentAttemptId: attempt.id },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { attempt } // deja traite
    throw e
  }
  return { attempt: await recordContactUnlockAttemptStatus(attempt.id, verified.status, verified.failureCode) }
}

export type ContactUnlockView = {
  id: string
  status: string
  amount: number
  currency: string
  professionalId: string
  unlockedAt: string | null
  contact: { phone: string | null; name: string | null } | null
}

// Vue exposable au client : ne revele le contact que si le statut est bien 'paid' — jamais deduit
// d'un champ client (statut relu en base a chaque appel).
export async function getContactUnlockView(clientId: string, contactUnlockId: string): Promise<ContactUnlockView | null> {
  const unlock = await prisma.contactUnlock.findFirst({
    where: { id: contactUnlockId, clientId },
    include: { professional: { include: { user: { select: { phone: true, name: true } } } } },
  })
  if (!unlock) return null
  return {
    id: unlock.id,
    status: unlock.status,
    amount: unlock.amount,
    currency: unlock.currency,
    professionalId: unlock.professionalId,
    unlockedAt: unlock.unlockedAt?.toISOString() ?? null,
    contact: unlock.status === 'paid' ? { phone: unlock.professional.user.phone, name: unlock.professional.user.name } : null,
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
