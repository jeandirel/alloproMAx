import { randomUUID } from 'node:crypto'
import { Prisma, type PaymentTransaction } from '@prisma/client'
import { prisma } from './prisma'
import type { Workspace } from './marketplace'
import { paymentMode, normalizePhone, providerOptions, initiate, checkStatus, ProviderError } from './pawapay'
import { authorizePayment, applyPaymentStatus } from './payment-rules'
import { isFinal, type PaymentKind, type TransactionStatus } from './payment-types'

type Tx = Prisma.TransactionClient
async function lockedWorkspace(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "DemoWorkspace" WHERE "userId" = ${userId} FOR UPDATE`
  const row = await tx.demoWorkspace.findUniqueOrThrow({where:{userId}})
  return {row, state:row.state as unknown as Workspace}
}
async function saveWorkspace(tx: Tx, row: {id:string;version:number}, state: Workspace) {
  const saved = await tx.demoWorkspace.updateMany({where:{id:row.id,version:row.version},data:{state:state as unknown as Prisma.InputJsonValue,version:{increment:1}}})
  if (!saved.count) throw new Error('Les données ont changé. Actualisez avant de réessayer.')
}
export async function preparePayment(userId: string, missionId: string, kind: PaymentKind, method?: 'airtel'|'moov', phone?: string, refundAmount?: number) {
  const mode = paymentMode()
  // All network I/O is outside the database transaction.
  const options = await providerOptions(kind)
  return prisma.$transaction(async tx => {
    const {row,state} = await lockedWorkspace(tx,userId)
    const m = state.missions.find(m=>m.id===missionId)
    if (!m) throw new Error('Mission introuvable.')
    authorizePayment(state,m,kind)
    const f = m.paymentFlow!
    if (f.mode !== mode) throw new Error('Cette réservation appartient à un autre mode de test. Créez une nouvelle réservation pour le mode actuellement configuré.')
    const previous = await tx.paymentTransaction.findFirst({where:{userId,missionId,kind},orderBy:{attempt:'desc'}})
    if (previous && !['FAILED','REJECTED'].includes(previous.status)) return previous
    if ((previous?.attempt || 0) >= 10) throw new Error('Limite de tentatives atteinte pour cette opération. Contactez l’administrateur.')
    let selected = method || m.paymentMethod
    let number = kind === 'payout' ? state.pros.find(p=>p.id===m.professionalId)!.phone : phone || f.phone
    let depositId: string|null = null
    if (refundAmount !== undefined) {
      if (kind !== 'refund') throw new Error('Le montant de remboursement ne peut être précisé que pour une opération de remboursement.')
      if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) throw new Error('Montant de remboursement invalide : il doit être un entier positif.')
    }
    if (kind === 'refund') {
      const deposit = await tx.paymentTransaction.findFirst({where:{id:f.deposit!.id,userId,missionId,kind:'deposit',status:'COMPLETED',mode}})
      if (!deposit) throw new Error('Encaissement confirmé introuvable dans le journal financier.')
      if (refundAmount !== undefined && refundAmount > deposit.amount) throw new Error('Le montant du remboursement dépasse l’encaissement d’origine.')
      selected = m.paymentMethod; number = deposit.phoneNumber; depositId = deposit.id
    } else if (kind === 'payout') {
      const deposit = await tx.paymentTransaction.findFirst({where:{id:f.deposit!.id,userId,missionId,kind:'deposit',status:'COMPLETED',mode}})
      if (!deposit) throw new Error('Encaissement confirmé introuvable dans le journal financier.')
      depositId = deposit.id
    }
    const option = options.find(o=>o.method===selected)
    if (!option) throw new Error('Cet opérateur ou cette opération n’est pas activé dans votre configuration pawaPay au Gabon.')
    if (kind === 'payout' && !number) throw new Error('Renseignez le numéro Mobile Money du professionnel dans son dossier avant le versement.')
    number = normalizePhone(number)
    const amount = kind === 'payout' ? m.basePrice : kind === 'refund' && refundAmount !== undefined ? refundAmount : m.totalPrice
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount < option.min || amount > option.max) throw new Error('Montant hors des limites autorisées par cet opérateur.')
    const transaction = await tx.paymentTransaction.create({data:{id:randomUUID(),userId,missionId,kind,attempt:(previous?.attempt||0)+1,mode,amount,provider:option.provider,phoneNumber:number,depositId}})
    // Contrairement à PaymentTransaction/DemoWorkspace.userId, AuditLog.actorId a une contrainte de
    // clé étrangère stricte vers User. Le JWT de session n'est jamais revérifié contre la table User
    // (cf. auth.ts) ; si la ligne a été purgée entre-temps, un actorId invalide ferait échouer cette
    // écriture avec une violation de clé étrangère et annulerait toute la transaction de paiement.
    // On vérifie donc son existence ici plutôt que de faire confiance à l'identifiant du JWT.
    const actorExists = await tx.user.findUnique({where:{id:userId},select:{id:true}})
    await tx.auditLog.create({data:{actorId:actorExists?userId:null,actorRole:state.role,action:'payment.transaction.created',targetType:'PaymentTransaction',targetId:transaction.id,metadata:{kind,status:transaction.status,amount,previousStatus:null}}})
    if (kind === 'deposit') {f.deposit={id:transaction.id,status:'CREATED'};f.phone=number;m.paymentMethod=selected;m.payment='en_cours'}
    else {f.settlement={id:transaction.id,status:'CREATED',kind};m.payment=kind==='refund'?'a_rembourser':'a_verser'}
    m.events.push({at:new Date().toISOString(),text:`${mode==='mock'?'Simulation locale':'pawaPay sandbox'} · demande de ${kind==='deposit'?'paiement':kind==='refund'?'remboursement':'versement'} enregistrée`})
    await saveWorkspace(tx,row,state)
    return transaction
  },{maxWait:5000,timeout:10000})
}
async function recordStatus(t: PaymentTransaction, status: TransactionStatus, failureCode: string|null) {
  return prisma.$transaction(async tx => {
    const {row,state} = await lockedWorkspace(tx,t.userId)
    const current = await tx.paymentTransaction.findUniqueOrThrow({where:{id:t.id}})
    if (isFinal(current.status)) return current
    const m = state.missions.find(m=>m.id===t.missionId)
    if (!m) throw new Error('Mission introuvable pour le rapprochement.')
    applyPaymentStatus(state,m,t.id,t.kind as PaymentKind,status)
    const result = await tx.paymentTransaction.update({where:{id:t.id},data:{status,failureCode}})
    // actorId is null: this transition can originate from an authenticated pawaPay webhook/reconciliation
    // as well as a user-triggered refresh, and this function has no reliable caller-identity context.
    await tx.auditLog.create({data:{actorId:null,actorRole:'system',action:'payment.transaction.status_changed',targetType:'PaymentTransaction',targetId:t.id,metadata:{kind:t.kind,status,amount:current.amount,previousStatus:current.status}}})
    await saveWorkspace(tx,row,state)
    return result
  },{maxWait:5000,timeout:10000})
}
export async function refreshPayment(t: PaymentTransaction, allowSubmission = false) {
  if (isFinal(t.status)) return {transaction:t,message:''}
  if (t.mode === 'mock') {
    if (t.status === 'CREATED' && allowSubmission) t = await recordStatus(t,'ACCEPTED',null)
    return {transaction:t,message:'Simulation locale : choisissez le résultat à tester.'}
  }
  paymentMode()
  // Durable per-transaction throttle; duplicate callbacks cannot amplify outbound requests.
  const claimed = await prisma.paymentTransaction.updateMany({where:{id:t.id,status:{notIn:['COMPLETED','FAILED','REJECTED']},OR:[{checkedAt:null},{checkedAt:{lt:new Date(Date.now()-20000)}}]},data:{checkedAt:new Date()}})
  if (!claimed.count) return {transaction:await prisma.paymentTransaction.findUniqueOrThrow({where:{id:t.id}}),message:'Vérification déjà en cours ou récente. Réessayez dans quelques instants.'}
  try {
    let result = await checkStatus(t)
    if (!result && allowSubmission && ['CREATED','UNKNOWN'].includes(t.status)) result = await initiate(t)
    if (result) return {transaction:await recordStatus(t,result.status,result.failureCode),message:''}
    return {transaction:t,message:'pawaPay ne retrouve pas encore cette opération. Utilisez « Reprendre la transmission » : le même identifiant sera conservé.'}
  } catch(e) {
    const code = e instanceof ProviderError ? e.code : 'INVALID_RESPONSE'
    console.error('Vérification pawaPay impossible', {transactionId:t.id,code})
    if (allowSubmission && ['CREATED','UNKNOWN'].includes(t.status)) t = await recordStatus(t,'UNKNOWN',code)
    return {transaction:t,message:e instanceof ProviderError ? e.message : 'Réponse pawaPay non conforme. Le paiement reste à vérifier.'}
  }
}
export async function simulatePayment(t: PaymentTransaction, outcome: 'COMPLETED'|'FAILED') {
  paymentMode() // Explicit production settings are always blocked.
  if (t.mode !== 'mock') throw new Error('Les résultats sandbox ne peuvent pas être simulés depuis l’application.')
  return recordStatus(t,outcome,outcome==='FAILED'?'SIMULATION_FAILURE':null)
}
export async function getMissionForPayment(userId: string, missionId: string) {
  const row = await prisma.demoWorkspace.findUnique({where:{userId}})
  const state = row?.state as unknown as Workspace | undefined
  const mission = state?.missions.find(m=>m.id===missionId)
  if (!state || !mission || (state.role==='professionnel' && state.activeProId!==mission.professionalId)) throw new Error('Mission inaccessible.')
  return {state,mission}
}
export function publicTransaction(t: PaymentTransaction) {
  return {id:t.id,missionId:t.missionId,kind:t.kind,attempt:t.attempt,mode:t.mode,status:t.status,amount:t.amount,currency:t.currency,provider:t.provider,phone:`••••${t.phoneNumber.slice(-4)}`,failureCode:t.failureCode,createdAt:t.createdAt.toISOString()}
}
