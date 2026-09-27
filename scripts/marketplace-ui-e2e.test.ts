// E2E (base Neon dev) des contrats de donnees consommes par l'UI reelle du marketplace, en complement
// de scripts/marketplace-e2e.test.ts qui couvre deja les 3 scenarios metier obligatoires de bout en
// bout. Ce script-ci ne reteste PAS ces memes invariants metier ; il verifie specifiquement ce que les
// composants -client.tsx lisent/affichent et qui n'a pas d'autre garde-fou automatise : la resolution
// de viewerRole (app/marketplace/reservations/[id]), le fil d'evenements de litige tel que consomme par
// reservation-detail-client.tsx / litige-detail-client.tsx, le masquage tel qu'affiche par
// publicPaymentAttempt/publicPayout/publicRefund, la detection de vue double (offers vs myOffers) dont
// depend demande-detail-client.tsx, la disponibilite/exclusion d'une demande dans le tableau
// professionnel (app/marketplace/offres), et la parite de validation telephonique client/serveur
// (components/marketplace/mobile-money-fields.tsx::isValidGabonMobile vs lib/pawapay.ts::normalizePhone).
// Meme regle que le script existant : PAS dans `npm test` (necessite la base dev joignable), lance via
// `npm run test:e2e:ui`. Aucun import statique touchant Prisma avant loadAppEnv().
import { loadAppEnv } from './lib/load-app-env'

loadAppEnv()

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

type MockTxn = { amount: string; currency: string; phoneNumber: string; provider: string; depositId: string | null }

const ACTIVE_CONFIG = {
  countries: [
    {
      country: 'GAB',
      providers: [
        {
          provider: 'AIRTEL_GAB',
          displayName: 'Airtel Money (simulation E2E UI)',
          currencies: [
            {
              currency: 'XAF',
              operationTypes: {
                DEPOSIT: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL', authType: 'PROVIDER_AUTH' },
                PAYOUT: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL' },
                REFUND: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL' },
              },
            },
          ],
        },
        {
          provider: 'MOOV_GAB',
          displayName: 'Moov Money (simulation E2E UI)',
          currencies: [
            {
              currency: 'XAF',
              operationTypes: {
                DEPOSIT: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL', authType: 'PROVIDER_AUTH' },
                PAYOUT: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL' },
                REFUND: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL' },
              },
            },
          ],
        },
      ],
    },
  ],
}

// Identique a scripts/marketplace-e2e.test.ts::createMockPawaPayFetch (duplique volontairement : ce
// fichier reste autonome, sans dependance croisee entre scripts de test).
function createMockPawaPayFetch() {
  const transactions = new Map<string, MockTxn>()
  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = String(input)
    const method = init?.method ?? 'GET'
    if (href.includes('/active-conf')) return Response.json(ACTIVE_CONFIG)
    const match = href.match(/\/(deposits|payouts|refunds)\/?([^/?]*)$/)
    if (!match) throw new Error(`URL pawaPay simulée non gérée par le test E2E UI : ${href}`)
    const kind = match[1] === 'deposits' ? 'deposit' : match[1] === 'payouts' ? 'payout' : 'refund'
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body))
      const id = body[`${kind}Id`] as string
      const account =
        kind === 'refund' ? transactions.get(body.depositId) : (body.payer ?? body.recipient)?.accountDetails
      transactions.set(id, {
        amount: body.amount,
        currency: body.currency,
        phoneNumber: account?.phoneNumber ?? '',
        provider: account?.provider ?? '',
        depositId: body.depositId ?? null,
      })
      return Response.json({ status: 'ACCEPTED', [`${kind}Id`]: id })
    }
    const id = decodeURIComponent(match[2] || '')
    const stored = transactions.get(id)
    if (!stored) return Response.json({ status: 'NOT_FOUND' })
    const accountField = kind === 'deposit' ? 'payer' : 'recipient'
    return Response.json({
      status: 'FOUND',
      data: {
        [`${kind}Id`]: id,
        status: 'COMPLETED',
        amount: stored.amount,
        currency: stored.currency,
        ...(kind === 'refund' ? { depositId: stored.depositId } : {}),
        [accountField]: { type: 'MMO', accountDetails: { phoneNumber: stored.phoneNumber, provider: stored.provider } },
      },
    })
  }
  return mockFetch
}

async function main() {
  const { prisma } = await import('../lib/prisma')
  const { createServiceRequest, publishServiceRequest, getServiceRequestDetailForClient, getServiceRequestDetailForProfessional, listOpenServiceRequestsForProfessional } =
    await import('../lib/marketplace/service-requests')
  const { requireActingProfessional, submitOffer, acceptOffer, listMyOffers } = await import('../lib/marketplace/offers')
  const { prepareBookingDepositPayment, refreshBookingDepositAttempt, handlePawaPayBookingDepositCallback, getBookingForViewer, publicPaymentAttempt } =
    await import('../lib/marketplace/booking-payment')
  const { professionalStartsRoute, professionalStartsMission } = await import('../lib/marketplace/mission')
  const { openDispute, addDisputeMessage, resolveDispute, getDisputeForViewer } = await import('../lib/marketplace/disputes')
  const { processApprovedRefund, refreshRefundAttempt, handlePawaPayRefundCallback } = await import('../lib/marketplace/refunds')
  const { requestPayout, refreshPayoutAttempt, handlePawaPayPayoutCallback } = await import('../lib/marketplace/payouts')
  const {
    serviceRequestStatus,
    offerStatus,
    bookingStatus,
    paymentStatus,
    paymentAttemptStatus,
    disputeStatus,
    refundStatus,
    payoutStatus,
  } = await import('../lib/marketplace-ui/status')
  const { isValidGabonMobile } = await import('../components/marketplace/mobile-money-fields')
  const { normalizePhone } = await import('../lib/pawapay')

  const savedEnv = {
    CONTACT_UNLOCK_ENABLED: process.env.CONTACT_UNLOCK_ENABLED,
    MANAGED_PAYMENTS_ENABLED: process.env.MANAGED_PAYMENTS_ENABLED,
    REFUNDS_ENABLED: process.env.REFUNDS_ENABLED,
    PAYOUTS_ENABLED: process.env.PAYOUTS_ENABLED,
    PAWAPAY_ENVIRONMENT: process.env.PAWAPAY_ENVIRONMENT,
    PAWAPAY_API_TOKEN: process.env.PAWAPAY_API_TOKEN,
  }
  const originalFetch = globalThis.fetch
  const suffix = randomUUID().slice(0, 8)
  const ids = {
    categoryId: '',
    clientId: '',
    professionalUserId: '',
    professionalId: '',
    adminUserId: '',
    bookingIds: [] as string[],
    offerIds: [] as string[],
    serviceRequestIds: [] as string[],
  }
  // Statuts reellement observes en base durant ce run, pour verifier que lib/marketplace-ui/status.ts
  // n'a pas de trou par rapport a ce que le backend produit vraiment (et pas seulement par rapport aux
  // unions TypeScript, qui elles ne detectent pas un oubli de mise a jour de ce fichier annexe).
  const seen = {
    serviceRequest: new Set<string>(),
    offer: new Set<string>(),
    booking: new Set<string>(),
    payment: new Set<string>(),
    paymentAttempt: new Set<string>(),
    dispute: new Set<string>(),
    refund: new Set<string>(),
    payout: new Set<string>(),
  }

  try {
    process.env.CONTACT_UNLOCK_ENABLED = 'true'
    process.env.MANAGED_PAYMENTS_ENABLED = 'true'
    process.env.REFUNDS_ENABLED = 'true'
    process.env.PAYOUTS_ENABLED = 'true'
    process.env.PAWAPAY_ENVIRONMENT = 'sandbox'
    process.env.PAWAPAY_API_TOKEN = randomUUID() // jamais une vraie clé — fetch entièrement simulé ci-dessous
    globalThis.fetch = createMockPawaPayFetch() as typeof fetch

    const category = await prisma.category.create({ data: { slug: `e2e-ui-${suffix}`, name: 'E2E UI Marketplace' } })
    ids.categoryId = category.id
    const clientUser = await prisma.user.create({ data: { email: `e2e-ui-client-${suffix}@allopro.test`, name: 'E2E UI Client' } })
    ids.clientId = clientUser.id
    const proUser = await prisma.user.create({ data: { email: `e2e-ui-pro-${suffix}@allopro.test`, name: 'E2E UI Professionnel' } })
    ids.professionalUserId = proUser.id
    const adminUser = await prisma.user.create({ data: { email: `e2e-ui-admin-${suffix}@allopro.test`, name: 'E2E UI Admin', role: 'admin' } })
    ids.adminUserId = adminUser.id
    const professional = await prisma.professional.create({
      data: { userId: proUser.id, categoryId: category.id, kycStatus: 'verifie' },
    })
    ids.professionalId = professional.id
    await requireActingProfessional(proUser.id)

    // ---- Contrat 1 : double vue de la demande (app/marketplace/demandes/[id]) -------------------
    const sr1 = await createServiceRequest({
      clientId: clientUser.id,
      categoryId: category.id,
      title: 'E2E UI — Réparation plomberie',
      description: 'Fuite sous évier à réparer.',
      address: '123 Rue Test',
      quartier: 'Nombakélé',
    })
    ids.serviceRequestIds.push(sr1.id)
    seen.serviceRequest.add(sr1.status)
    await publishServiceRequest(clientUser.id, sr1.id)

    const clientView = await getServiceRequestDetailForClient(clientUser.id, sr1.id)
    assert(clientView, 'La vue client doit exister pour une demande publiée par ce client.')
    assert('offers' in clientView!, 'demande-detail-client.tsx bascule sur "offers" in detail pour detecter la vue client.')
    assert(!('myOffers' in clientView!), 'La vue client ne doit jamais exposer myOffers (reserve a la vue professionnelle).')
    seen.serviceRequest.add((clientView as { status: string }).status)

    // Avant toute offre, la demande doit apparaitre dans le tableau "Demandes ouvertes" du pro
    // (app/marketplace/offres) : c'est exactement listOpenServiceRequestsForProfessional qui l'alimente.
    const openBefore = await listOpenServiceRequestsForProfessional(professional.id)
    assert(openBefore.some((r) => r.id === sr1.id), 'La demande ouverte doit apparaitre dans le tableau du professionnel avant toute offre.')

    const proView = await getServiceRequestDetailForProfessional(professional.id, sr1.id)
    assert(proView, 'La vue professionnelle doit exister pour une demande ouverte.')
    assert('myOffers' in proView!, 'demande-detail-client.tsx attend myOffers pour la vue professionnelle.')
    assert(!('offers' in proView!), 'La vue professionnelle ne doit jamais exposer les offres concurrentes (offers).')
    assert.equal((proView as { myOffers: unknown[] }).myOffers.length, 0)

    const offer1 = await submitOffer({ professionalId: professional.id, serviceRequestId: sr1.id, amount: 20000 })
    ids.offerIds.push(offer1.id)
    seen.offer.add(offer1.status)

    // Le tableau "Mes offres" (view=mine) doit refleter l'offre juste soumise avec le titre imbrique
    // exact que consomme offres-client.tsx (o.serviceRequest.title).
    const myOffers = await listMyOffers(professional.id)
    const myOfferRow = myOffers.find((o) => o.id === offer1.id) as undefined | { serviceRequestId: string; serviceRequest: { title: string; status: string } }
    assert(myOfferRow, "L'offre soumise doit apparaitre dans listMyOffers.")
    assert.equal(myOfferRow!.serviceRequestId, sr1.id)
    assert.equal(myOfferRow!.serviceRequest.title, 'E2E UI — Réparation plomberie')
    seen.serviceRequest.add(myOfferRow!.serviceRequest.status)

    // Une fois une offre pending deposee, la demande doit disparaitre du tableau "ouvertes" du pro
    // (filtre offers:{none:{...}} de listOpenServiceRequestsForProfessional).
    const openAfter = await listOpenServiceRequestsForProfessional(professional.id)
    assert(!openAfter.some((r) => r.id === sr1.id), "La demande doit disparaitre du tableau une fois qu'une offre pending existe.")

    const booking1 = await acceptOffer(clientUser.id, offer1.id)
    ids.bookingIds.push(booking1.id)
    seen.offer.add('accepted')
    seen.booking.add(booking1.status)
    seen.payment.add(booking1.paymentStatus)

    // ---- Contrat 2 : viewerRole (app/api/marketplace/bookings/[id]/route.ts) --------------------
    const bookingAsClient = await getBookingForViewer(clientUser.id, booking1.id)
    assert(bookingAsClient)
    const viewerRoleClient = bookingAsClient!.userId === clientUser.id ? 'client' : 'professionnel'
    assert.equal(viewerRoleClient, 'client')

    const bookingAsPro = await getBookingForViewer(proUser.id, booking1.id)
    assert(bookingAsPro)
    const viewerRolePro = bookingAsPro!.userId === proUser.id ? 'client' : 'professionnel'
    assert.equal(viewerRolePro, 'professionnel')

    assert.equal(await getBookingForViewer(adminUser.id, booking1.id), null, 'Un tiers sans lien avec la reservation ne doit rien voir.')

    // ---- Contrat 3 : parite de validation telephonique client/serveur ---------------------------
    const phoneSamples = ['074111111', '+24174111111', '0024174111111', '062222222', '099999999']
    for (const raw of phoneSamples) {
      const clientSaysValid = isValidGabonMobile(raw)
      let serverAccepts = true
      try {
        normalizePhone(raw)
      } catch {
        serverAccepts = false
      }
      assert.equal(clientSaysValid, serverAccepts, `Désaccord de validation entre client/serveur pour "${raw}".`)
    }

    // ---- Contrat 4 : masquage du telephone tel qu'affiche par les composants --------------------
    const depositPrep1 = await prepareBookingDepositPayment({ bookingId: booking1.id, userId: clientUser.id, method: 'airtel', phone: '074111111' })
    assert(depositPrep1.attempt)
    const depositSubmitted1 = await refreshBookingDepositAttempt(depositPrep1.attempt!, true)
    seen.paymentAttempt.add(depositSubmitted1.attempt.status)
    const publicAttempt = publicPaymentAttempt(depositSubmitted1.attempt)
    assert.equal(publicAttempt.phone, '••••1111', 'usePaymentAttemptPolling/reservation-detail-client.tsx affichent ce champ phone masqué.')
    const depositConfirmed1 = await handlePawaPayBookingDepositCallback(depositSubmitted1.attempt.id)
    assert.equal(depositConfirmed1?.attempt.status, 'COMPLETED')
    seen.paymentAttempt.add('COMPLETED')

    const paidBooking1 = await prisma.booking.findUniqueOrThrow({ where: { id: booking1.id } })
    seen.booking.add(paidBooking1.status)
    seen.payment.add(paidBooking1.paymentStatus)

    await professionalStartsRoute(professional.id, booking1.id)
    seen.booking.add('en_route')
    await professionalStartsMission(professional.id, booking1.id)
    seen.booking.add('en_cours')

    // ---- Contrat 5 : litige — fil d'evenements (reservation-detail-client.tsx / litige-detail-client.tsx) --
    const dispute = await openDispute(clientUser.id, booking1.id, 'Le professionnel est en retard sans prevenir.')
    seen.dispute.add(dispute.status)
    seen.booking.add('litige')
    await addDisputeMessage(proUser.id, 'professionnel', dispute.id, "Je suis bloqué dans les embouteillages, j'arrive dans 20 minutes.")

    const disputeAsClient = await getDisputeForViewer(clientUser.id, dispute.id)
    const disputeAsPro = await getDisputeForViewer(proUser.id, dispute.id)
    assert(disputeAsClient, 'Le client (partie a la reservation) doit voir le litige.')
    assert(disputeAsPro, 'Le professionnel (partie a la reservation) doit voir le litige.')
    assert.equal(await getDisputeForViewer(adminUser.id, dispute.id), null, "getDisputeForViewer n'autorise que les 2 parties — l'admin passe par la route dediee, pas par cette fonction.")

    assert.equal(disputeAsClient!.events.length, 2, "Le fil doit contenir le message d'ouverture + la reponse du professionnel.")
    assert.equal(disputeAsClient!.events[0].actorRole, 'client')
    assert.equal(disputeAsClient!.events[0].message, 'Le professionnel est en retard sans prevenir.')
    assert.equal(disputeAsClient!.events[1].actorRole, 'professionnel')
    assert.equal(disputeAsClient!.events[1].message, "Je suis bloqué dans les embouteillages, j'arrive dans 20 minutes.")
    assert(disputeAsClient!.events[0].createdAt <= disputeAsClient!.events[1].createdAt, 'Le fil doit etre trie chronologiquement (createdAt asc).')

    // Mirroir exact du fallback admin de app/api/marketplace/disputes/[id]/route.ts (l'admin n'est pas
    // une partie a la reservation, donc getDisputeForViewer renvoie null et la route bascule sur une
    // requete prisma directe reservee a requireAdminApi()).
    const disputeForAdminRoute = await prisma.dispute.findUnique({
      where: { id: dispute.id },
      include: { booking: { select: { code: true, status: true, totalPrice: true } }, events: { orderBy: { createdAt: 'asc' } } },
    })
    assert(disputeForAdminRoute, "La route admin doit pouvoir charger le litige via une requete directe.")
    assert.equal(disputeForAdminRoute!.events.length, 2)

    const resolution = await resolveDispute(adminUser.id, dispute.id, 'refund', 'Retard confirmé par le professionnel, remboursement accordé.')
    seen.dispute.add(resolution.dispute.status)
    seen.booking.add('annulee')
    assert(resolution.refund)
    seen.refund.add(resolution.refund!.status)

    const disputeAfterResolution = await getDisputeForViewer(clientUser.id, dispute.id)
    assert.equal(disputeAfterResolution!.events.length, 3, "La resolution admin ajoute un 3e evenement (actorRole 'administrateur').")
    assert.equal(disputeAfterResolution!.events[2].actorRole, 'administrateur')

    const refundResult = await processApprovedRefund(resolution.refund!.id)
    assert(refundResult.attempt)
    const refundSubmitted = await refreshRefundAttempt(refundResult.attempt!, true)
    seen.paymentAttempt.add(refundSubmitted.attempt.status)
    const refundConfirmed = await handlePawaPayRefundCallback(refundSubmitted.attempt.id)
    assert.equal(refundConfirmed?.attempt.status, 'COMPLETED')

    const finalRefund = await prisma.refund.findUniqueOrThrow({ where: { id: resolution.refund!.id } })
    seen.refund.add(finalRefund.status)

    console.log('MARKETPLACE UI E2E (litige) : PASS — fil d’événements ordonné et complet, accès restreint aux parties, fallback admin cohérent.')

    // ---- Contrat 6 : versement — masquage tel qu'affiche par le panneau versement du professionnel --
    const GROSS_2 = 12000
    const sr2 = await createServiceRequest({
      clientId: clientUser.id,
      categoryId: category.id,
      title: 'E2E UI — Réparation électrique',
      description: 'Prise défectueuse à remplacer.',
      address: '456 Avenue Test',
      quartier: 'Glass',
    })
    ids.serviceRequestIds.push(sr2.id)
    await publishServiceRequest(clientUser.id, sr2.id)
    const offer2 = await submitOffer({ professionalId: professional.id, serviceRequestId: sr2.id, amount: GROSS_2 })
    ids.offerIds.push(offer2.id)
    const booking2 = await acceptOffer(clientUser.id, offer2.id)
    ids.bookingIds.push(booking2.id)

    const depositPrep2 = await prepareBookingDepositPayment({ bookingId: booking2.id, userId: clientUser.id, method: 'moov', phone: '062333333' })
    assert(depositPrep2.attempt)
    await refreshBookingDepositAttempt(depositPrep2.attempt!, true)
    const depositConfirmed2 = await handlePawaPayBookingDepositCallback(depositPrep2.attempt!.id)
    assert.equal(depositConfirmed2?.attempt.status, 'COMPLETED')

    await professionalStartsRoute(professional.id, booking2.id)
    await professionalStartsMission(professional.id, booking2.id)
    const { professionalSubmitsCompletionProof, clientValidatesCompletion } = await import('../lib/marketplace/mission')
    await professionalSubmitsCompletionProof(professional.id, booking2.id, proUser.id)
    seen.booking.add('a_valider')
    const validated2 = await clientValidatesCompletion(clientUser.id, booking2.id)
    seen.booking.add(validated2.status)

    const payoutResult2 = await requestPayout({ professionalId: professional.id, bookingId: booking2.id, method: 'moov', phone: '062555555' })
    assert(payoutResult2.attempt)
    seen.payout.add(payoutResult2.payout.status)
    const payoutSubmitted2 = await refreshPayoutAttempt(payoutResult2.attempt!, true)
    seen.paymentAttempt.add(payoutSubmitted2.attempt.status)
    const payoutConfirmed2 = await handlePawaPayPayoutCallback(payoutSubmitted2.attempt.id)
    assert.equal(payoutConfirmed2?.attempt.status, 'COMPLETED')

    const finalBooking2 = await prisma.booking.findUniqueOrThrow({ where: { id: booking2.id }, include: { payout: true } })
    seen.booking.add(finalBooking2.status)
    seen.payout.add(finalBooking2.payout!.status)
    const { publicPayout } = await import('../lib/marketplace/payouts')
    const publicPayoutView = publicPayout(finalBooking2.payout!)
    assert.equal(publicPayoutView.phone, '••••5555', 'Le panneau de versement (reservation-detail-client.tsx) affiche ce champ phone masqué.')

    console.log('MARKETPLACE UI E2E (versement) : PASS — masquage du téléphone conforme à ce qu’affiche le panneau versement.')

    // ---- Contrat 7 : completude des maps lib/marketplace-ui/status.ts vis-a-vis des statuts reels --
    for (const s of seen.serviceRequest) assert(serviceRequestStatus[s], `serviceRequestStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.offer) assert(offerStatus[s], `offerStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.booking) assert(bookingStatus[s], `bookingStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.payment) assert(paymentStatus[s], `paymentStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.paymentAttempt) assert(paymentAttemptStatus[s], `paymentAttemptStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.dispute) assert(disputeStatus[s], `disputeStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.refund) assert(refundStatus[s], `refundStatus ne couvre pas le statut réel "${s}".`)
    for (const s of seen.payout) assert(payoutStatus[s], `payoutStatus ne couvre pas le statut réel "${s}".`)

    console.log('MARKETPLACE UI E2E (contrats UI) : PASS — vues doubles, viewerRole, validation téléphonique, masquage, fil de litige et maps de statuts tous cohérents avec le backend réel.')
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    try {
      await cleanup(prisma, ids)
    } catch (e) {
      console.error('Nettoyage E2E UI incomplet — vérifier/supprimer manuellement les identifiants ci-dessus.', ids, e)
    }
    await prisma.$disconnect()
  }
}

async function cleanup(prisma: (typeof import('../lib/prisma'))['prisma'], ids: {
  categoryId: string
  clientId: string
  professionalUserId: string
  professionalId: string
  adminUserId: string
  bookingIds: string[]
  offerIds: string[]
  serviceRequestIds: string[]
}) {
  const userIds = [ids.clientId, ids.professionalUserId, ids.adminUserId].filter(Boolean)
  await prisma.ledgerEntry.deleteMany({ where: { bookingId: { in: ids.bookingIds } } })
  await prisma.paymentProviderEvent.deleteMany({ where: { paymentAttempt: { is: { bookingId: { in: ids.bookingIds } } } } })
  await prisma.paymentAttempt.deleteMany({ where: { bookingId: { in: ids.bookingIds } } })
  await prisma.payout.deleteMany({ where: { bookingId: { in: ids.bookingIds } } })
  await prisma.refund.deleteMany({ where: { bookingId: { in: ids.bookingIds } } })
  await prisma.booking.deleteMany({ where: { id: { in: ids.bookingIds } } }) // cascade Dispute/DisputeEvent/CompletionProof
  await prisma.offerSnapshot.deleteMany({ where: { offerId: { in: ids.offerIds } } })
  await prisma.offer.deleteMany({ where: { id: { in: ids.offerIds } } })
  await prisma.serviceRequest.deleteMany({ where: { id: { in: ids.serviceRequestIds } } })
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: [...ids.bookingIds, ...ids.offerIds, ids.categoryId].filter(Boolean) } },
  })
  if (ids.professionalId) await prisma.professional.deleteMany({ where: { id: ids.professionalId } })
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  if (ids.categoryId) await prisma.category.deleteMany({ where: { id: ids.categoryId } })
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
