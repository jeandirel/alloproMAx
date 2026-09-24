import assert from 'node:assert/strict'
import {sessionFetch,BASE} from './auth-smoke.mjs'
let state,version
async function load(){const r=await sessionFetch('/api/workspace');assert.equal(r.status,200);({state,version}=await r.json())}
async function action(a,status=200){await load();const r=await sessionFetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:a,version})});const b=await r.json();assert.equal(r.status,status,b.error);await load();return b}
async function payment(body,status=200){const r=await sessionFetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();assert.equal(r.status,status,b.error);return b}
const mission=id=>state.missions.find(m=>m.id===id)
await load()
for(const path of ['/api/payments','/api/payments/config'])assert.equal((await fetch(BASE+path)).status,401)
assert.equal((await fetch(BASE+'/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401)
const config=await (await sessionFetch('/api/payments/config')).json();assert.equal(config.mode,'mock','Exécuter sans clé pawaPay réelle.');assert(config.options.some(o=>o.method==='airtel'))
const booking=()=>({type:'book',proId:'1',service:state.pros[0].services[0].nom,description:'Scénario financier fictif',address:'Adresse fictive',quartier:'Akanda',accessNotes:'',date:'',urgent:true,paymentMethod:'airtel',phone:'074345678',photos:[],location:null,requestKey:crypto.randomUUID()})
const first=(await action(booking())).result
assert.equal(mission(first).payment,'a_payer')
await action({type:'role',role:'professionnel',proId:'1'})
await action({type:'transition',missionId:first,action:'accept'},400)
await action({type:'role',role:'client'})
const concurrent=await Promise.all(Array.from({length:3},()=>payment({action:'initiate',missionId:first,kind:'deposit',amount:1,currency:'USD'})))
assert.equal(new Set(concurrent.map(r=>r.transaction.id)).size,1,'Idempotence en concurrence')
let deposit=concurrent[0].transaction
assert.equal(deposit.amount,8400);assert.equal(deposit.currency,'XAF');assert.equal(deposit.phone,'••••5678')
assert(!('phoneNumber' in deposit));assert(!('userId' in deposit));assert(!('token' in config))
// Forged callbacks cannot finalize a mock transaction.
assert.equal((await fetch(BASE+'/api/payments/pawapay/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({depositId:deposit.id,status:'COMPLETED',amount:'8400',currency:'XAF'})})).status,200)
await load();assert.equal(mission(first).payment,'en_cours')
await payment({action:'simulate',transactionId:deposit.id,outcome:'FAILED'});await load();assert.equal(mission(first).payment,'echec')
const retry=await payment({action:'initiate',missionId:first,kind:'deposit'});assert.notEqual(retry.transaction.id,deposit.id);assert.equal(retry.transaction.attempt,2);deposit=retry.transaction
await action({type:'transition',missionId:first,action:'cancel'});assert.equal(mission(first).payment,'en_cours')
await payment({action:'simulate',transactionId:deposit.id,outcome:'COMPLETED'});await load();assert.equal(mission(first).payment,'a_rembourser')
await payment({action:'initiate',missionId:first,kind:'payout'},400)
let refund=(await payment({action:'initiate',missionId:first,kind:'refund',phone:'066000000',amount:1})).transaction
assert.equal(refund.amount,8400);assert.equal(refund.phone,'••••5678')
assert.equal((await payment({action:'initiate',missionId:first,kind:'refund'})).transaction.id,refund.id)
await payment({action:'simulate',transactionId:refund.id,outcome:'FAILED'});await load();assert.equal(mission(first).payment,'a_rembourser')
refund=(await payment({action:'initiate',missionId:first,kind:'refund'})).transaction
await payment({action:'simulate',transactionId:refund.id,outcome:'COMPLETED'});await load();assert.equal(mission(first).payment,'rembourse')
const count=mission(first).events.length
await payment({action:'simulate',transactionId:refund.id,outcome:'FAILED'});await load();assert.equal(mission(first).payment,'rembourse');assert.equal(mission(first).events.length,count)
// New mission: unpaid -> paid -> dispute -> authorized -> payout pending -> payout confirmed.
const second=(await action(booking())).result
const d2=(await payment({action:'initiate',missionId:second,kind:'deposit'})).transaction
await payment({action:'simulate',transactionId:d2.id,outcome:'COMPLETED'})
await action({type:'role',role:'professionnel',proId:'1'})
const p=state.pros[0]
await action({type:'proProfile',name:p.name,bio:p.bio,zone:p.zone,zones:p.zones,categorie:p.categorie,experience:p.experience,phone:'074345678',services:p.services,documents:p.documents,submit:false})
assert.equal(state.pros[0].kyc,'verifie')
await payment({action:'initiate',missionId:second,kind:'payout'},400)
await action({type:'transition',missionId:second,action:'accept'})
await action({type:'role',role:'client'})
await action({type:'dispute',missionId:second,reason:'Litige de test',evidence:[]})
for(const kind of ['deposit','payout','refund'])await payment({action:'initiate',missionId:second,kind},400)
await action({type:'role',role:'administrateur'})
await payment({action:'initiate',missionId:second,kind:'payout'},400)
await action({type:'resolve',missionId:second,decision:'release',reason:'Contrôle du scénario terminé.'})
assert.equal(mission(second).payment,'a_verser');assert.equal(mission(second).status,'validee')
await action({type:'suspend',proId:'1',suspended:true})
await payment({action:'initiate',missionId:second,kind:'payout'},400)
await action({type:'suspend',proId:'1',suspended:false})
const payouts=await Promise.all(Array.from({length:3},()=>payment({action:'initiate',missionId:second,kind:'payout',method:'airtel',phone:'066000000',amount:1})))
assert.equal(new Set(payouts.map(p=>p.transaction.id)).size,1)
const payout=payouts[0].transaction;assert.equal(payout.amount,8000);assert.equal(payout.phone,'••••5678')
await load();assert.equal(mission(second).payment,'a_verser');assert.equal(mission(second).status,'validee')
await payment({action:'simulate',transactionId:payout.id,outcome:'COMPLETED'});await load();assert.equal(mission(second).payment,'libere');assert.equal(mission(second).status,'payee')
await payment({action:'initiate',missionId:second,kind:'refund'},400)
assert.equal((await payment({action:'initiate',missionId:second,kind:'payout'})).transaction.id,payout.id)
await action({type:'role',role:'client'})
const third=(await action({...booking(),urgent:false,date:new Date(Date.now()+86400000).toISOString()})).result
await action({type:'transition',missionId:third,action:'cancel'});assert.equal(mission(third).payment,'sans_debit')
await payment({action:'initiate',missionId:third,kind:'deposit'},400)
// Cross-account IDs and foreign origins are rejected.
const other=await import('./auth-smoke.mjs?payment-isolation')
assert.equal((await other.sessionFetch('/api/payments?missionId='+second)).status,404)
for(const op of [{action:'refresh',transactionId:payout.id},{action:'simulate',transactionId:payout.id,outcome:'COMPLETED'}])assert.equal((await other.sessionFetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)})).status,404)
assert.equal((await sessionFetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://untrusted.invalid'},body:JSON.stringify({action:'refresh',transactionId:payout.id})})).status,403)
assert.equal((await sessionFetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:'not-json'})).status,400)
assert.equal((await sessionFetch('/api/payments?missionId='+second)).status,200)
for(const path of ['/reserver/1','/reservations/'+second,'/administration','/espace-pro','/reservations'])assert.equal((await sessionFetch(path)).status,200)
console.log('PAIEMENTS API : PASS — encaissement, double clic concurrent, montants serveur, échec/reprise, annulation tardive, remboursement intégral, versement net, litige, suspension, confirmation idempotente, faux callback, isolation et origines. Mode local uniquement.')
