// E2E reel (base Neon dev) des 3 scenarios obligatoires de la directive produit : deblocage de
// contact, negociation complete jusqu'au versement, litige jusqu'au remboursement. Contrairement a
// scripts/marketplace-transactions-rules.test.ts (regles pures, aucune E2E), ce script cree/efface
// de vraies lignes en base et simule pawaPay via un fetch mocke (lib/pawapay.ts n'a volontairement
// aucune branche mock pour ces fonctions reelles — voir lib/marketplace/*.ts qui bloquent sur
// pawaPayEnvironment()==='mock'). Opt-in : PAS dans `npm test` (necessite la base dev joignable),
// lance via `npm run test:e2e`. Doit respecter le brochage exact de scripts/lib/load-app-env.ts :
// aucun import statique touchant Prisma avant loadAppEnv().
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
          displayName: 'Airtel Money (simulation E2E)',
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

// Simule l'API pawaPay v2 (jamais le vrai reseau) : POST /{deposits,payouts,refunds} enregistre la
// transaction, GET /{...}/:id la retrouve COMPLETED. Un refund n'a pas de payer/recipient dans son
// corps POST (voir lib/pawapay.ts::buildTransactionBody) : son compte de destination est repris du
// depositId source, exactement l'invariant impose par lib/marketplace/refunds.ts (meme compte que
// l'acompte d'origine, jamais un compte fourni a posteriori).
function createMockPawaPayFetch() {
  const transactions = new Map<string, MockTxn>()
  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = String(input)
    const method = init?.method ?? 'GET'
    if (href.includes('/active-conf')) return Response.json(ACTIVE_CONFIG)
    const match = href.match(/\/(deposits|payouts|refunds)\/?([^/?]*)$/)
    if (!match) throw new Error(`URL pawaPay simulée non gérée par le test E2E : ${href}`)
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
  const { computePlatformFee, computeProfessionalNet, computePayoutAmount } = await import('../lib/marketplace/pricing')
  const { getMarketplaceSettings } = await import('../lib/marketplace/settings')
  const { createServiceRequest, publishServiceRequest } = await import('../lib/marketplace/service-requests')
  const { requireActingProfessional, submitOffer, acceptOffer } = await import('../lib/marketplace/offers')
  const { createOrGetContactUnlock, prepareContactUnlockPayment, refreshContactUnlockAttempt, handlePawaPayContactUnlockCallback, getContactUnlockView } =
    await import('../lib/marketplace/contact-unlock')
  const { prepareBookingDepositPayment, refreshBookingDepositAttempt, handlePawaPayBookingDepositCallback, getBookingForViewer } =
    await import('../lib/marketplace/booking-payment')
  const { professionalStartsRoute, professionalStartsMission, professionalSubmitsCompletionProof, clientValidatesCompletion } =
    await import('../lib/marketplace/mission')
  const { openDispute, resolveDispute } = await import('../lib/marketplace/disputes')
  const { processApprovedRefund, refreshRefundAttempt, handlePawaPayRefundCallback } = await import('../lib/marketplace/refunds')
  const { requestPayout, refreshPayoutAttempt, handlePawaPayPayoutCallback } = await import('../lib/marketplace/payouts')

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
    contactUnlockId: '',
    bookingIds: [] as string[],
    offerIds: [] as string[],
    serviceRequestIds: [] as string[],
  }

  try {
    process.env.CONTACT_UNLOCK_ENABLED = 'true'
    process.env.MANAGED_PAYMENTS_ENABLED = 'true'
    process.env.REFUNDS_ENABLED = 'true'
    process.env.PAYOUTS_ENABLED = 'true'
    process.env.PAWAPAY_ENVIRONMENT = 'sandbox'
    process.env.PAWAPAY_API_TOKEN = randomUUID() // jamais une vraie clé — fetch entièrement simulé ci-dessous
    globalThis.fetch = createMockPawaPayFetch() as typeof fetch

    const settings = await getMarketplaceSettings()

    const category = await prisma.category.create({ data: { slug: `e2e-${suffix}`, name: 'E2E Marketplace' } })
    ids.categoryId = category.id
    const clientUser = await prisma.user.create({ data: { email: `e2e-client-${suffix}@allopro.test`, name: 'E2E Client' } })
    ids.clientId = clientUser.id
    const proUser = await prisma.user.create({ data: { email: `e2e-pro-${suffix}@allopro.test`, name: 'E2E Professionnel' } })
    ids.professionalUserId = proUser.id
    const adminUser = await prisma.user.create({ data: { email: `e2e-admin-${suffix}@allopro.test`, name: 'E2E Admin', role: 'admin' } })
    ids.adminUserId = adminUser.id
    const professional = await prisma.professional.create({
      data: { userId: proUser.id, categoryId: category.id, kycStatus: 'verifie' },
    })
    ids.professionalId = professional.id
    await requireActingProfessional(proUser.id) // sanity : le fixture est bien éligible (vérifié, non suspendu/en pause)

    // ---- Scénario 1 : monétisation du contact -------------------------------------------------
    const unlock = await createOrGetContactUnlock(clientUser.id, professional.id)
    ids.contactUnlockId = unlock.id
    assert.equal(unlock.status, 'pending')
    assert.equal(unlock.amount, settings.contactUnlockFeeAmount)
    const beforePay = await getContactUnlockView(clientUser.id, unlock.id)
    assert.equal(beforePay?.contact, null)

    const prepared = await prepareContactUnlockPayment({ contactUnlockId: unlock.id, userId: clientUser.id, method: 'airtel', phone: '074111111' })
    assert(prepared.attempt)
    const submitted = await refreshContactUnlockAttempt(prepared.attempt!, true)
    assert.equal(submitted.attempt.status, 'ACCEPTED')
    const confirmed = await handlePawaPayContactUnlockCallback(submitted.attempt.id)
    assert.equal(confirmed?.attempt.status, 'COMPLETED')
    const replay = await handlePawaPayContactUnlockCallback(submitted.attempt.id) // idempotence webhook
    assert.equal(replay?.attempt.status, 'COMPLETED')

    const afterPay = await getContactUnlockView(clientUser.id, unlock.id)
    assert.equal(afterPay?.status, 'paid')
    assert.equal(afterPay?.contact?.name, 'E2E Professionnel')
    const unlockLedger = await prisma.ledgerEntry.findFirst({ where: { contactUnlockId: unlock.id, type: 'contact_unlock_fee' } })
    assert.equal(unlockLedger?.amount, settings.contactUnlockFeeAmount)
    console.log('MARKETPLACE E2E (déblocage de contact) : PASS — paiement confirmé, coordonnées révélées, ligne de grand livre créée, callback idempotent.')

    // ---- Scénario 2 : négociation complète jusqu'au versement ----------------------------------
    const GROSS_1 = 20000
    const sr1 = await createServiceRequest({
      clientId: clientUser.id,
      categoryId: category.id,
      title: 'E2E — Réparation plomberie',
      description: 'Fuite sous évier à réparer.',
      address: '123 Rue Test',
      quartier: 'Nombakélé',
    })
    ids.serviceRequestIds.push(sr1.id)
    await publishServiceRequest(clientUser.id, sr1.id)
    const offer1 = await submitOffer({ professionalId: professional.id, serviceRequestId: sr1.id, amount: GROSS_1 })
    ids.offerIds.push(offer1.id)
    const booking1 = await acceptOffer(clientUser.id, offer1.id)
    ids.bookingIds.push(booking1.id)
    const expectedFee1 = computePlatformFee(GROSS_1, settings.platformCommissionBps)
    const expectedNet1 = computeProfessionalNet(GROSS_1, expectedFee1)
    assert.equal(booking1.totalPrice, GROSS_1)
    assert.equal(booking1.paymentStatus, 'a_payer')
    assert.equal(booking1.status, 'en_attente')

    const depositPrep1 = await prepareBookingDepositPayment({ bookingId: booking1.id, userId: clientUser.id, method: 'airtel', phone: '074222222' })
    assert(depositPrep1.attempt)
    const depositSubmitted1 = await refreshBookingDepositAttempt(depositPrep1.attempt!, true)
    assert.equal(depositSubmitted1.attempt.status, 'ACCEPTED')
    const depositConfirmed1 = await handlePawaPayBookingDepositCallback(depositSubmitted1.attempt.id)
    assert.equal(depositConfirmed1?.attempt.status, 'COMPLETED')

    const paidBooking1 = await prisma.booking.findUniqueOrThrow({ where: { id: booking1.id } })
    assert.equal(paidBooking1.paymentStatus, 'paye')
    assert.equal(paidBooking1.status, 'acceptee')
    const platformFeeLedger1 = await prisma.ledgerEntry.findFirst({ where: { bookingId: booking1.id, type: 'platform_fee' } })
    assert.equal(platformFeeLedger1?.amount, expectedFee1)

    await professionalStartsRoute(professional.id, booking1.id)
    await professionalStartsMission(professional.id, booking1.id)
    await professionalSubmitsCompletionProof(professional.id, booking1.id, proUser.id)
    const validated1 = await clientValidatesCompletion(clientUser.id, booking1.id)
    assert.equal(validated1.status, 'validee')

    const payoutResult1 = await requestPayout({ professionalId: professional.id, bookingId: booking1.id, method: 'airtel', phone: '066444444' })
    assert(payoutResult1.attempt)
    assert.equal(payoutResult1.payout.amount, computePayoutAmount(expectedNet1, 0))
    const payoutSubmitted1 = await refreshPayoutAttempt(payoutResult1.attempt!, true)
    assert.equal(payoutSubmitted1.attempt.status, 'ACCEPTED')
    const payoutConfirmed1 = await handlePawaPayPayoutCallback(payoutSubmitted1.attempt.id)
    assert.equal(payoutConfirmed1?.attempt.status, 'COMPLETED')

    const finalBooking1 = await prisma.booking.findUniqueOrThrow({ where: { id: booking1.id }, include: { payout: true } })
    assert.equal(finalBooking1.status, 'payee')
    assert.equal(finalBooking1.payout?.status, 'verse')
    const payoutLedger1 = await prisma.ledgerEntry.findFirst({ where: { bookingId: booking1.id, type: 'professional_payout' } })
    assert.equal(payoutLedger1?.amount, -computePayoutAmount(expectedNet1, 0))

    assert(await getBookingForViewer(clientUser.id, booking1.id))
    assert(await getBookingForViewer(proUser.id, booking1.id))
    assert.equal(await getBookingForViewer(adminUser.id, booking1.id), null) // tiers sans accès

    console.log('MARKETPLACE E2E (négociation → versement) : PASS — offre acceptée, acompte confirmé, mission complétée, versement effectué.')

    // ---- Scénario 3 : litige jusqu'au remboursement ---------------------------------------------
    const GROSS_2 = 15000
    const sr2 = await createServiceRequest({
      clientId: clientUser.id,
      categoryId: category.id,
      title: 'E2E — Réparation électrique',
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

    const depositPrep2 = await prepareBookingDepositPayment({ bookingId: booking2.id, userId: clientUser.id, method: 'airtel', phone: '074333333' })
    assert(depositPrep2.attempt)
    await refreshBookingDepositAttempt(depositPrep2.attempt!, true)
    const depositConfirmed2 = await handlePawaPayBookingDepositCallback(depositPrep2.attempt!.id)
    assert.equal(depositConfirmed2?.attempt.status, 'COMPLETED')

    await professionalStartsRoute(professional.id, booking2.id)
    await professionalStartsMission(professional.id, booking2.id)

    const dispute = await openDispute(clientUser.id, booking2.id, 'Travail non conforme à la demande initiale.')
    assert.equal(dispute.status, 'ouvert')
    const litigiousBooking2 = await prisma.booking.findUniqueOrThrow({ where: { id: booking2.id } })
    assert.equal(litigiousBooking2.status, 'litige')

    const resolution = await resolveDispute(adminUser.id, dispute.id, 'refund', 'Remboursement accordé après vérification des preuves.')
    assert.equal(resolution.dispute.status, 'resolu')
    assert.equal(resolution.refund?.status, 'approved')
    assert.equal(resolution.refund?.amount, GROSS_2)
    const cancelledBooking2 = await prisma.booking.findUniqueOrThrow({ where: { id: booking2.id } })
    assert.equal(cancelledBooking2.status, 'annulee')

    const refundResult = await processApprovedRefund(resolution.refund!.id)
    assert(refundResult.attempt)
    const refundSubmitted = await refreshRefundAttempt(refundResult.attempt!, true)
    assert.equal(refundSubmitted.attempt.status, 'ACCEPTED')
    const refundConfirmed = await handlePawaPayRefundCallback(refundSubmitted.attempt.id)
    assert.equal(refundConfirmed?.attempt.status, 'COMPLETED')

    const finalRefund = await prisma.refund.findUniqueOrThrow({ where: { id: resolution.refund!.id } })
    assert.equal(finalRefund.status, 'completed')
    const refundLedger = await prisma.ledgerEntry.findFirst({ where: { bookingId: booking2.id, type: 'refund' } })
    assert.equal(refundLedger?.amount, -GROSS_2)
    const finalBooking2 = await prisma.booking.findUniqueOrThrow({ where: { id: booking2.id } })
    assert.equal(finalBooking2.status, 'annulee') // le remboursement ne rouvre jamais la réservation

    console.log('MARKETPLACE E2E (litige → remboursement) : PASS — litige ouvert, remboursement approuvé, paiement pawaPay confirmé, grand livre exact.')
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    try {
      await cleanup(prisma, ids)
    } catch (e) {
      console.error('Nettoyage E2E incomplet — vérifier/supprimer manuellement les identifiants ci-dessus.', ids, e)
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
  contactUnlockId: string
  bookingIds: string[]
  offerIds: string[]
  serviceRequestIds: string[]
}) {
  const userIds = [ids.clientId, ids.professionalUserId, ids.adminUserId].filter(Boolean)
  await prisma.ledgerEntry.deleteMany({ where: { OR: [{ bookingId: { in: ids.bookingIds } }, { contactUnlockId: ids.contactUnlockId || undefined }] } })
  await prisma.paymentProviderEvent.deleteMany({
    where: { paymentAttempt: { is: { OR: [{ bookingId: { in: ids.bookingIds } }, { contactUnlockId: ids.contactUnlockId || undefined }] } } },
  })
  await prisma.paymentAttempt.deleteMany({ where: { OR: [{ bookingId: { in: ids.bookingIds } }, { contactUnlockId: ids.contactUnlockId || undefined }] } })
  await prisma.payout.deleteMany({ where: { bookingId: { in: ids.bookingIds } } })
  await prisma.refund.deleteMany({ where: { bookingId: { in: ids.bookingIds } } })
  await prisma.booking.deleteMany({ where: { id: { in: ids.bookingIds } } }) // cascade Dispute/DisputeEvent/CompletionProof
  await prisma.offerSnapshot.deleteMany({ where: { offerId: { in: ids.offerIds } } })
  await prisma.offer.deleteMany({ where: { id: { in: ids.offerIds } } })
  await prisma.serviceRequest.deleteMany({ where: { id: { in: ids.serviceRequestIds } } })
  if (ids.contactUnlockId) await prisma.contactUnlock.deleteMany({ where: { id: ids.contactUnlockId } })
  await prisma.auditLog.deleteMany({
    where: { targetId: { in: [...ids.bookingIds, ...ids.offerIds, ids.contactUnlockId, ids.categoryId].filter(Boolean) } },
  })
  if (ids.professionalId) await prisma.professional.deleteMany({ where: { id: ids.professionalId } })
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  if (ids.categoryId) await prisma.category.deleteMany({ where: { id: ids.categoryId } })
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
