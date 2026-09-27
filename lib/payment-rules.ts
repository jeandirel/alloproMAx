import type { Mission, Workspace } from './marketplace'
import { isFinal, transactionLabels, type TransactionStatus, type PaymentKind } from './payment-types'

export function authorizePayment(s: Workspace, m: Mission, kind: PaymentKind) {
  const f = m.paymentFlow
  if (!f) throw new Error('Mission historique simulée : créez une nouvelle réservation pour tester pawaPay.')
  if (m.status === 'litige' || (m.dispute && !m.dispute.decision)) throw new Error('Litige en cours : paiement et remboursement bloqués jusqu’à décision administrative.')
  const p = s.pros.find(p => p.id === m.professionalId)
  if (kind !== 'refund' && (!p || p.kyc !== 'verifie' || p.suspended)) throw new Error('Un professionnel vérifié et actif est requis.')
  if (kind === 'deposit') {
    if (s.role !== 'client' || s.clientSuspended || m.status !== 'en_attente' || f.decision) throw new Error('Encaissement non autorisé pour cette mission.')
  } else {
    if (f.deposit?.status !== 'COMPLETED') throw new Error('Encaissement non confirmé.')
    if (kind === 'refund' && (f.decision !== 'refund' || m.status !== 'annulee' || !['client','administrateur'].includes(s.role))) throw new Error('Remboursement non autorisé.')
    if (kind === 'payout' && (f.decision !== 'release' || !['validee','payee'].includes(m.status) || !(s.role === 'administrateur' || (s.role === 'professionnel' && s.activeProId === m.professionalId)))) throw new Error('Versement non autorisé : validation préalable obligatoire.')
    if (f.settlement && f.settlement.kind !== kind) throw new Error('Une autre opération financière est déjà réservée.')
  }
}

export function applyPaymentStatus(s: Workspace, m: Mission, id: string, kind: PaymentKind, status: TransactionStatus, now = new Date()) {
  const f = m.paymentFlow
  if (!f) throw new Error('Parcours financier manquant.')
  const ref = kind === 'deposit' ? f.deposit : f.settlement
  if (!ref || ref.id !== id) throw new Error('Transaction sans référence correspondante.')
  if (isFinal(ref.status)) return // Ignore duplicates and out-of-order callbacks after a final result.
  const previous = ref.status
  ref.status = status
  if (kind === 'deposit') {
    m.payment = status === 'COMPLETED' ? (f.decision === 'refund' ? 'a_rembourser' : 'bloque') : ['FAILED','REJECTED'].includes(status) ? (m.status === 'annulee' ? 'sans_debit' : 'echec') : 'en_cours'
  } else if (status === 'COMPLETED') {
    // Settlement is only submitted after an irrevocable business decision, never during a dispute.
    m.payment = kind === 'refund' ? 'rembourse' : 'libere'
    if (kind === 'payout') m.status = 'payee'
  } else m.payment = kind === 'refund' ? 'a_rembourser' : 'a_verser'
  if (previous !== status) {
    const text = `${f.mode === 'mock' ? 'Simulation locale' : 'pawaPay sandbox'} · ${kind === 'deposit' ? 'Encaissement' : kind === 'refund' ? 'Remboursement' : 'Versement'} : ${transactionLabels[status]}`
    const at = now.toISOString()
    m.events.push({at,text})
    for (const role of ['client','professionnel'] as const) s.notifications.unshift({id:crypto.randomUUID(),role,proId:role === 'professionnel' ? m.professionalId : undefined,text,at,href:`/reservations/${m.id}`,read:false})
    s.notifications = s.notifications.slice(0,300)
  }
}

export function authorizeRelease(s: Workspace, m: Mission) {
  const p = s.pros.find(p => p.id === m.professionalId)
  if (!p || p.kyc !== 'verifie' || p.suspended) throw new Error('Le professionnel doit être vérifié et actif avant toute libération du paiement.')
  if (m.paymentFlow?.deposit?.status !== 'COMPLETED') throw new Error('Encaissement non confirmé.')
  m.paymentFlow.decision = 'release'
  m.status = 'validee'
  m.payment = 'a_verser'
}
export function authorizeRefund(m: Mission) {
  const f = m.paymentFlow!
  f.decision = 'refund'
  m.payment = f.deposit?.status === 'COMPLETED' ? 'a_rembourser' : f.deposit && !isFinal(f.deposit.status) ? 'en_cours' : 'sans_debit'
}
