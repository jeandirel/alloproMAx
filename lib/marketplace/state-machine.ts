// Validation centralisee des transitions de statut pour ServiceRequest/Offer/Booking/ContactUnlock/
// Refund — aucun service ne doit muter `status` par une simple affectation de chaine : tout passage
// doit transiter par `assertTransition`, qui lève si la transition n'est pas explicitement autorisée.
// Les tables ci-dessous sont la seule source de verite sur les enchainements possibles.

export type ServiceRequestStatus = 'draft' | 'open' | 'negotiating' | 'awarded' | 'closed' | 'expired' | 'cancelled'
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired' | 'superseded'
export type ContactUnlockStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type RefundStatus = 'requested' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed'
// Reprend exactement les valeurs du modele Payout existant (prisma/schema.prisma) — pas d'etat
// 'processing' distinct : comme ContactUnlock, l'entite reste dans son etat source pendant qu'une
// tentative (PaymentAttempt) est en vol, et ne bascule qu'a la resolution finale de cette tentative.
export type PayoutStatus = 'a_verser' | 'verse' | 'echoue'
// Reprend exactement les valeurs déjà utilisées par le modèle Booking existant (voir lib/marketplace.ts
// Status et prisma/schema.prisma) — le marketplace transactionnel réutilise le même champ `status`.
export type BookingStatus =
  | 'en_attente'
  | 'acceptee'
  | 'en_route'
  | 'en_cours'
  | 'a_valider'
  | 'validee'
  | 'payee'
  | 'annulee'
  | 'litige'

type TransitionTable<S extends string> = Record<S, readonly S[]>

const SERVICE_REQUEST_TRANSITIONS: TransitionTable<ServiceRequestStatus> = {
  draft: ['open', 'cancelled'],
  open: ['negotiating', 'awarded', 'expired', 'cancelled'],
  negotiating: ['awarded', 'open', 'expired', 'cancelled'],
  awarded: ['closed', 'cancelled'],
  closed: [],
  expired: [],
  cancelled: [],
}

const OFFER_TRANSITIONS: TransitionTable<OfferStatus> = {
  pending: ['accepted', 'rejected', 'withdrawn', 'expired', 'superseded'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
  superseded: [],
}

const CONTACT_UNLOCK_TRANSITIONS: TransitionTable<ContactUnlockStatus> = {
  pending: ['paid', 'failed'],
  paid: ['refunded'],
  failed: ['pending'],
  refunded: [],
}

const REFUND_TRANSITIONS: TransitionTable<RefundStatus> = {
  requested: ['approved', 'rejected'],
  approved: ['processing', 'failed'],
  processing: ['completed', 'failed'],
  rejected: [],
  completed: [],
  failed: ['processing'],
}

const PAYOUT_TRANSITIONS: TransitionTable<PayoutStatus> = {
  a_verser: ['verse', 'echoue'],
  verse: [],
  echoue: ['a_verser'],
}

// Reservation reelle : acceptee/en_route/en_cours peuvent aussi être annulées (litige déjà géré
// séparément par a_valider/validee). Repris des enchaînements déjà observés dans lib/payment-rules.ts
// (authorizeRelease -> validee, authorizeRefund -> annulee) et étendu pour couvrir tous les statuts.
const BOOKING_TRANSITIONS: TransitionTable<BookingStatus> = {
  en_attente: ['acceptee', 'annulee'],
  acceptee: ['en_route', 'annulee'],
  en_route: ['en_cours', 'annulee'],
  en_cours: ['a_valider', 'litige', 'annulee'],
  a_valider: ['validee', 'litige'],
  validee: ['payee', 'litige'],
  payee: ['litige'],
  annulee: [],
  litige: ['validee', 'annulee'],
}

function assertTransition<S extends string>(kind: string, table: TransitionTable<S>, from: S, to: S): void {
  if (from === to) return // idempotent : reappliquer le même statut n'est jamais une erreur
  const allowed = table[from]
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Transition ${kind} invalide : "${from}" -> "${to}" n'est pas autorisée.`)
  }
}

export function assertServiceRequestTransition(from: ServiceRequestStatus, to: ServiceRequestStatus): void {
  assertTransition('ServiceRequest', SERVICE_REQUEST_TRANSITIONS, from, to)
}

export function assertOfferTransition(from: OfferStatus, to: OfferStatus): void {
  assertTransition('Offer', OFFER_TRANSITIONS, from, to)
}

export function assertContactUnlockTransition(from: ContactUnlockStatus, to: ContactUnlockStatus): void {
  assertTransition('ContactUnlock', CONTACT_UNLOCK_TRANSITIONS, from, to)
}

export function assertRefundTransition(from: RefundStatus, to: RefundStatus): void {
  assertTransition('Refund', REFUND_TRANSITIONS, from, to)
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  assertTransition('Booking', BOOKING_TRANSITIONS, from, to)
}

export function assertPayoutTransition(from: PayoutStatus, to: PayoutStatus): void {
  assertTransition('Payout', PAYOUT_TRANSITIONS, from, to)
}

export function isTerminalOfferStatus(status: OfferStatus): boolean {
  return OFFER_TRANSITIONS[status].length === 0
}

export function isTerminalServiceRequestStatus(status: ServiceRequestStatus): boolean {
  return SERVICE_REQUEST_TRANSITIONS[status].length === 0
}
