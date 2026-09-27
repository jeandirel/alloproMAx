// Libellés + styles des statuts réels du backend marketplace (Phases 1-9). Distinct de
// components/market-ui.tsx::StatusBadge, qui porte sur les statuts de l'ANCIEN système démo.

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  info: 'bg-sky-50 text-sky-800',
  warning: 'bg-amber-100 text-amber-900',
  success: 'bg-emerald-50 text-emerald-900',
  danger: 'bg-red-50 text-red-800',
}

export function toneClasses(tone: StatusTone): string {
  return TONE_CLASSES[tone]
}

type StatusMap = Record<string, { label: string; tone: StatusTone }>

export const serviceRequestStatus: StatusMap = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  open: { label: 'Ouverte', tone: 'info' },
  negotiating: { label: 'En négociation', tone: 'warning' },
  awarded: { label: 'Attribuée', tone: 'success' },
  closed: { label: 'Clôturée', tone: 'neutral' },
  expired: { label: 'Expirée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
}

export const offerStatus: StatusMap = {
  pending: { label: 'En attente', tone: 'warning' },
  accepted: { label: 'Acceptée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'danger' },
  withdrawn: { label: 'Retirée', tone: 'neutral' },
  expired: { label: 'Expirée', tone: 'neutral' },
  superseded: { label: 'Remplacée', tone: 'neutral' },
}

export const bookingStatus: StatusMap = {
  en_attente: { label: 'En attente de paiement', tone: 'warning' },
  acceptee: { label: 'Acceptée', tone: 'info' },
  en_route: { label: 'Le professionnel arrive', tone: 'info' },
  en_cours: { label: 'Mission en cours', tone: 'info' },
  a_valider: { label: 'À valider', tone: 'warning' },
  validee: { label: 'Validée', tone: 'success' },
  payee: { label: 'Payée au professionnel', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'neutral' },
  litige: { label: 'Litige', tone: 'danger' },
}

export const paymentStatus: StatusMap = {
  a_payer: { label: 'À payer', tone: 'warning' },
  paye: { label: 'Payé', tone: 'success' },
}

export const paymentAttemptStatus: StatusMap = {
  CREATED: { label: 'Initialisation…', tone: 'neutral' },
  ACCEPTED: { label: 'Envoyé au fournisseur', tone: 'info' },
  PROCESSING: { label: 'En cours de traitement', tone: 'info' },
  IN_RECONCILIATION: { label: 'Vérification en cours', tone: 'info' },
  ENQUEUED: { label: 'En file d’attente', tone: 'info' },
  SUBMITTED: { label: 'Soumis', tone: 'info' },
  UNKNOWN: { label: 'Statut inconnu', tone: 'warning' },
  COMPLETED: { label: 'Terminé', tone: 'success' },
  FAILED: { label: 'Échoué', tone: 'danger' },
  REJECTED: { label: 'Rejeté', tone: 'danger' },
}

export const disputeStatus: StatusMap = {
  ouvert: { label: 'Ouvert', tone: 'danger' },
  resolu: { label: 'Résolu', tone: 'success' },
}

export const contactUnlockStatus: StatusMap = {
  pending: { label: 'En attente de paiement', tone: 'warning' },
  paid: { label: 'Débloqué', tone: 'success' },
  failed: { label: 'Échoué', tone: 'danger' },
  refunded: { label: 'Remboursé', tone: 'neutral' },
}

export const refundStatus: StatusMap = {
  requested: { label: 'Demandé', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'info' },
  processing: { label: 'En cours', tone: 'info' },
  completed: { label: 'Remboursé', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
  failed: { label: 'Échoué', tone: 'danger' },
}

export const payoutStatus: StatusMap = {
  a_verser: { label: 'À verser', tone: 'warning' },
  verse: { label: 'Versé', tone: 'success' },
  echoue: { label: 'Échoué', tone: 'danger' },
}

export const ledgerEntryTypeLabel: Record<string, string> = {
  platform_fee: 'Commission plateforme',
  professional_payout: 'Versement professionnel',
  refund: 'Remboursement',
  contact_unlock_fee: 'Frais de déblocage de contact',
  provider_fee_actual: 'Frais réel du fournisseur',
}

export function isTerminalPaymentAttemptStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'REJECTED'
}

export const PAYMENT_ATTEMPT_TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED'] as const
