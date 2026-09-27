// Test HTTP du webhook pawaPay reel (app/api/marketplace/payments/pawapay/callback/route.ts) : la
// seule route jamais exercee directement jusqu'ici — scripts/marketplace-e2e.test.ts et
// scripts/marketplace-ui-e2e.test.ts n'appellent que les fonctions handlePawaPay*Callback internes,
// jamais le POST HTTP (authentification, validation du corps, tailles, dispatch) lui-meme. Couvre
// aussi, cote lib/pawapay.ts, les branches reelles (PaymentAttempt) non testees par
// scripts/marketplace-transactions-rules.test.ts : REJECTED, DUPLICATE_IGNORED, identifiant
// incoherent, NOT_FOUND, et chaque verification MISMATCH (montant/devise/id/compte) — deja couvertes
// cote demo par scripts/payment-rules.test.ts mais pas cote marketplace reel. Opt-in : necessite la
// base dev joignable ; aucun jeton pawaPay reel requis (fetch entierement simule). Lance via
// `npm run test:e2e:webhook`, pas dans `npm test`. Doit respecter le brochage exact de
// scripts/lib/load-app-env.ts : aucun import statique touchant Prisma avant loadAppEnv().
import { loadAppEnv } from './lib/load-app-env'

loadAppEnv()

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { initiatePawaPayTransaction, checkPawaPayStatus, type PawaPayTransactionLike } from '../lib/pawapay'

async function testWireEdgeCases() {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.PAWAPAY_ENVIRONMENT
  const originalToken = process.env.PAWAPAY_API_TOKEN
  try {
    process.env.PAWAPAY_ENVIRONMENT = 'sandbox'
    process.env.PAWAPAY_API_TOKEN = randomUUID()

    const deposit: PawaPayTransactionLike = {
      id: randomUUID(),
      kind: 'deposit',
      amount: 5000,
      currency: 'XAF',
      clientReferenceId: randomUUID(),
      phoneNumber: '24174345678',
      provider: 'AIRTEL_GAB',
      depositId: null,
    }

    // REJECTED est renvoyé tel quel (jamais transformé en succès).
    globalThis.fetch = (async () =>
      Response.json({ depositId: deposit.id, status: 'REJECTED', failureReason: { failureCode: 'PAYER_LIMIT_REACHED' } })) as typeof fetch
    const rejected = await initiatePawaPayTransaction(deposit, 'sandbox')
    assert.equal(rejected.status, 'REJECTED')
    assert.equal(rejected.failureCode, 'PAYER_LIMIT_REACHED')

    // DUPLICATE_IGNORED (pawaPay a déjà vu cet ID) -> statut interne UNKNOWN, jamais supposé COMPLETED.
    globalThis.fetch = (async () => Response.json({ depositId: deposit.id, status: 'DUPLICATE_IGNORED' })) as typeof fetch
    assert.equal((await initiatePawaPayTransaction(deposit, 'sandbox')).status, 'UNKNOWN')

    // Identifiant retourné différent de celui envoyé -> incohérence bloquante, jamais silencieuse.
    globalThis.fetch = (async () => Response.json({ depositId: randomUUID(), status: 'ACCEPTED' })) as typeof fetch
    await assert.rejects(() => initiatePawaPayTransaction(deposit, 'sandbox'), /incohérent/)

    // NOT_FOUND -> null (jamais une erreur : l'appelant réessaiera plus tard).
    globalThis.fetch = (async () => Response.json({ status: 'NOT_FOUND' })) as typeof fetch
    assert.equal(await checkPawaPayStatus(deposit, 'sandbox'), null)

    const okPayer = { type: 'MMO', accountDetails: { phoneNumber: deposit.phoneNumber, provider: deposit.provider } }
    const found = { depositId: deposit.id, status: 'COMPLETED', amount: '5000.00', currency: 'XAF', payer: okPayer }
    globalThis.fetch = (async () => Response.json({ status: 'FOUND', data: found })) as typeof fetch
    assert.equal((await checkPawaPayStatus(deposit, 'sandbox'))?.status, 'COMPLETED')

    // Chaque champ de sécurité est vérifié indépendamment : montant, devise, identifiant, compte Mobile Money.
    for (const bad of [
      { amount: '1.00' },
      { currency: 'XOF' },
      { depositId: randomUUID() },
      { payer: { ...okPayer, accountDetails: { ...okPayer.accountDetails, phoneNumber: '24100000000' } } },
      { payer: { ...okPayer, accountDetails: { ...okPayer.accountDetails, provider: 'MOOV_GAB' } } },
    ]) {
      globalThis.fetch = (async () => Response.json({ status: 'FOUND', data: { ...found, ...bad } })) as typeof fetch
      await assert.rejects(() => checkPawaPayStatus(deposit, 'sandbox'), /correspondent|incohérent/)
    }

    // Remboursement : le compte destinataire est le "recipient", et l'encaissement source (depositId)
    // doit rester celui figé localement, jamais celui renvoyé par le corps du webhook.
    const refund: PawaPayTransactionLike = { ...deposit, id: randomUUID(), kind: 'refund', depositId: deposit.id }
    globalThis.fetch = (async () =>
      Response.json({ status: 'FOUND', data: { refundId: refund.id, status: 'COMPLETED', amount: '5000.00', currency: 'XAF', depositId: refund.depositId, recipient: okPayer } })) as typeof fetch
    assert.equal((await checkPawaPayStatus(refund, 'sandbox'))?.status, 'COMPLETED')
    globalThis.fetch = (async () =>
      Response.json({ status: 'FOUND', data: { refundId: refund.id, status: 'COMPLETED', amount: '5000.00', currency: 'XAF', depositId: randomUUID(), recipient: okPayer } })) as typeof fetch
    await assert.rejects(() => checkPawaPayStatus(refund, 'sandbox'), /encaissement source/)

    console.log(
      'PAWAPAY WEBHOOK (règles réelles) : PASS — REJECTED, DUPLICATE_IGNORED, identifiant incohérent, NOT_FOUND, MISMATCH (montant/devise/id/compte), remboursement lié à l’encaissement source.',
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalEnv === undefined) delete process.env.PAWAPAY_ENVIRONMENT
    else process.env.PAWAPAY_ENVIRONMENT = originalEnv
    if (originalToken === undefined) delete process.env.PAWAPAY_API_TOKEN
    else process.env.PAWAPAY_API_TOKEN = originalToken
  }
}

async function testWebhookRoute() {
  const { POST } = await import('../app/api/marketplace/payments/pawapay/callback/route')
  const { prisma } = await import('../lib/prisma')
  const { createServiceRequest, publishServiceRequest } = await import('../lib/marketplace/service-requests')
  const { requireActingProfessional, submitOffer, acceptOffer } = await import('../lib/marketplace/offers')
  const { prepareBookingDepositPayment, refreshBookingDepositAttempt } = await import('../lib/marketplace/booking-payment')

  const CALLBACK_SECRET = randomUUID()
  const savedEnv = {
    MANAGED_PAYMENTS_ENABLED: process.env.MANAGED_PAYMENTS_ENABLED,
    PAWAPAY_ENVIRONMENT: process.env.PAWAPAY_ENVIRONMENT,
    PAWAPAY_API_TOKEN: process.env.PAWAPAY_API_TOKEN,
    PAWAPAY_CALLBACK_SECRET: process.env.PAWAPAY_CALLBACK_SECRET,
  }
  const originalFetch = globalThis.fetch
  const suffix = randomUUID().slice(0, 8)
  const ids = { categoryId: '', clientId: '', professionalUserId: '', professionalId: '', serviceRequestId: '', offerId: '', bookingId: '' }

  const post = (body: string, headers: Record<string, string>) =>
    POST(new Request('http://localhost/api/marketplace/payments/pawapay/callback', { method: 'POST', headers, body }))

  try {
    process.env.MANAGED_PAYMENTS_ENABLED = 'true'
    process.env.PAWAPAY_ENVIRONMENT = 'sandbox'
    process.env.PAWAPAY_API_TOKEN = randomUUID() // jamais une vraie clé — fetch entièrement simulé ci-dessous
    process.env.PAWAPAY_CALLBACK_SECRET = CALLBACK_SECRET
    const authHeaders = { 'content-type': 'application/json', authorization: `Bearer ${CALLBACK_SECRET}` }

    // --- Authentification : jamais permissive dès qu'un jeton réel (donc un environnement non-mock) existe.
    assert.equal((await post(JSON.stringify({ depositId: randomUUID() }), { 'content-type': 'application/json' })).status, 401)
    assert.equal((await post(JSON.stringify({ depositId: randomUUID() }), { 'content-type': 'application/json', authorization: 'Bearer mauvais-secret' })).status, 401)

    // --- Corps malformé, sans identifiant, ou ambigu (deux identifiants à la fois) -> 400.
    assert.equal((await post('{ceci-nest-pas-du-json', authHeaders)).status, 400)
    assert.equal((await post(JSON.stringify({}), authHeaders)).status, 400)
    assert.equal((await post(JSON.stringify({ depositId: randomUUID(), payoutId: randomUUID() }), authHeaders)).status, 400)

    // --- Corps trop volumineux (en-tête menteur, puis taille réelle) -> 413.
    assert.equal((await post('x', { ...authHeaders, 'content-length': '999999' })).status, 413)
    assert.equal((await post(JSON.stringify({ depositId: randomUUID(), padding: 'x'.repeat(20000) }), authHeaders)).status, 413)

    // --- Identifiant local inconnu -> 200 neutre (jamais 404/500 : évite les tempêtes de nouvelles tentatives pawaPay).
    assert.equal((await post(JSON.stringify({ depositId: randomUUID() }), authHeaders)).status, 200)

    // --- Trajet complet : dépôt réel jusqu'au webhook HTTP, jamais confiance dans le corps du callback
    // (le montant/compte confirmés viennent uniquement de la réponse GET authentifiée simulée ci-dessous).
    // La simulation est à état (Map) : un GET avant tout POST doit rester NOT_FOUND, exactement comme
    // la vraie API pawaPay — sinon refreshBookingDepositAttempt sauterait directement à COMPLETED sans
    // jamais passer par le POST /deposits (voir lib/marketplace/booking-payment.ts::refreshBookingDepositAttempt).
    const createdDeposits = new Set<string>()
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const href = String(input)
      if (href.includes('/active-conf')) {
        return Response.json({
          countries: [
            {
              country: 'GAB',
              providers: [
                { provider: 'AIRTEL_GAB', displayName: 'Airtel', currencies: [{ currency: 'XAF', operationTypes: { DEPOSIT: { minAmount: '1', maxAmount: '5000000', status: 'OPERATIONAL', authType: 'PROVIDER_AUTH' } } }] },
              ],
            },
          ],
        })
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        createdDeposits.add(body.depositId)
        return Response.json({ status: 'ACCEPTED', depositId: body.depositId })
      }
      const match = href.match(/\/deposits\/([^/?]+)$/)
      const depositId = decodeURIComponent(match![1])
      if (!createdDeposits.has(depositId)) return Response.json({ status: 'NOT_FOUND' })
      return Response.json({
        status: 'FOUND',
        data: { depositId, status: 'COMPLETED', amount: '9000.00', currency: 'XAF', payer: { type: 'MMO', accountDetails: { phoneNumber: '24174000000', provider: 'AIRTEL_GAB' } } },
      })
    }) as typeof fetch

    const category = await prisma.category.create({ data: { slug: `wh-${suffix}`, name: 'Webhook Test' } })
    ids.categoryId = category.id
    const clientUser = await prisma.user.create({ data: { email: `wh-client-${suffix}@allopro.test`, name: 'Webhook Client' } })
    ids.clientId = clientUser.id
    const proUser = await prisma.user.create({ data: { email: `wh-pro-${suffix}@allopro.test`, name: 'Webhook Professionnel' } })
    ids.professionalUserId = proUser.id
    const professional = await prisma.professional.create({ data: { userId: proUser.id, categoryId: category.id, kycStatus: 'verifie' } })
    ids.professionalId = professional.id
    await requireActingProfessional(proUser.id)

    const sr = await createServiceRequest({ clientId: clientUser.id, categoryId: category.id, title: 'Webhook — test', description: 'Test HTTP du webhook pawaPay.', address: '1 Rue Webhook', quartier: 'Nombakélé' })
    ids.serviceRequestId = sr.id
    await publishServiceRequest(clientUser.id, sr.id)
    const offer = await submitOffer({ professionalId: professional.id, serviceRequestId: sr.id, amount: 9000 })
    ids.offerId = offer.id
    const booking = await acceptOffer(clientUser.id, offer.id)
    ids.bookingId = booking.id

    const prepared = await prepareBookingDepositPayment({ bookingId: booking.id, userId: clientUser.id, method: 'airtel', phone: '074000000' })
    assert(prepared.attempt)
    const submitted = await refreshBookingDepositAttempt(prepared.attempt!, true)
    assert.equal(submitted.attempt.status, 'ACCEPTED')

    const first = await post(JSON.stringify({ depositId: submitted.attempt.id }), authHeaders)
    assert.equal(first.status, 200)
    const paidBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(paidBooking.paymentStatus, 'paye')
    const ledgerAfterFirst = await prisma.ledgerEntry.count({ where: { bookingId: booking.id, type: 'platform_fee' } })
    assert.equal(ledgerAfterFirst, 1)

    // --- Rejeu du même webhook (pawaPay redélivre parfois) -> toujours 200, jamais une seconde écriture.
    const replay = await post(JSON.stringify({ depositId: submitted.attempt.id }), authHeaders)
    assert.equal(replay.status, 200)
    const ledgerAfterReplay = await prisma.ledgerEntry.count({ where: { bookingId: booking.id, type: 'platform_fee' } })
    assert.equal(ledgerAfterReplay, 1)

    console.log(
      'PAWAPAY WEBHOOK (route HTTP) : PASS — authentification stricte, corps malformés/ambigus/trop volumineux rejetés, identifiant inconnu neutre, paiement confirmé de bout en bout, rejeu idempotent.',
    )
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    try {
      await prisma.ledgerEntry.deleteMany({ where: { bookingId: ids.bookingId || undefined } })
      await prisma.paymentProviderEvent.deleteMany({ where: { paymentAttempt: { is: { bookingId: ids.bookingId || undefined } } } })
      await prisma.paymentAttempt.deleteMany({ where: { bookingId: ids.bookingId || undefined } })
      if (ids.bookingId) await prisma.booking.deleteMany({ where: { id: ids.bookingId } })
      if (ids.offerId) {
        await prisma.offerSnapshot.deleteMany({ where: { offerId: ids.offerId } })
        await prisma.offer.deleteMany({ where: { id: ids.offerId } })
      }
      if (ids.serviceRequestId) await prisma.serviceRequest.deleteMany({ where: { id: ids.serviceRequestId } })
      await prisma.auditLog.deleteMany({ where: { targetId: { in: [ids.bookingId, ids.offerId, ids.categoryId].filter(Boolean) } } })
      if (ids.professionalId) await prisma.professional.deleteMany({ where: { id: ids.professionalId } })
      const userIds = [ids.clientId, ids.professionalUserId].filter(Boolean)
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } })
      if (ids.categoryId) await prisma.category.deleteMany({ where: { id: ids.categoryId } })
    } catch (e) {
      console.error('Nettoyage webhook incomplet — vérifier/supprimer manuellement les identifiants ci-dessus.', ids, e)
    }
    await prisma.$disconnect()
  }
}

async function main() {
  await testWireEdgeCases()
  await testWebhookRoute()
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
