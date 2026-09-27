'use client'
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {Bell,RefreshCw,ShieldCheck,WifiOff} from 'lucide-react'
import {toast} from 'sonner'
import type {Workspace,Role} from '@/lib/marketplace'
import type {Action} from '@/lib/marketplace-engine'
import {roleLabels} from '@/lib/marketplace'

type Context={state:Workspace|null;busy:boolean;error:string;reload:()=>Promise<void>;act:(action:Action)=>Promise<{ok:boolean;result?:string}>}
const WorkspaceContext=createContext<Context|null>(null)
export function WorkspaceProvider({children}:{children:React.ReactNode}){
 const [state,setState]=useState<Workspace|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [online,setOnline]=useState(true)
 const version=useRef(0);const locked=useRef(false);const sequence=useRef(0);const router=useRouter()
 const reload=useCallback(async()=>{if(locked.current)return;const seq=++sequence.current;try{const r=await fetch('/api/workspace',{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);if(seq===sequence.current&&!locked.current){setState(data.state);version.current=data.version;setError('')}}catch(e){console.error(e);if(seq===sequence.current)setError('Connexion indisponible. Vos dernières données restent affichées.')}} ,[])
 useEffect(()=>{const change=()=>{setOnline(navigator.onLine);if(navigator.onLine)void reload()};const visible=()=>{if(!document.hidden)void reload()};window.addEventListener('online',change);window.addEventListener('offline',change);document.addEventListener('visibilitychange',visible)
 // Pas de bus d'événements (Redis, etc.) dans cette pile : ce flux SSE est un scrutateur serveur à
 // intervalle court (~2s), pas un vrai push-on-write ; il remplace le sondage aveugle 30s par une
 // reprise plus rapide et sans requête superflue quand rien n'a changé.
 let es:EventSource|null=null;let reconnectTimer:ReturnType<typeof setTimeout>|undefined;let backoff=3000
 const connect=()=>{es=new EventSource('/api/workspace/stream');es.addEventListener('update',(e:MessageEvent)=>{try{const data=JSON.parse(e.data) as {state:Workspace;version:number};setState(data.state);version.current=data.version;setError('');backoff=3000}catch(err){console.error(err)}});es.onerror=()=>{es?.close();es=null;void reload();if(reconnectTimer)clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,backoff);backoff=Math.min(backoff*2,30000)}}
 connect();change();return()=>{es?.close();if(reconnectTimer)clearTimeout(reconnectTimer);window.removeEventListener('online',change);window.removeEventListener('offline',change);document.removeEventListener('visibilitychange',visible)}},[reload])
 const act=useCallback(async(action:Action)=>{if(locked.current)return {ok:false};if(!navigator.onLine){toast.error('Reconnectez-vous pour enregistrer cette action.');return {ok:false}}locked.current=true;sequence.current++;setBusy(true)
 try{const r=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:version.current})});const data=await r.json();if(!r.ok)throw new Error(data.error);version.current=data.version;setState(data.state);setError('');if(navigator.vibrate)navigator.vibrate(12);return {ok:true,result:data.result}}
 catch(e){console.error(e);toast.error(e instanceof Error?e.message:'Enregistrement impossible.');return {ok:false}}
 finally{locked.current=false;setBusy(false);void reload()}},[reload])
 const unread=state?.notifications.filter(n=>!n.read&&n.role===state.role&&(!n.proId||n.proId===state.activeProId)).length||0
 return <WorkspaceContext.Provider value={{state,busy,error,reload,act}}><div className="bg-emerald-50 border-b border-emerald-100"><div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2 text-xs text-emerald-900"><ShieldCheck size={16}/><span className="font-semibold">Démo privée · Aucun paiement réel</span><div className="ml-auto flex items-center gap-2"><label className="sr-only" htmlFor="demo-role">Espace de démonstration</label><select id="demo-role" className="bg-white border border-emerald-200 rounded-lg p-2 min-h-10" value={state?.role||'client'} disabled={!state||busy} onChange={async e=>{const role=e.target.value as Role;const res=await act({type:'role',role});if(res.ok)router.push(role==='client'?'/accueil':role==='professionnel'?'/espace-pro':'/administration')}}>{Object.entries(roleLabels).map(([r,label])=><option key={r} value={r}>{label}</option>)}</select><Link href="/notifications" className="relative p-2" aria-label={`Notifications, ${unread} non lues`}><Bell size={20}/>{unread>0&&<span className="absolute -top-1 -right-1 rounded-full bg-amber-300 text-emerald-950 px-1.5 text-xs font-bold">{unread}</span>}</Link></div></div></div>{(!online||error)&&<div role="status" className="px-4 py-3 bg-amber-50 text-amber-950 text-sm flex justify-center gap-3"><WifiOff size={18}/>{error||'Hors connexion : consultation uniquement.'}<button onClick={()=>void reload()} className="underline">Réessayer</button></div>}{children}</WorkspaceContext.Provider>
}
export function useWorkspace(){const c=useContext(WorkspaceContext);if(!c)throw new Error('Espace de démonstration manquant');return c}
export function WorkspaceLoading(){const {error,reload}=useWorkspace();return <div className="max-w-3xl mx-auto p-6 space-y-4" role="status">{error?<button className="ap-button" onClick={()=>void reload()}><RefreshCw size={18}/>Réessayer le chargement</button>:<><p>Chargement de votre espace…</p>{[1,2,3].map(i=><div key={i} className="h-28 rounded-2xl bg-muted animate-pulse"/>)}</>}</div>}
export function useOptionalWorkspace(){return useContext(WorkspaceContext)}
