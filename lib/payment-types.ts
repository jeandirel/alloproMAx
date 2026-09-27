export type PaymentMode = 'mock' | 'sandbox'
export type PaymentKind = 'deposit' | 'payout' | 'refund'
export type TransactionStatus = 'CREATED' | 'ACCEPTED' | 'PROCESSING' | 'IN_RECONCILIATION' | 'ENQUEUED' | 'SUBMITTED' | 'UNKNOWN' | 'COMPLETED' | 'FAILED' | 'REJECTED'
export type PaymentRef = { id: string; status: TransactionStatus }
export type PaymentFlow = { mode: PaymentMode; phone: string; deposit: PaymentRef | null; settlement: (PaymentRef & { kind: 'payout' | 'refund' }) | null; decision: 'release' | 'refund' | null }
export const transactionLabels: Record<TransactionStatus,string> = { CREATED:'À transmettre', ACCEPTED:'Demande acceptée, confirmation attendue', PROCESSING:'Traitement en cours', IN_RECONCILIATION:'Vérification opérateur en cours', ENQUEUED:'En file d’attente', SUBMITTED:'Transmise à l’opérateur', UNKNOWN:'Statut à vérifier — ne pas payer à nouveau', COMPLETED:'Confirmée', FAILED:'Échouée', REJECTED:'Refusée' }
export const paymentLabels = { a_payer:'À payer', en_cours:'Encaissement en cours', echec:'Échec du paiement', bloque:'Encaissé · versement bloqué', a_verser:'Validé · à verser', a_rembourser:'Remboursement à effectuer', libere:'Versé', rembourse:'Remboursé', sans_debit:'Annulé · aucun débit confirmé' }
export const isFinal = (status: string) => ['COMPLETED','FAILED','REJECTED'].includes(status)
export type PaymentOption = { method: 'airtel' | 'moov'; provider: string; name: string; min: number; max: number }
export type PaymentConfig = { mode: PaymentMode | 'blocked'; configured: boolean; message: string; options: PaymentOption[] }
