import assert from 'node:assert/strict'
import {
  computePlatformFee,
  computeProfessionalNet,
  computeOfferSplit,
  computePayoutAmount,
  resolveCommissionBps,
} from '../lib/marketplace/pricing'
import {
  assertServiceRequestTransition,
  assertOfferTransition,
  assertContactUnlockTransition,
  assertRefundTransition,
  assertBookingTransition,
  isTerminalOfferStatus,
  isTerminalServiceRequestStatus,
} from '../lib/marketplace/state-machine'

async function main() {
  // Exemple chiffré de la directive produit : 20000 FCFA bruts, commission 700 bps (7%).
  assert.equal(computePlatformFee(20000, 700), 1400)
  assert.equal(computeProfessionalNet(20000, 1400), 18600)
  assert.deepEqual(computeOfferSplit(20000, 700), {
    grossAmount: 20000,
    platformCommissionBps: 700,
    platformFeeAmount: 1400,
    professionalNetAmount: 18600,
  })
  assert.equal(computePayoutAmount(18600, 600), 18000)
  assert.equal(computePayoutAmount(18600), 18600)

  // Bornes et arrondi déterministe.
  assert.equal(computePlatformFee(0, 700), 0)
  assert.equal(computePlatformFee(100, 0), 0)
  assert.equal(computePlatformFee(100, 10000), 100)
  assert.equal(computePlatformFee(999, 50), 5) // round(4.995) -> 5

  // Montants et bps invalides rejetés (jamais de float financier, jamais de bps hors [0,10000]).
  assert.throws(() => computePlatformFee(-1, 700), /entier positif/)
  assert.throws(() => computePlatformFee(1.5, 700), /entier positif/)
  assert.throws(() => computePlatformFee(100, -1), /entier entre/)
  assert.throws(() => computePlatformFee(100, 10001), /entier entre/)
  assert.throws(() => computeProfessionalNet(100, 200), /dépasser/)
  assert.throws(() => computePayoutAmount(100, 200), /dépasser/)

  // Priorité de résolution de commission : sous-catégorie > catégorie > réglage global.
  assert.equal(resolveCommissionBps({ globalBps: 700 }), 700)
  assert.equal(resolveCommissionBps({ globalBps: 700, categoryOverrideBps: null }), 700)
  assert.equal(resolveCommissionBps({ globalBps: 700, categoryOverrideBps: 500 }), 500)
  assert.equal(
    resolveCommissionBps({ globalBps: 700, categoryOverrideBps: 500, subcategoryOverrideBps: 300 }),
    300,
  )
  // Un override à 0 est une valeur légitime (commission nulle), distincte de "pas d'override".
  assert.equal(resolveCommissionBps({ globalBps: 700, categoryOverrideBps: 0 }), 0)
  assert.equal(
    resolveCommissionBps({ globalBps: 700, categoryOverrideBps: 500, subcategoryOverrideBps: 0 }),
    0,
  )

  console.log(
    'MARKETPLACE (tarification) : PASS — commission bps, net professionnel, payout, arrondi déterministe, bornes, priorité des overrides.',
  )

  // ServiceRequest : cycle de vie normal + statuts terminaux.
  assertServiceRequestTransition('draft', 'open')
  assertServiceRequestTransition('open', 'negotiating')
  assertServiceRequestTransition('negotiating', 'awarded')
  assertServiceRequestTransition('awarded', 'closed')
  assertServiceRequestTransition('draft', 'draft') // idempotent, jamais une erreur
  assert.throws(() => assertServiceRequestTransition('draft', 'awarded'), /invalide/)
  assert.throws(() => assertServiceRequestTransition('closed', 'open'), /invalide/)
  assert.equal(isTerminalServiceRequestStatus('closed'), true)
  assert.equal(isTerminalServiceRequestStatus('open'), false)

  // Offer : immuable après acceptation/rejet — aucune transition sortante depuis un état terminal.
  assertOfferTransition('pending', 'accepted')
  assertOfferTransition('pending', 'superseded')
  assert.throws(() => assertOfferTransition('accepted', 'pending'), /invalide/)
  assert.throws(() => assertOfferTransition('rejected', 'pending'), /invalide/)
  assert.equal(isTerminalOfferStatus('accepted'), true)
  assert.equal(isTerminalOfferStatus('pending'), false)

  // ContactUnlock : un échec de paiement peut être retenté, un remboursement ne repart jamais en arrière.
  assertContactUnlockTransition('pending', 'paid')
  assertContactUnlockTransition('failed', 'pending')
  assertContactUnlockTransition('paid', 'refunded')
  assert.throws(() => assertContactUnlockTransition('refunded', 'paid'), /invalide/)
  assert.throws(() => assertContactUnlockTransition('paid', 'pending'), /invalide/)

  // Refund : un échec de traitement PSP peut être retenté depuis "processing".
  assertRefundTransition('requested', 'approved')
  assertRefundTransition('approved', 'processing')
  assertRefundTransition('processing', 'completed')
  assertRefundTransition('failed', 'processing')
  assert.throws(() => assertRefundTransition('rejected', 'approved'), /invalide/)
  assert.throws(() => assertRefundTransition('completed', 'processing'), /invalide/)

  // Booking : un litige peut survenir même après paiement, et se résoudre par validation ou annulation.
  assertBookingTransition('en_attente', 'acceptee')
  assertBookingTransition('acceptee', 'en_route')
  assertBookingTransition('en_route', 'en_cours')
  assertBookingTransition('en_cours', 'a_valider')
  assertBookingTransition('a_valider', 'validee')
  assertBookingTransition('validee', 'payee')
  assertBookingTransition('payee', 'litige')
  assertBookingTransition('litige', 'validee')
  assert.throws(() => assertBookingTransition('payee', 'validee'), /invalide/)
  assert.throws(() => assertBookingTransition('annulee', 'acceptee'), /invalide/)

  console.log(
    'MARKETPLACE (machine à états) : PASS — ServiceRequest, Offer, ContactUnlock, Refund, Booking — transitions valides, invalides et idempotentes.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
