'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LockKeyhole, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { Mission } from '@/lib/marketplace'
import { formatFCFA } from '@/lib/data'
import { isFinal, paymentLabels, transactionLabels, type PaymentConfig, type PaymentKind, type TransactionStatus } from '@/lib/payment-types'
import { useWorkspace } from './workspace-provider'

type History = {id:string;kind:PaymentKind;status:TransactionStatus;amount:number;phone:string;mode:string;failureCode:string|null}
export function PaymentPanel({mission:m}:{mission:Mission}) {
  const {state,reload,busy:workspaceBusy} = useWorkspace()
  const [config,setConfig] = useState<PaymentConfig|null>(null)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [history,setHistory] = useState<History[]>([])
  const [method,setMethod] = useState<'airtel'|'moov'>(m.paymentMethod)
  const [phone,setPhone] = useState(m.paymentFlow?.phone||'')
  const locked = useRef(false)
  const f = m.paymentFlow
  const kind: PaymentKind = f?.decision==='refund'?'refund':f?.decision==='release'?'payout':'deposit'
  const ref = kind==='deposit'?f?.deposit:f?.settlement
  const active = f?.settlement || f?.deposit
  const load = useCallback(async()=>{
    try {
      const [c,r] = await Promise.all([fetch(`/api/payments/config?kind=${kind}`,{cache:'no-store'}),fetch(`/api/payments?missionId=${encodeURIComponent(m.id)}`,{cache:'no-store'})])
      const [conf,data] = await Promise.all([c.json(),r.json()])
      if(!c.ok||!r.ok) throw new Error(data.error||conf.error||'Chargement des paiements impossible.')
      setConfig(conf);setHistory(data.transactions);setError('')
    } catch(e) {console.error(e);setError(e instanceof Error?e.message:'Chargement impossible.')}
  },[kind,m.id])
  useEffect(()=>{if(f)void load()},[f?.deposit?.status,f?.settlement?.status,f?.deposit?.id,f?.settlement?.id,load,!!f])
  const send = useCallback(async(body:unknown,quiet=false)=>{
    if(locked.current)return
    locked.current=true;setBusy(true)
    try {
      const r=await fetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const data=await r.json();if(!r.ok)throw new Error(data.error)
      if(!quiet)toast.info(data.message||'Statut financier mis à jour.')
      setError('');await reload();await load()
    }catch(e){console.error(e);const message=e instanceof Error?e.message:'Action impossible.';setError(message);if(!quiet)toast.error(message)}
    finally{locked.current=false;setBusy(false)}
  },[reload,load])
  useEffect(()=>{
    if(!active||isFinal(active.status)||f?.mode!=='sandbox')return
    const timer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void send({action:'refresh',transactionId:active.id},true)},25000)
    return()=>clearInterval(timer)
  },[active?.id,active?.status,f?.mode,send])
  if(!f||!state)return null
  const pro=state.pros.find(p=>p.id===m.professionalId)
  const unresolved=m.status==='litige'||(m.dispute&&!m.dispute.decision)
  const canAct=kind==='deposit'?state.role==='client'&&!state.clientSuspended&&m.status==='en_attente':kind==='refund'?['client','administrateur'].includes(state.role)&&f.deposit?.status==='COMPLETED':state.role==='administrateur'||(state.role==='professionnel'&&state.activeProId===m.professionalId)
  const canStart=canAct&&!unresolved&&(!ref||['FAILED','REJECTED','CREATED','UNKNOWN'].includes(ref.status))
  const modeMatch=config&&config.mode===f.mode
  const label=kind==='deposit'?'Payer':kind==='refund'?'Rembourser le client':'Verser au professionnel'
  const value=kind==='payout'?m.basePrice:m.totalPrice
  return <section className="ap-panel space-y-4" aria-label="Paiement Mobile Money"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-lg flex gap-2 items-center"><LockKeyhole size={20}/>Paiement pawaPay</h2><span className="text-xs bg-amber-50 text-amber-950 px-3 py-1 rounded-full">{f.mode==='mock'?'Simulation locale':'Sandbox pawaPay'}</span></div>
    <p className="font-semibold text-emerald-dark" role="status">{paymentLabels[m.payment]}</p>
    <p className="text-sm text-muted-foreground">Aucun argent réel. {f.mode==='mock'?'Cette simulation fonctionne sans clé et ne contacte pas pawaPay.':'Les transactions utilisent l’environnement de test pawaPay.'} Il ne s’agit pas d’un séquestre bancaire.</p>
    {unresolved&&<p className="p-3 rounded-xl bg-red-50 text-red-900 text-sm">Litige ouvert : aucun versement ni remboursement avant la décision de l’administrateur.</p>}
    {config?.mode==='blocked'&&<p className="text-sm text-red-800">{config.message}</p>}
    {config&&config.mode!=='blocked'&&!modeMatch&&<p className="text-sm text-amber-900">Le mode configuré a changé. Cette réservation garde son mode d’origine ; créez une nouvelle réservation pour tester le nouveau mode.</p>}
    {active&&<div className="rounded-xl bg-muted p-3 text-sm"><p>{transactionLabels[active.status]}</p><p className="text-xs break-all mt-1">Référence : {active.id}</p>{!isFinal(active.status)&&<button type="button" className="ap-secondary mt-3" disabled={busy||workspaceBusy} onClick={()=>void send({action:'refresh',transactionId:active.id})}><RefreshCw size={15}/>Actualiser le statut</button>}</div>}
    {canStart&&<div className="space-y-3">
      {kind!=='refund'&&<label className="ap-label">{kind==='deposit'?'Opérateur du client':'Opérateur du professionnel'}<select className="ap-input mt-2" value={method} disabled={busy||!!ref&&!isFinal(ref.status)} onChange={e=>setMethod(e.target.value as 'airtel'|'moov')}><option value="airtel" disabled={!config?.options.some(o=>o.method==='airtel')}>Airtel Money{!config?.options.some(o=>o.method==='airtel')?' — indisponible':''}</option><option value="moov" disabled={!config?.options.some(o=>o.method==='moov')}>Moov Money{!config?.options.some(o=>o.method==='moov')?' — non activé chez pawaPay':''}</option></select></label>}
      {kind==='deposit'&&<label className="ap-label">Numéro Mobile Money de test<input className="ap-input mt-2" type="tel" value={phone} disabled={busy||!!ref&&!isFinal(ref.status)} onChange={e=>setPhone(e.target.value)} placeholder="074345678"/></label>}
      {f.mode==='sandbox'&&<p className="text-xs text-muted-foreground">Numéro Airtel de test pawaPay : 074345678 (succès). N’utilisez pas de vrai portefeuille pour cette démo.</p>}
      {kind==='payout'&&<p className="text-sm">Destinataire : {pro?.name}. Numéro enregistré : <span suppressHydrationWarning>{pro?.phone||'manquant'}</span>. <Link href="/espace-pro/dossier" className="underline text-emerald-dark">Modifier dans l’espace professionnel</Link>. Les frais de plateforme ne sont pas versés au professionnel.</p>}
      {kind==='refund'&&<p className="text-sm">Remboursement intégral de l’encaissement d’origine, frais de plateforme inclus. Aucun destinataire alternatif.</p>}
      <button type="button" className="ap-button w-full" disabled={busy||workspaceBusy||!modeMatch||!config?.options.length||(kind!=='refund'&&!config?.options.some(o=>o.method===method))||(kind==='payout'&&!pro?.phone)} onClick={()=>{if(window.confirm(`${label} : ${formatFCFA(value)} en mode test, sans argent réel ?`))void send({action:'initiate',missionId:m.id,kind,method,phone})}}>{busy?'Traitement…':ref&&!isFinal(ref.status)?'Reprendre la transmission (même référence)':`${label} · ${formatFCFA(value)} (test)`}</button>
    </div>}
    {active&&f.mode==='mock'&&!isFinal(active.status)&&((!f.settlement&&state.role==='client')||(f.settlement?.kind==='refund'&&['client','administrateur'].includes(state.role))||(f.settlement?.kind==='payout'&&['professionnel','administrateur'].includes(state.role)))&&<div className="p-3 rounded-xl bg-amber-50 text-amber-950"><p className="text-sm font-semibold mb-3">Tester le résultat de cette transaction fictive</p><div className="flex flex-wrap gap-2"><button className="ap-secondary" disabled={busy||workspaceBusy} onClick={()=>void send({action:'simulate',transactionId:active.id,outcome:'COMPLETED'})}>Simuler un succès</button><button className="ap-secondary" disabled={busy||workspaceBusy} onClick={()=>void send({action:'simulate',transactionId:active.id,outcome:'FAILED'})}>Simuler un échec</button></div></div>}
    {kind==='payout'&&state.role==='client'&&m.payment!=='libere'&&<p className="text-sm">Mission validée. Le professionnel ou l’administrateur peut maintenant déclencher le versement de test. Le statut « Versé » attend sa confirmation.</p>}
    {error&&<p role="alert" className="text-sm text-red-800">{error} <button className="underline" onClick={()=>void load()}>Recharger</button></p>}
    {history.length>0&&<details><summary className="text-sm cursor-pointer font-semibold">Journal des transactions ({history.length})</summary><ul className="space-y-3 mt-3">{history.map(t=><li key={t.id} className="text-xs border-t pt-3"><p className="font-semibold">{t.kind==='deposit'?'Encaissement':t.kind==='refund'?'Remboursement':'Versement'} · {formatFCFA(t.amount)} · {transactionLabels[t.status]}</p><p className="break-all mt-1">{t.id}</p><p>{t.phone} · {t.mode==='mock'?'Simulation locale':'pawaPay sandbox'}{t.failureCode?` · Code : ${t.failureCode}`:''}</p></li>)}</ul></details>}
  </section>
}
