import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PaymentTransaction } from '@prisma/client'
import { initialWorkspace } from '../lib/marketplace'
import { applyAction, settleDue } from '../lib/marketplace-engine'
import { applyPaymentStatus, authorizePayment } from '../lib/payment-rules'
import { normalizePhone, extractOptions, transactionBody, verifyStatus, paymentMode, initiate, checkStatus } from '../lib/pawapay'

async function main() {
  const now = new Date('2026-09-23T12:00:00Z')
  let s = initialWorkspace('Test paiement','payment@example.com',now)
  const act = (action: unknown) => {const r=applyAction(s,action,now);s=r.state;return r.result}
  const book = () => act({type:'book',proId:'1',service:s.pros[0].services[0].nom,description:'Test financier',address:'Test',quartier:'Akanda',accessNotes:'',date:'',urgent:true,paymentMethod:'airtel',phone:'074345678',photos:[],location:null,requestKey:randomUUID()})!
  const id=book();let m=s.missions[0]
  assert.equal(m.payment,'a_payer')
  act({type:'role',role:'professionnel',proId:'1'})
  assert.throws(()=>act({type:'transition',missionId:id,action:'accept'}),/paiement doit être confirmé/)
  act({type:'role',role:'client'});m=s.missions[0]
  authorizePayment(s,m,'deposit')
  const depositId=randomUUID();m.paymentFlow!.deposit={id:depositId,status:'CREATED'}
  applyPaymentStatus(s,m,depositId,'deposit','ACCEPTED',now);assert.equal(m.payment,'en_cours')
  applyPaymentStatus(s,m,depositId,'deposit','COMPLETED',now);assert.equal(m.payment,'bloque')
  const events=m.events.length
  applyPaymentStatus(s,m,depositId,'deposit','FAILED',now);assert.equal(m.payment,'bloque');assert.equal(m.events.length,events)
  act({type:'role',role:'professionnel',proId:'1'})
  for(const action of ['accept','route','start']) act({type:'transition',missionId:id,action})
  act({type:'transition',missionId:id,action:'finish',before:[{id:'before',name:'avant.png'}],after:[{id:'after',name:'apres.png'}],report:'Contrôle terminé.'})
  act({type:'role',role:'client'});act({type:'dispute',missionId:id,reason:'Contrôle nécessaire',evidence:[]})
  for(const kind of ['deposit','refund','payout'] as const) assert.throws(()=>authorizePayment(s,s.missions[0],kind),/Litige/)
  settleDue(s,new Date('2027-01-01'));assert.equal(s.missions[0].status,'litige')
  act({type:'role',role:'administrateur'});act({type:'resolve',missionId:id,decision:'release',reason:'Prestation contrôlée.'})
  m=s.missions[0];assert.equal(m.status,'validee');assert.equal(m.payment,'a_verser')
  s.pros[0].suspended=true;assert.throws(()=>authorizePayment(s,m,'payout'),/vérifié/);s.pros[0].suspended=false
  authorizePayment(s,m,'payout');m.paymentFlow!.settlement={id:randomUUID(),kind:'payout',status:'CREATED'}
  applyPaymentStatus(s,m,m.paymentFlow!.settlement.id,'payout','ACCEPTED',now);assert.equal(m.payment,'a_verser')
  applyPaymentStatus(s,m,m.paymentFlow!.settlement.id,'payout','COMPLETED',now);assert.equal(m.payment,'libere');assert.equal(m.status,'payee')
  assert.throws(()=>authorizePayment(s,m,'refund'),/Remboursement non autorisé/)
  act({type:'role',role:'client'});const lateId=book();m=s.missions[0];m.paymentFlow!.deposit={id:randomUUID(),status:'ACCEPTED'};m.payment='en_cours'
  act({type:'transition',missionId:lateId,action:'cancel'});m=s.missions[0];assert.equal(m.payment,'en_cours')
  applyPaymentStatus(s,m,m.paymentFlow!.deposit!.id,'deposit','COMPLETED',now);assert.equal(m.payment,'a_rembourser');assert.equal(m.status,'annulee')
  authorizePayment(s,m,'refund');m.paymentFlow!.settlement={id:randomUUID(),kind:'refund',status:'CREATED'}
  applyPaymentStatus(s,m,m.paymentFlow!.settlement.id,'refund','FAILED',now);assert.equal(m.payment,'a_rembourser')
  const noPay=book();act({type:'transition',missionId:noPay,action:'cancel'});assert.equal(s.missions[0].payment,'sans_debit')
  for(const n of ['074345678','74345678','+241 074 34 56 78','0024174345678','24174345678']) assert.equal(normalizePhone(n),'24174345678')
  assert.throws(()=>normalizePhone('123'),/invalide/)
  const op={status:'OPERATIONAL',minAmount:'100',maxAmount:'1000000',authType:'PROVIDER_AUTH'}
  const rawConfig={countries:[{country:'GAB',providers:[{provider:'AIRTEL_GAB',displayName:'Airtel',currencies:[{currency:'XAF',operationTypes:{DEPOSIT:op,PAYOUT:op,REFUND:op,USSD_DEPOSIT:{callbackUrl:'ignored'}}}]}]}]}
  assert.deepEqual(extractOptions(rawConfig,'deposit').map(p=>p.method),['airtel'])
  const closed=structuredClone(rawConfig);closed.countries[0].providers[0].currencies[0].operationTypes.DEPOSIT.status='CLOSED';assert.equal(extractOptions(closed,'deposit').length,0)
  assert.throws(()=>extractOptions({...rawConfig,signatureConfiguration:{signedRequestsOnly:true}},'deposit'),/signatures/)
  const t:PaymentTransaction={id:randomUUID(),userId:'test',missionId:id,kind:'deposit',attempt:1,mode:'sandbox',status:'CREATED',amount:8400,currency:'XAF',provider:'AIRTEL_GAB',phoneNumber:'24174345678',depositId:null,failureCode:null,checkedAt:null,createdAt:now,updatedAt:now}
  const payload=transactionBody(t);assert.equal(payload.amount,'8400');assert.equal(payload.currency,'XAF')
  const account={type:'MMO',accountDetails:{phoneNumber:t.phoneNumber,provider:t.provider}}
  const response={status:'FOUND',data:{depositId:t.id,status:'COMPLETED',amount:'8400.00',currency:'XAF',payer:account}}
  assert.equal(verifyStatus(response,t)?.status,'COMPLETED')
  for(const changes of [{amount:'1'},{currency:'XOF'},{depositId:randomUUID()},{payer:{...account,accountDetails:{...account.accountDetails,phoneNumber:'24100000000'}}}]) assert.throws(()=>verifyStatus({status:'FOUND',data:{...response.data,...changes}},t),/correspondent|incohérent/)
  assert.equal(verifyStatus({status:'NOT_FOUND'},t),null)
  const refund={...t,id:randomUUID(),kind:'refund',depositId:t.id}
  const refundBody=transactionBody(refund)
  assert('depositId' in refundBody);assert.equal(refundBody.depositId,t.id)
  assert.equal(verifyStatus({status:'FOUND',data:{refundId:refund.id,status:'COMPLETED',amount:'8400',currency:'XAF',recipient:account}},refund)?.status,'COMPLETED')
  const originalFetch=globalThis.fetch, originalEnv=process.env.PAWAPAY_ENVIRONMENT, originalToken=process.env.PAWAPAY_API_TOKEN
  try {
    process.env.PAWAPAY_ENVIRONMENT='production';assert.throws(()=>paymentMode(),/verrouillés/)
    process.env.PAWAPAY_ENVIRONMENT='sandbox';process.env.PAWAPAY_API_TOKEN=randomUUID()
    let requestCount=0
    globalThis.fetch=async(url,options)=>{requestCount++;assert(String(url).startsWith('https://api.sandbox.pawapay.io/v2/'));assert(options?.headers);if(options?.method==='POST'){assert.equal(JSON.parse(options.body as string).depositId,t.id);return Response.json({depositId:t.id,status:'ACCEPTED'})}return Response.json(response)}
    assert.equal((await initiate(t)).status,'ACCEPTED');assert.equal((await checkStatus(t))?.status,'COMPLETED');assert.equal(requestCount,2)
    globalThis.fetch=async()=>Response.json({depositId:t.id,status:'DUPLICATE_IGNORED'});assert.equal((await initiate(t)).status,'UNKNOWN')
    globalThis.fetch=async()=>{throw new Error('Délai dépassé')};await assert.rejects(()=>initiate(t),/résultat reste à vérifier/)
    globalThis.fetch=async()=>new Response(null,{status:401});await assert.rejects(()=>checkStatus(t),/clé sandbox/)
    process.env.PAWAPAY_ENVIRONMENT='mock';await assert.rejects(()=>initiate(t),/mode pawaPay/)
  } finally {globalThis.fetch=originalFetch;if(originalEnv===undefined)delete process.env.PAWAPAY_ENVIRONMENT;else process.env.PAWAPAY_ENVIRONMENT=originalEnv;if(originalToken===undefined)delete process.env.PAWAPAY_API_TOKEN;else process.env.PAWAPAY_API_TOKEN=originalToken}
  console.log('PAIEMENTS : PASS — règles métier, litiges, annulation tardive, KYC, états terminaux, montants, devises, destinataires, configuration et adaptateur API simulé (sans appel externe).')
}
main().catch(e=>{console.error(e);process.exitCode=1})
