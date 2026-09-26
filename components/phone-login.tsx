'use client'
import {useState} from 'react'
import {signIn} from 'next-auth/react'
import {useRouter} from 'next/navigation'
import {requestPhoneOtp} from '@/app/login/actions'

/**
 * Connexion/inscription téléphone RÉELLE : un vrai SMS est envoyé (lib/sms.ts), find-or-create
 * d'un vrai compte par numéro normalisé. Distinct de OtpLogin (simulation investisseur, sans SMS).
 * `role` n'est utilisé que lors de la toute première connexion (création du compte) — voir
 * auth.ts::CredentialsProvider('phone').
 */
export function PhoneLogin({role, onSuccessHref = '/accueil'}:{role?:'user'|'professional'; onSuccessHref?:string}) {
  const [phone,setPhone]=useState('')
  const [challenge,setChallenge]=useState('')
  const [code,setCode]=useState('')
  const [error,setError]=useState('')
  const [info,setInfo]=useState('')
  const [busy,setBusy]=useState(false)
  const router=useRouter()

  return <form className="ap-panel space-y-3 mb-6" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError('');setInfo('')
    try{
      if(!challenge){
        const data=await requestPhoneOtp(phone)
        if(data.error)setError(data.error)
        else{setChallenge(data.challenge!);setInfo('Un code vous a été envoyé par SMS, valable 5 minutes.')}
      }else{
        const r=await signIn('phone',{challenge,code,role,redirect:false})
        if(r?.error)setError('Code incorrect, expiré ou déjà utilisé.')
        else router.replace(onSuccessHref)
      }
    }catch(e){console.error(e);setError('Connexion impossible. Réessayez.')}
    finally{setBusy(false)}
  }}>
    <h2 className="font-bold">Connexion par téléphone</h2>
    <label className="ap-label">Numéro de téléphone<input className="ap-input mt-1" type="tel" autoComplete="tel" required disabled={!!challenge} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="077 XX XX XX"/></label>
    {challenge&&<><label className="ap-label">Code reçu par SMS<input className="ap-input mt-1" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} required/></label><button type="button" className="underline text-sm" onClick={()=>{setChallenge('');setCode('');setInfo('')}}>Changer de numéro ou demander un nouveau code</button></>}
    {info&&<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">{info}</p>}
    {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
    <button className="ap-button w-full" disabled={busy}>{busy?'Connexion…':challenge?'Valider le code':'Recevoir un code par SMS'}</button>
  </form>
}
