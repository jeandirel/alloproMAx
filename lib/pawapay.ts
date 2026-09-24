import { z } from 'zod'
import type { PaymentTransaction } from '@prisma/client'
import type { PaymentMode, PaymentKind, PaymentOption, TransactionStatus } from './payment-types'

// Only the sandbox host is reachable from this isolated, role-switchable demo.
const SANDBOX = 'https://api.sandbox.pawapay.io/v2'
export function paymentMode(): PaymentMode {
  const environment = process.env.PAWAPAY_ENVIRONMENT || 'sandbox'
  if (!['sandbox', 'mock'].includes(environment)) throw new Error('Paiements réels verrouillés : les comptes et rôles de cette application sont des démonstrations.')
  return environment === 'mock' || !process.env.PAWAPAY_API_TOKEN?.trim() ? 'mock' : 'sandbox'
}
export function normalizePhone(input: string) {
  let n = input.replace(/[\s()+-]/g, '').replace(/^00241/, '241')
  if (n.startsWith('241')) n = n.slice(3)
  if (n.startsWith('0')) n = n.slice(1)
  if (!/^[67][0-9]{7}$/.test(n)) throw new Error('Numéro Mobile Money gabonais invalide.')
  return `241${n}`
}
export class ProviderError extends Error {
  constructor(message: string, public readonly code: string) { super(message) }
}
async function api(path: string, body?: unknown): Promise<unknown> {
  if (paymentMode() !== 'sandbox') throw new ProviderError('Clé pawaPay de test non configurée.', 'CONFIGURATION')
  let response: Response
  try {
    response = await fetch(`${SANDBOX}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${process.env.PAWAPAY_API_TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error' })
  } catch { throw new ProviderError('pawaPay ne répond pas. Le résultat reste à vérifier, sans nouveau débit automatique.', 'NETWORK') }
  if (!response.ok) {
    // Never log response bodies, headers or tokens. An HTTP error is not proof of payment failure.
    const message = [401,403].includes(response.status) ? 'Vérifiez la clé sandbox et ses autorisations dans pawaPay.' : response.status === 429 ? 'pawaPay limite temporairement les demandes. Réessayez plus tard.' : 'Réponse pawaPay indisponible. Actualisez le statut avant toute nouvelle tentative.'
    throw new ProviderError(message, `HTTP_${response.status}`)
  }
  try { return await response.json() } catch { throw new ProviderError('Réponse pawaPay illisible. Vérification requise.', 'INVALID_RESPONSE') }
}
const operation = z.object({ minAmount: z.string(), maxAmount: z.string(), status: z.string(), authType: z.string().optional() })
const activeConfig = z.object({ signatureConfiguration:z.object({signedRequestsOnly:z.boolean().optional()}).optional(), countries: z.array(z.object({ country: z.string(), providers: z.array(z.object({ provider: z.string(), displayName: z.string(), currencies: z.array(z.object({ currency: z.string(), operationTypes: z.object({DEPOSIT:operation.optional(),PAYOUT:operation.optional(),REFUND:operation.optional()}) })) })) })) })
export function extractOptions(raw: unknown, kind: PaymentKind): PaymentOption[] {
  const data = activeConfig.parse(raw)
  if (data.signatureConfiguration?.signedRequestsOnly) throw new ProviderError('Votre compte impose des signatures sortantes. Cette intégration utilise le jeton Bearer : autorisez ce mode dans le compte sandbox avant de tester.', 'SIGNATURES_REQUIRED')
  const options: PaymentOption[] = []
  for (const country of data.countries.filter(c => c.country === 'GAB')) for (const p of country.providers) {
    // Do not invent a Moov provider code: enable it only if the merchant configuration returns it.
    const method = p.provider === 'AIRTEL_GAB' ? 'airtel' : /^MOOV(?:_[A-Z]+)*_GAB$/.test(p.provider) ? 'moov' : null
    const op = p.currencies.find(c => c.currency === 'XAF')?.operationTypes[kind.toUpperCase() as 'DEPOSIT'|'PAYOUT'|'REFUND']
    if (!method || !op || op.status !== 'OPERATIONAL' || (kind === 'deposit' && op.authType !== 'PROVIDER_AUTH')) continue
    const min = Number(op.minAmount), max = Number(op.maxAmount)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) continue
    options.push({ method, provider: p.provider, name: p.displayName, min, max })
  }
  return options
}
export async function providerOptions(kind: PaymentKind): Promise<PaymentOption[]> {
  if (paymentMode() === 'mock') return [{ method:'airtel', provider:'MOCK_AIRTEL_GAB', name:'Airtel Money (simulation locale)', min:1, max:13000000 }, { method:'moov', provider:'MOCK_MOOV_GAB', name:'Moov Money (simulation locale uniquement)', min:1, max:13000000 }]
  return extractOptions(await api('/active-conf?country=GAB'), kind)
}
export function transactionBody(t: PaymentTransaction) {
  const common = { amount: String(t.amount), currency: t.currency, clientReferenceId: t.missionId }
  if (t.kind === 'refund') {
    if (!t.depositId) throw new Error('Encaissement source manquant.')
    return { ...common, refundId:t.id, depositId:t.depositId }
  }
  const account = { type:'MMO', accountDetails:{ phoneNumber:t.phoneNumber, provider:t.provider } }
  if (t.kind === 'deposit') return { ...common, depositId:t.id, payer:account, customerMessage:'Allo Pro service' }
  if (t.kind === 'payout') return { ...common, payoutId:t.id, recipient:account, customerMessage:'Allo Pro mission' }
  throw new Error('Opération inconnue.')
}
const initiation = z.object({ status:z.enum(['ACCEPTED','REJECTED','DUPLICATE_IGNORED']), depositId:z.string().optional(), payoutId:z.string().optional(), refundId:z.string().optional(), failureReason:z.object({failureCode:z.string()}).optional() })
export async function initiate(t: PaymentTransaction): Promise<{status:TransactionStatus; failureCode:string|null}> {
  if (t.mode !== 'sandbox' || paymentMode() !== 'sandbox') throw new Error('Cette transaction ne correspond pas au mode pawaPay configuré.')
  const parsed = initiation.parse(await api(`/${t.kind}s`, transactionBody(t)))
  if (parsed[`${t.kind}Id` as 'depositId'|'payoutId'|'refundId'] !== t.id) throw new ProviderError('Identifiant pawaPay incohérent.', 'MISMATCH')
  return { status:parsed.status === 'DUPLICATE_IGNORED' ? 'UNKNOWN' : parsed.status, failureCode:parsed.failureReason?.failureCode?.slice(0,100) || null }
}
const statusResponse = z.object({ status:z.enum(['FOUND','NOT_FOUND']), data:z.record(z.unknown()).optional() })
const statusValue = z.enum(['ACCEPTED','PROCESSING','IN_RECONCILIATION','ENQUEUED','SUBMITTED','COMPLETED','FAILED'])
export function verifyStatus(raw: unknown, t: PaymentTransaction): { status:TransactionStatus; failureCode:string|null } | null {
  const result = statusResponse.parse(raw)
  if (result.status === 'NOT_FOUND') return null
  const d = result.data
  if (!d || d[`${t.kind}Id`] !== t.id || d.currency !== t.currency || typeof d.amount !== 'string' || !/^\d+(\.\d{1,2})?$/.test(d.amount) || Number(d.amount) !== t.amount) throw new ProviderError('Les références ou le montant pawaPay ne correspondent pas à la transaction.', 'MISMATCH')
  // v2 refund status returns recipient, not a mandatory depositId. The source link is frozen locally before POST.
  if (t.kind === 'refund' && d.depositId !== undefined && d.depositId !== t.depositId) throw new ProviderError('Remboursement sans encaissement source correspondant.', 'MISMATCH')
  const account = z.object({type:z.literal('MMO'),accountDetails:z.object({phoneNumber:z.string(),provider:z.string()})}).parse(d[t.kind === 'deposit' ? 'payer' : 'recipient'])
  if (account.accountDetails.phoneNumber !== t.phoneNumber || account.accountDetails.provider !== t.provider) throw new ProviderError('Compte Mobile Money incohérent.', 'MISMATCH')
  const failure = z.object({failureCode:z.string()}).safeParse(d.failureReason)
  return {status:statusValue.parse(d.status),failureCode:failure.success ? failure.data.failureCode.slice(0,100) : null}
}
export async function checkStatus(t: PaymentTransaction) {
  if (t.mode !== 'sandbox' || paymentMode() !== 'sandbox') throw new Error('Configurez la clé sandbox pour vérifier cette transaction.')
  return verifyStatus(await api(`/${t.kind}s/${encodeURIComponent(t.id)}`), t)
}
