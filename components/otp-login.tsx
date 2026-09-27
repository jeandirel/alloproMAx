'use client'
import {useState} from 'react'
import {signIn} from 'next-auth/react'
import {useRouter} from 'next/navigation'
import {requestDemoCode} from '@/app/login/actions'
export function OtpLogin(){const [phone,setPhone]=useState('');const [challenge,setChallenge]=useState('');const [demoCode,setDemoCode]=useState('');const [code,setCode]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const router=useRouter()
 return <form className="ap-panel space-y-3 mb-6" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{if(!challenge){const data=await requestDemoCode(phone);if(data.error)setError(data.error);else{setChallenge(data.challenge!);setDemoCode(data.code!)}}else{const r=await signIn('demo-otp',{challenge,code,redirect:false});if(r?.error)setError('Code incorrect, expiré ou déjà utilisé.');else router.replace('/onboarding')}}catch(e){console.error(e);setError('Connexion impossible. Réessayez.')}finally{setBusy(false)}}}>
 <h2 className="font-bold">Connexion par téléphone</h2><p className="text-xs leading-relaxed text-muted-foreground">Simulation OTP : aucun SMS envoyé. Un nouvel espace de démonstration est créé ; utilisez l’e-mail pour retrouver un compte existant.</p>
 <label className="ap-label">Numéro de téléphone<input className="ap-input mt-1" type="tel" autoComplete="tel" required disabled={!!challenge} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="077 XX XX XX"/></label>
 {challenge&&<><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Code de démonstration : <strong>{demoCode}</strong> · valable 5 minutes</p><label className="ap-label">Code OTP<input className="ap-input mt-1" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} required/></label><button type="button" className="underline text-sm" onClick={()=>{setChallenge('');setCode('');setDemoCode('')}}>Changer de numéro ou demander un nouveau code</button></>}
 {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}<button className="ap-button w-full" disabled={busy}>{busy?'Connexion…':challenge?'Valider le code de démonstration':'Obtenir le code de démonstration'}</button></form>
}
