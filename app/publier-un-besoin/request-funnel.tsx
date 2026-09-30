'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, Camera, Check, Mic, X } from 'lucide-react'
import { useState } from 'react'

const steps = [
  ['Quel service recherchez-vous ?', 'Ex. plomberie, climatisation, électricité', 'Décrivez le service dont vous avez besoin.'],
  ['Quel est votre besoin ?', 'Ex. Mon climatiseur ne refroidit plus', 'Ajoutez quelques mots pour aider le professionnel à comprendre.'],
  ['Où doit avoir lieu l’intervention ?', 'Ex. Libreville, Batterie IV', 'Indiquez la ville ou le quartier concerné.'],
  ['Quand souhaitez-vous l’intervention ?', 'Ex. Dès que possible', 'Choisissez le moment qui vous convient.'],
  ['Ajoutez des détails', 'Ex. L’appareil fait du bruit depuis hier', 'Les détails facilitent une première estimation.'],
  ['Quel budget envisagez-vous ?', 'Ex. 15 000 – 30 000 FCFA', 'Cette indication reste facultative.'],
  ['Comment vous contacter ?', 'Votre numéro ou votre e-mail', 'Vos coordonnées ne sont partagées qu’au bon moment.'],
]

export function RequestFunnel() {
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<string[]>(Array(steps.length).fill(''))
  const current = steps[step]
  const done = step === steps.length
  function next() { if (step < steps.length) setStep(s => s + 1) }
  function previous() { if (step > 0) setStep(s => s - 1) }
  return <main className="mx-auto min-h-[calc(100vh-72px)] max-w-2xl px-4 py-8 sm:px-6 sm:py-14">
    <div className="mb-10 flex items-center justify-between gap-4"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={17}/>Quitter</Link><span className="font-display text-lg font-extrabold text-[#18233A]">AlloPro<span className="text-primary">.</span></span></div>
    {!done ? <section className="mx-auto max-w-xl"><div className="mb-10"><div className="mb-3 flex justify-between text-xs font-semibold text-muted-foreground"><span>Étape {step + 1} sur {steps.length}</span><span>{Math.round(((step + 1) / steps.length) * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></div></div><p className="ap-eyebrow">Publier un besoin</p><h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#18233A] sm:text-4xl">{current[0]}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{current[2]}</p><input autoFocus className="ap-input mt-8 !min-h-14 !rounded-2xl !px-5" value={values[step]} placeholder={current[1]} onChange={e => setValues(v => v.map((value, index) => index === step ? e.target.value : value))}/>{step === 4 && <div className="mt-4 flex gap-3"><button type="button" className="ap-secondary"><Camera size={17}/>Ajouter une photo</button><button type="button" className="ap-secondary"><Mic size={17}/>Note vocale</button></div>}<div className="mt-10 flex items-center justify-between gap-3"><button type="button" onClick={previous} disabled={step === 0} className="min-h-11 text-sm font-semibold text-muted-foreground disabled:invisible">Retour</button><button type="button" onClick={next} className="ap-button">Continuer <ArrowRight size={17}/></button></div></section> : <section className="mx-auto max-w-xl rounded-[2rem] border border-border/60 bg-white p-7 text-center shadow-sm sm:p-10"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Check size={28}/></div><p className="ap-eyebrow mt-6">Récapitulatif</p><h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#18233A]">Votre demande est prête.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Connectez-vous pour l’enregistrer et recevoir les réponses des professionnels disponibles.</p><div className="mt-7 space-y-3 text-left">{steps.slice(0, 5).filter((_, i) => values[i]).map(([label], i) => <div key={label} className="rounded-xl bg-background p-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{values[i]}</p></div>)}</div><Link href="/login" className="ap-button mt-8 w-full">Se connecter pour publier <ArrowRight size={17}/></Link></section>}
  </main>
}
