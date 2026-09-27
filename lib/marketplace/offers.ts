// Cycle de vie des Offer — soumission, renegociation (versionnee, immuable), acceptation.
// L'acceptation est le seul point qui fige des montants (OfferSnapshot) et cree la Booking reelle :
// une fois acceptee, une Offer et son OfferSnapshot ne sont plus jamais modifies, seul le statut
// de l'Offer elle-meme evolue (voir lib/marketplace/state-machine.ts).
import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma'
import { computeOfferSplit } from './pricing'
import { resolveCommissionBpsFor } from './settings'
import { assertOfferTransition, assertServiceRequestTransition, type OfferStatus, type ServiceRequestStatus } from './state-machine'

function assertOfferAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Le montant de l’offre doit être un entier positif.')
}

export async function requireActingProfessional(userId: string) {
  const professional = await prisma.professional.findUnique({
    where: { userId },
    select: { id: true, categoryId: true, suspended: true, paused: true, deletedAt: true, kycStatus: true },
  })
  if (!professional) throw new Error('Profil professionnel introuvable pour ce compte.')
  if (professional.suspended || professional.paused || professional.deletedAt || professional.kycStatus !== 'verifie') {
    throw new Error('Votre profil professionnel n’est pas éligible pour cette action (vérification ou disponibilité requise).')
  }
  return professional
}

export async function submitOffer(params: {
  professionalId: string
  serviceRequestId: string
  amount: number
  message?: string | null
  expiresAt?: Date | null
}) {
  assertOfferAmount(params.amount)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${params.serviceRequestId} FOR UPDATE`
    const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: params.serviceRequestId } })
    const professional = await tx.professional.findUniqueOrThrow({
      where: { id: params.professionalId },
      select: { categoryId: true },
    })
    if (professional.categoryId !== request.categoryId) throw new Error('Cette demande ne correspond pas à votre catégorie de service.')
    if (request.status !== 'open' && request.status !== 'negotiating') throw new Error('Cette demande n’accepte plus de nouvelles offres.')
    const already = await tx.offer.findFirst({
      where: { serviceRequestId: request.id, professionalId: params.professionalId, status: 'pending' },
      select: { id: true },
    })
    if (already) throw new Error('Vous avez déjà une offre en cours sur cette demande. Modifiez-la plutôt que d’en soumettre une nouvelle.')
    if (request.status === 'open') {
      assertServiceRequestTransition('open', 'negotiating')
      await tx.serviceRequest.update({ where: { id: request.id }, data: { status: 'negotiating' } })
    }
    return tx.offer.create({
      data: {
        serviceRequestId: request.id,
        professionalId: params.professionalId,
        amount: params.amount,
        message: params.message?.trim() || null,
        expiresAt: params.expiresAt ?? null,
      },
    })
  })
}

// Renegociation : ne modifie jamais amount/message sur la ligne existante — cree une nouvelle
// version (previousOfferId, version+1) et bascule l'ancienne en 'superseded'.
export async function reviseOffer(professionalId: string, offerId: string, params: { amount: number; message?: string | null; expiresAt?: Date | null }) {
  assertOfferAmount(params.amount)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`
    const current = await tx.offer.findUniqueOrThrow({ where: { id: offerId } })
    if (current.professionalId !== professionalId) throw new Error('Cette offre appartient à un autre compte.')
    const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: current.serviceRequestId }, select: { status: true } })
    if (request.status !== 'open' && request.status !== 'negotiating') throw new Error('Cette demande n’accepte plus de modifications d’offre.')
    assertOfferTransition(current.status as OfferStatus, 'superseded')
    await tx.offer.update({ where: { id: current.id }, data: { status: 'superseded' } })
    return tx.offer.create({
      data: {
        serviceRequestId: current.serviceRequestId,
        professionalId,
        version: current.version + 1,
        previousOfferId: current.id,
        amount: params.amount,
        message: params.message?.trim() || null,
        expiresAt: params.expiresAt ?? null,
      },
    })
  })
}

export async function withdrawOffer(professionalId: string, offerId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId } })
    if (offer.professionalId !== professionalId) throw new Error('Cette offre appartient à un autre compte.')
    if (offer.status === 'withdrawn') return offer
    assertOfferTransition(offer.status as OfferStatus, 'withdrawn')
    return tx.offer.update({ where: { id: offerId }, data: { status: 'withdrawn' } })
  })
}

// Rejet explicite d'une offre precise par le client, sans en accepter une autre — la demande
// reste ouverte/en negociation pour les autres offres.
export async function rejectOffer(clientId: string, offerId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId }, include: { serviceRequest: { select: { clientId: true } } } })
    if (offer.serviceRequest.clientId !== clientId) throw new Error('Cette offre appartient à une autre demande.')
    if (offer.status === 'rejected') return offer
    assertOfferTransition(offer.status as OfferStatus, 'rejected')
    return tx.offer.update({ where: { id: offerId }, data: { status: 'rejected' } })
  })
}

function generateBookingCode(): string {
  return `RES-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

// Acceptation : fige les montants (OfferSnapshot, jamais recalcules apres coup meme si
// MarketplaceSettings change ensuite), rejette les autres offres pendantes, et cree la Booking
// reelle. Idempotent vis-a-vis d'un double-clic client : si l'Offer est deja 'accepted', renvoie
// la Booking existante au lieu de relancer la transition (qui leverait sinon).
export async function acceptOffer(clientId: string, offerId: string) {
  const preview = await prisma.offer.findUniqueOrThrow({ where: { id: offerId }, include: { serviceRequest: true } })
  if (preview.serviceRequest.clientId !== clientId) throw new Error('Cette offre appartient à une autre demande.')
  if (preview.status === 'accepted') {
    const existing = await prisma.booking.findUnique({ where: { offerId } })
    if (existing) return existing
  }
  if (!preview.serviceRequest.address?.trim() || !preview.serviceRequest.quartier?.trim()) {
    throw new Error('Adresse et quartier requis sur la demande avant d’accepter une offre.')
  }
  // Lecture hors transaction (comme le fait deja prepareContactUnlockPayment pour l'appel pawaPay) :
  // MarketplaceSettings/Category ne sont pas verrouilles ici, seule l'ecriture qui suit l'est.
  const { commissionBps, settingsVersion, currency } = await resolveCommissionBpsFor({
    categoryId: preview.serviceRequest.categoryId,
    subcategoryId: preview.serviceRequest.subcategoryId,
  })
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId } })
    if (offer.status === 'accepted') {
      const existing = await tx.booking.findUnique({ where: { offerId } })
      if (existing) return existing
    }
    assertOfferTransition(offer.status as OfferStatus, 'accepted')
    await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${offer.serviceRequestId} FOR UPDATE`
    const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: offer.serviceRequestId } })
    if (request.clientId !== clientId) throw new Error('Cette offre appartient à une autre demande.')
    assertServiceRequestTransition(request.status as ServiceRequestStatus, 'awarded')

    const split = computeOfferSplit(offer.amount, commissionBps)
    const snapshot = await tx.offerSnapshot.create({
      data: {
        offerId: offer.id,
        grossAmount: split.grossAmount,
        currency,
        platformCommissionBps: split.platformCommissionBps,
        platformFeeAmount: split.platformFeeAmount,
        professionalNetAmount: split.professionalNetAmount,
        settingsVersion,
      },
    })
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'accepted' } })
    await tx.serviceRequest.update({ where: { id: request.id }, data: { status: 'awarded' } })

    const others = await tx.offer.findMany({
      where: { serviceRequestId: request.id, status: 'pending', id: { not: offer.id } },
      select: { id: true },
    })
    for (const other of others) await tx.offer.update({ where: { id: other.id }, data: { status: 'rejected' } })

    // Jamais de markup ajoute au prix accepte (directive produit) : le client paie exactement
    // grossAmount ; la commission plateforme est prelevee cote professionnel (professionalNetAmount),
    // pas ajoutee cote client. serviceFee reste a 0 ici — champ herite du parcours de reservation
    // directe existant (lib/marketplace.ts), non applicable a une reservation issue d'une negociation.
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: request.clientId,
        professionalId: offer.professionalId,
        categoryId: request.categoryId,
        description: request.description,
        address: request.address!.trim(),
        quartier: request.quartier!.trim(),
        neighborhoodId: request.neighborhoodId,
        date: request.preferredDate ?? new Date(),
        urgent: request.urgent,
        status: 'en_attente',
        basePrice: split.grossAmount,
        serviceFee: 0,
        totalPrice: split.grossAmount,
        paymentStatus: 'a_payer',
        serviceRequestId: request.id,
        offerId: offer.id,
        offerSnapshotId: snapshot.id,
      },
    })

    const actorExists = await tx.user.findUnique({ where: { id: clientId }, select: { id: true } })
    await tx.auditLog.create({
      data: {
        actorId: actorExists ? clientId : null,
        actorRole: 'client',
        action: 'marketplace.offer.accepted',
        targetType: 'Offer',
        targetId: offer.id,
        metadata: { serviceRequestId: request.id, bookingId: booking.id, grossAmount: split.grossAmount, platformFeeAmount: split.platformFeeAmount, commissionBps },
      },
    })
    return booking
  }, { maxWait: 5000, timeout: 10000 })
}

export async function listOffersForServiceRequest(viewerUserId: string, serviceRequestId: string) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: serviceRequestId }, select: { clientId: true } })
  if (!request) throw new Error('Demande introuvable.')
  const isOwner = request.clientId === viewerUserId
  const actingProfessional = await prisma.professional.findUnique({ where: { userId: viewerUserId }, select: { id: true } })
  const where = isOwner
    ? { serviceRequestId }
    : actingProfessional
      ? { serviceRequestId, professionalId: actingProfessional.id }
      : null
  if (!where) throw new Error('Vous n’avez pas accès aux offres de cette demande.')
  return prisma.offer.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function listMyOffers(professionalId: string) {
  return prisma.offer.findMany({
    where: { professionalId },
    orderBy: { createdAt: 'desc' },
    include: { serviceRequest: { select: { title: true, status: true, categoryId: true } } },
  })
}
