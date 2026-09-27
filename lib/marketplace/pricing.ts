// Moteur de tarification du marketplace transactionnel — tous les montants sont des entiers FCFA,
// toutes les commissions des entiers en points de base (1 bps = 0.01 %). Jamais de float financier :
// un montant ou un bps non entier est un bug appelant, pas une valeur a arrondir silencieusement.
export const BPS_DENOMINATOR = 10000

function assertAmount(amount: number, label: string): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${label} doit être un entier positif ou nul (reçu : ${amount}).`)
  }
}

function assertBps(bps: number, label: string): void {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) {
    throw new Error(`${label} doit être un entier entre 0 et ${BPS_DENOMINATOR} (reçu : ${bps}).`)
  }
}

// Arrondi deterministe (arrondi au plus proche, .5 vers le haut) — jamais Math.floor/ceil au hasard
// selon l'appelant : un seul point de calcul pour que platformFee + professionalNet == grossAmount.
export function computePlatformFee(grossAmount: number, commissionBps: number): number {
  assertAmount(grossAmount, 'grossAmount')
  assertBps(commissionBps, 'commissionBps')
  return Math.round((grossAmount * commissionBps) / BPS_DENOMINATOR)
}

export function computeProfessionalNet(grossAmount: number, platformFeeAmount: number): number {
  assertAmount(grossAmount, 'grossAmount')
  assertAmount(platformFeeAmount, 'platformFeeAmount')
  const net = grossAmount - platformFeeAmount
  if (net < 0) throw new Error('platformFeeAmount ne peut pas dépasser grossAmount.')
  return net
}

export type OfferSplit = {
  grossAmount: number
  platformCommissionBps: number
  platformFeeAmount: number
  professionalNetAmount: number
}

// Calcule la repartition figee au moment de l'acceptation d'une Offer — c'est ce resultat, et lui
// seul, qui doit être copié dans OfferSnapshot (jamais recalculé après coup).
export function computeOfferSplit(grossAmount: number, commissionBps: number): OfferSplit {
  const platformFeeAmount = computePlatformFee(grossAmount, commissionBps)
  const professionalNetAmount = computeProfessionalNet(grossAmount, platformFeeAmount)
  return { grossAmount, platformCommissionBps: commissionBps, platformFeeAmount, professionalNetAmount }
}

// Montant reellement verse au professionnel : le net de l'OfferSnapshot (fige), diminué du frais
// PSP réel constaté au traitement (providerFeeActual, jamais deviné à l'avance — 0 tant qu'inconnu).
export function computePayoutAmount(professionalNetAmount: number, providerFeeActual = 0): number {
  assertAmount(professionalNetAmount, 'professionalNetAmount')
  assertAmount(providerFeeActual, 'providerFeeActual')
  const payout = professionalNetAmount - providerFeeActual
  if (payout < 0) throw new Error('providerFeeActual ne peut pas dépasser professionalNetAmount.')
  return payout
}

// Resolution de la commission applicable : sous-categorie > categorie > reglage global. Un override
// à 0 est une valeur legitime (commission nulle) — seul `null`/`undefined` signifie "pas d'override".
export function resolveCommissionBps(params: {
  globalBps: number
  categoryOverrideBps?: number | null
  subcategoryOverrideBps?: number | null
}): number {
  const { globalBps, categoryOverrideBps, subcategoryOverrideBps } = params
  const resolved = subcategoryOverrideBps ?? categoryOverrideBps ?? globalBps
  assertBps(resolved, 'commissionBps résolu')
  return resolved
}
