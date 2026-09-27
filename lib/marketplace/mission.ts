// Progression de la mission apres acceptation de l'offre et paiement de l'acompte (Phase 5) :
// acceptee -> en_route -> en_cours -> a_valider -> validee. Le versement au professionnel
// (validee -> payee) reste hors perimetre ici (voir lib/marketplace/payouts.ts, Phase 7) — cette
// etape ne fait que constater que le client a confirme la bonne execution, sans deplacer d'argent.
import { prisma } from '../prisma'
import { getMarketplaceSettings } from './settings'
import { assertBookingTransition, type BookingStatus } from './state-machine'
import { Prisma, type Booking, type CompletionProof } from '@prisma/client'

async function auditBooking(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], params: { bookingId: string; actorId: string | null; actorRole: string; action: string; metadata?: Prisma.InputJsonValue }) {
  const actorExists = params.actorId ? await tx.user.findUnique({ where: { id: params.actorId }, select: { id: true } }) : null
  await tx.auditLog.create({
    data: {
      actorId: actorExists ? params.actorId : null,
      actorRole: params.actorRole,
      action: params.action,
      targetType: 'Booking',
      targetId: params.bookingId,
      metadata: params.metadata ?? {},
    },
  })
}

// Le professionnel se met en route vers l'intervention — n'est possible qu'une fois l'acompte
// confirme (statut 'acceptee', jamais atteint autrement, voir lib/marketplace/booking-payment.ts).
export async function professionalStartsRoute(professionalId: string, bookingId: string): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`
    const booking = await requireProfessionalBookingTx(tx, professionalId, bookingId)
    if (booking.status === 'en_route') return booking
    assertBookingTransition(booking.status as BookingStatus, 'en_route')
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: 'en_route' } })
    await auditBooking(tx, { bookingId, actorId: null, actorRole: 'professionnel', action: 'marketplace.booking.en_route' })
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Debut effectif de l'intervention sur place.
export async function professionalStartsMission(professionalId: string, bookingId: string): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`
    const booking = await requireProfessionalBookingTx(tx, professionalId, bookingId)
    if (booking.status === 'en_cours') return booking
    assertBookingTransition(booking.status as BookingStatus, 'en_cours')
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: 'en_cours' } })
    await auditBooking(tx, { bookingId, actorId: null, actorRole: 'professionnel', action: 'marketplace.booking.en_cours' })
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Soumission de la preuve de fin d'intervention — ouvre le delai de validation automatique
// (MarketplaceSettings.autoCompleteHours). Idempotent : resoumettre alors que la Booking est deja
// 'a_valider' renvoie la CompletionProof existante plutot que d'en creer une seconde (contrainte
// @unique sur bookingId de toute facon, mais on evite l'erreur de contrainte pour un double-clic).
export async function professionalSubmitsCompletionProof(professionalId: string, bookingId: string, submittedById: string): Promise<CompletionProof> {
  const settings = await getMarketplaceSettings()
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`
    const booking = await requireProfessionalBookingTx(tx, professionalId, bookingId)
    if (booking.status === 'a_valider') {
      const existing = await tx.completionProof.findUnique({ where: { bookingId } })
      if (existing) return existing
    }
    assertBookingTransition(booking.status as BookingStatus, 'a_valider')
    const autoCompleteDeadline = new Date(Date.now() + settings.autoCompleteHours * 3600000)
    const proof = await tx.completionProof.create({
      data: { bookingId, submittedById, autoCompleteDeadline },
    })
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'a_valider' } })
    await auditBooking(tx, {
      bookingId,
      actorId: submittedById,
      actorRole: 'professionnel',
      action: 'marketplace.booking.completion_submitted',
      metadata: { autoCompleteDeadline: autoCompleteDeadline.toISOString() },
    })
    return proof
  }, { maxWait: 5000, timeout: 10000 })
}

// Validation explicite par le client — le cas nominal. L'auto-completion (sweepAutoCompletions
// ci-dessous) ne s'applique qu'en l'absence de reaction du client avant l'echeance.
export async function clientValidatesCompletion(clientId: string, bookingId: string): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } })
    if (booking.userId !== clientId) throw new Error('Cette réservation appartient à un autre compte.')
    if (booking.status === 'validee') return booking
    assertBookingTransition(booking.status as BookingStatus, 'validee')
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: 'validee' } })
    await tx.completionProof.update({ where: { bookingId }, data: { clientConfirmedAt: new Date() } })
    await auditBooking(tx, { bookingId, actorId: clientId, actorRole: 'client', action: 'marketplace.booking.validated' })
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

async function requireProfessionalBookingTx(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], professionalId: string, bookingId: string) {
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } })
  if (booking.professionalId !== professionalId) throw new Error('Cette réservation appartient à un autre compte.')
  return booking
}

// Balayage cron : valide automatiquement les missions dont le delai de contestation est ecoule
// sans reaction du client. CAS (updateMany conditionne par le statut source, voir
// lib/marketplace/expiry.ts) pour ne jamais ecraser une validation/litige survenu entre-temps.
export async function sweepAutoCompletions(now = new Date()): Promise<{ completed: number }> {
  assertBookingTransition('a_valider', 'validee')
  const due = await prisma.completionProof.findMany({
    where: { autoCompleteDeadline: { lt: now }, clientConfirmedAt: null, autoCompletedAt: null, booking: { status: 'a_valider' } },
    select: { id: true, bookingId: true },
  })
  let completed = 0
  for (const proof of due) {
    const result = await prisma.booking.updateMany({ where: { id: proof.bookingId, status: 'a_valider' }, data: { status: 'validee' } })
    if (!result.count) continue
    await prisma.completionProof.updateMany({ where: { id: proof.id, autoCompletedAt: null }, data: { autoCompletedAt: now } })
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorRole: 'system',
        action: 'marketplace.booking.auto_validated',
        targetType: 'Booking',
        targetId: proof.bookingId,
        metadata: { completionProofId: proof.id },
      },
    })
    completed += result.count
  }
  return { completed }
}

export function publicCompletionProof(p: CompletionProof) {
  return {
    id: p.id,
    bookingId: p.bookingId,
    autoCompleteDeadline: p.autoCompleteDeadline.toISOString(),
    clientConfirmedAt: p.clientConfirmedAt?.toISOString() ?? null,
    autoCompletedAt: p.autoCompletedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }
}
