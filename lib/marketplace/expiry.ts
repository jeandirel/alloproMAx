// Balayage cron : bascule vers 'expired' les Offer/ServiceRequest dont la date limite est depassee.
// Jamais de suppression — une ligne expiree reste dans l'historique, seul son statut change.
// Chaque ecriture est conditionnee (updateMany avec le statut source dans le where) pour rester
// sans effet si l'etat a change entre-temps (ex. acceptation concurrente) plutot que d'ecraser un
// statut plus recent : la meme garde qu'utilise isFinal() ailleurs contre le double traitement.
import { prisma } from '../prisma'
import { assertOfferTransition, assertServiceRequestTransition } from './state-machine'

export async function sweepMarketplaceExpirations(now = new Date()): Promise<{ offers: number; serviceRequests: number }> {
  assertOfferTransition('pending', 'expired')
  assertServiceRequestTransition('open', 'expired')
  assertServiceRequestTransition('negotiating', 'expired')

  const staleOffers = await prisma.offer.findMany({ where: { status: 'pending', expiresAt: { lt: now } }, select: { id: true } })
  let offers = 0
  for (const offer of staleOffers) {
    const result = await prisma.offer.updateMany({ where: { id: offer.id, status: 'pending' }, data: { status: 'expired' } })
    offers += result.count
  }

  const staleRequests = await prisma.serviceRequest.findMany({
    where: { status: { in: ['open', 'negotiating'] }, expiresAt: { lt: now } },
    select: { id: true, status: true },
  })
  let serviceRequests = 0
  for (const request of staleRequests) {
    const result = await prisma.serviceRequest.updateMany({ where: { id: request.id, status: request.status }, data: { status: 'expired' } })
    if (!result.count) continue
    serviceRequests += result.count
    const pending = await prisma.offer.findMany({ where: { serviceRequestId: request.id, status: 'pending' }, select: { id: true } })
    for (const offer of pending) await prisma.offer.updateMany({ where: { id: offer.id, status: 'pending' }, data: { status: 'expired' } })
  }

  return { offers, serviceRequests }
}
