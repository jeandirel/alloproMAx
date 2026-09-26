// Rattrapage des tentatives de paiement bloquees (Phase 9) : le webhook pawaPay est le chemin
// nominal, mais une notification peut se perdre (panne reseau, cron pawaPay en retard) et
// l'utilisateur peut ne jamais revenir declencher une verification manuelle. Ce sweep reverifie
// aupres de pawaPay chaque tentative non terminale via la meme fonction refresh*Attempt que la
// route manuelle/le webhook — jamais de logique de statut dupliquee ici.
import { prisma } from '../prisma'
import { isFinal } from '../payment-types'
import { refreshContactUnlockAttempt } from './contact-unlock'
import { refreshBookingDepositAttempt } from './booking-payment'
import { refreshRefundAttempt } from './refunds'
import { refreshPayoutAttempt } from './payouts'

const MAX_ATTEMPTS_PER_SWEEP = 200

export async function sweepStalePaymentAttempts() {
  const stale = await prisma.paymentAttempt.findMany({
    where: { status: { notIn: ['COMPLETED', 'FAILED', 'REJECTED'] } },
    orderBy: { createdAt: 'asc' },
    take: MAX_ATTEMPTS_PER_SWEEP,
  })
  let checked = 0
  let resolved = 0
  let errored = 0
  for (const attempt of stale) {
    checked += 1
    try {
      const result = attempt.contactUnlockId
        ? await refreshContactUnlockAttempt(attempt, true)
        : attempt.kind === 'deposit'
          ? await refreshBookingDepositAttempt(attempt, true)
          : attempt.kind === 'refund'
            ? await refreshRefundAttempt(attempt, true)
            : attempt.kind === 'payout'
              ? await refreshPayoutAttempt(attempt, true)
              : null
      if (result && isFinal(result.attempt.status)) resolved += 1
    } catch (e) {
      errored += 1
      console.error('Rattrapage pawaPay impossible pour une tentative', { paymentAttemptId: attempt.id, kind: attempt.kind, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { checked, resolved, errored }
}
