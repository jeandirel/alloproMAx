// Demande de service publiee par un client — point d'entree de la negociation reelle
// (ServiceRequest -> Offer -> acceptation -> Booking). Cree en 'draft' pour laisser le temps
// d'attacher des photos (ServiceRequestAttachment) avant publication explicite vers 'open'.
import { prisma } from '../prisma'
import { assertServiceRequestTransition, type ServiceRequestStatus } from './state-machine'

export type CreateServiceRequestInput = {
  clientId: string
  categoryId: string
  subcategoryId?: string | null
  catalogServiceId?: string | null
  title: string
  description: string
  address?: string | null
  quartier?: string | null
  neighborhoodId?: string | null
  budgetMinAmount?: number | null
  budgetMaxAmount?: number | null
  urgent?: boolean
  preferredDate?: Date | null
  expiresAt?: Date | null
}

function assertBudget(min?: number | null, max?: number | null): void {
  if (min != null && (!Number.isSafeInteger(min) || min < 0)) throw new Error('Le budget minimum doit être un entier positif.')
  if (max != null && (!Number.isSafeInteger(max) || max < 0)) throw new Error('Le budget maximum doit être un entier positif.')
  if (min != null && max != null && min > max) throw new Error('Le budget minimum ne peut pas dépasser le budget maximum.')
}

export async function createServiceRequest(input: CreateServiceRequestInput) {
  const title = input.title.trim()
  const description = input.description.trim()
  if (!title) throw new Error('Le titre de la demande est requis.')
  if (!description) throw new Error('La description de la demande est requise.')
  assertBudget(input.budgetMinAmount, input.budgetMaxAmount)
  const category = await prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true, active: true } })
  if (!category || !category.active) throw new Error('Catégorie introuvable ou inactive.')
  if (input.subcategoryId) {
    const subcategory = await prisma.serviceSubcategory.findFirst({
      where: { id: input.subcategoryId, categoryId: input.categoryId, isActive: true },
      select: { id: true },
    })
    if (!subcategory) throw new Error('Sous-catégorie introuvable pour cette catégorie.')
  }
  return prisma.serviceRequest.create({
    data: {
      clientId: input.clientId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId || null,
      catalogServiceId: input.catalogServiceId || null,
      title,
      description,
      address: input.address?.trim() || null,
      quartier: input.quartier?.trim() || null,
      neighborhoodId: input.neighborhoodId || null,
      budgetMinAmount: input.budgetMinAmount ?? null,
      budgetMaxAmount: input.budgetMaxAmount ?? null,
      urgent: input.urgent ?? false,
      preferredDate: input.preferredDate ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  })
}

export async function publishServiceRequest(clientId: string, serviceRequestId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${serviceRequestId} FOR UPDATE`
    const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: serviceRequestId } })
    if (request.clientId !== clientId) throw new Error('Cette demande appartient à un autre compte.')
    assertServiceRequestTransition(request.status as ServiceRequestStatus, 'open')
    return tx.serviceRequest.update({ where: { id: serviceRequestId }, data: { status: 'open' } })
  })
}

// L'annulation cote client s'arrete a 'negotiating' : une demande deja 'awarded' a une Booking
// liee, dont l'annulation releve du cycle de vie de la reservation (Phase 4+), pas de celui-ci.
export async function cancelServiceRequest(clientId: string, serviceRequestId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${serviceRequestId} FOR UPDATE`
    const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: serviceRequestId } })
    if (request.clientId !== clientId) throw new Error('Cette demande appartient à un autre compte.')
    if (request.status === 'cancelled') return request
    if (request.status === 'awarded' || request.status === 'closed') {
      throw new Error('Cette demande est déjà attribuée. Utilisez l’annulation de la réservation.')
    }
    assertServiceRequestTransition(request.status as ServiceRequestStatus, 'cancelled')
    const updated = await tx.serviceRequest.update({ where: { id: serviceRequestId }, data: { status: 'cancelled' } })
    const pending = await tx.offer.findMany({ where: { serviceRequestId, status: 'pending' }, select: { id: true } })
    for (const offer of pending) await tx.offer.update({ where: { id: offer.id }, data: { status: 'rejected' } })
    return updated
  })
}

export async function listServiceRequestsForClient(clientId: string) {
  return prisma.serviceRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    include: { offers: { orderBy: { createdAt: 'desc' } }, category: { select: { name: true, slug: true } } },
  })
}

// Vitrine professionnelle : uniquement les demandes ouvertes/en negociation de la categorie du
// professionnel, en excluant celles ou il a deja une offre active (il la gere depuis "mes offres").
export async function listOpenServiceRequestsForProfessional(professionalId: string) {
  const professional = await prisma.professional.findUniqueOrThrow({ where: { id: professionalId }, select: { categoryId: true } })
  return prisma.serviceRequest.findMany({
    where: {
      categoryId: professional.categoryId,
      status: { in: ['open', 'negotiating'] },
      offers: { none: { professionalId, status: { in: ['pending', 'accepted'] } } },
    },
    orderBy: { createdAt: 'desc' },
    include: { category: { select: { name: true, slug: true } }, subcategory: { select: { name: true } } },
  })
}

export async function getServiceRequestDetailForClient(clientId: string, serviceRequestId: string) {
  return prisma.serviceRequest.findFirst({
    where: { id: serviceRequestId, clientId },
    include: {
      offers: { orderBy: { createdAt: 'desc' }, include: { professional: { include: { user: { select: { name: true } } } } } },
      booking: true,
    },
  })
}

// Vue professionnelle : la demande (si visible : ouverte/en negociation, ou deja liee a une de ses
// offres) accompagnee uniquement de SES PROPRES offres — jamais les montants des concurrents.
export async function getServiceRequestDetailForProfessional(professionalId: string, serviceRequestId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: {
      id: serviceRequestId,
      OR: [{ status: { in: ['open', 'negotiating'] } }, { offers: { some: { professionalId } } }],
    },
    include: { category: { select: { name: true, slug: true } }, subcategory: { select: { name: true } } },
  })
  if (!request) return null
  const myOffers = await prisma.offer.findMany({ where: { serviceRequestId, professionalId }, orderBy: { createdAt: 'desc' } })
  return { ...request, myOffers }
}
