'use client'

import Image from '@/components/smart-image'
import { useState } from 'react'
import { toast } from 'sonner'
import { useOptionalWorkspace } from '@/components/workspace-provider'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, Star, MapPin, Clock, MessageSquare, Users, Phone, ShieldCheck, CreditCard, Heart, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Professional, formatFCFA } from '@/lib/data'
import { StarRating } from '@/components/star-rating'

export function ProfilClient({ pro: original }: { pro: Professional }) {
  const router = useRouter()
  const ws = useOptionalWorkspace()
  const pro = ws?.state?.pros.find(p => p.id === original.id) || original
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const favorite = ws?.state?.favorites.includes(pro.id) || false
  const phone = 'phone' in pro ? String(pro.phone) : ''
  const reviews = ws?.state?.missions.filter(m => m.professionalId === pro.id && m.review && !m.review.hidden) || []

  return <main className="ap-client-page !pb-32 lg:!pb-12">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <button onClick={() => router.back()} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18}/>Retour</button>
      <p className="text-xs leading-relaxed text-muted-foreground">Profil fictif · Portrait illustratif · Avis de démonstration</p>
    </div>
    <section className="overflow-hidden rounded-[2rem] border border-border/40 bg-white shadow-sm">
      <div className="ap-home-hero flex min-h-28 items-start justify-between gap-3 bg-primary px-5 py-5 text-white sm:px-8">
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{pro.categorie} · Libreville</span>
        <button aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={favorite} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm" onClick={() => ws?.state ? void ws.act({type:'favorite',proId:pro.id}) : router.push('/login')}><Heart size={20} className={favorite ? 'fill-rose-600 text-rose-600' : ''}/></button>
      </div>
      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="relative -mt-10 mb-4 aspect-square w-24 overflow-hidden rounded-3xl border-4 border-white bg-muted sm:w-28"><Image src={pro.photo} alt={`Portrait illustratif de ${pro.name}`} fill sizes="112px" className="object-cover" priority/></div>
        <div className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{pro.name}</h1><p className="mt-2 text-base text-muted-foreground">{pro.metier}</p></div><div className="flex flex-wrap gap-2">{pro.verifie&&<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"><BadgeCheck size={16}/>Profil vérifié</span>}<span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium ${pro.enLigne?'bg-primary/10 text-primary':'bg-muted text-muted-foreground'}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{pro.disponibilite}</span></div></div>
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/60 pt-6 sm:grid-cols-4">{[
          { value: String(pro.note), label: 'Note sur 5', icon: Star }, { value: String(pro.missions), label: 'Missions', icon: Users },
          { value: `${pro.tauxReponse}%`, label: 'Taux de réponse', icon: MessageSquare }, { value: pro.delaiMoyen, label: 'Délai moyen', icon: Clock },
        ].map(s=><div key={s.label} className="rounded-2xl bg-background p-4"><s.icon size={18} className="mb-2 text-primary"/><p className="font-display text-xl font-bold">{s.value}</p><p className="mt-1 text-xs text-muted-foreground">{s.label}</p></div>)}</div>
      </div>
    </section>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <section className="ap-profile-section"><h2>Faisons connaissance</h2><p className="text-sm leading-7 text-muted-foreground sm:text-base">{pro.bio}</p><div className="mt-5 flex items-start gap-2 rounded-2xl bg-background p-4 text-sm"><MapPin size={18} className="mt-0.5 shrink-0 text-primary"/><div><p className="font-semibold">Zone d’intervention</p><p className="mt-1 leading-relaxed text-muted-foreground">{pro.zones?.join(', ') || 'Non spécifiée'}</p></div></div></section>
        <section className="ap-profile-section"><h2>Services et tarifs</h2><p className="mb-4 text-sm text-muted-foreground">Choisissez votre prestation lors de la réservation. Les frais de plateforme seront détaillés avant confirmation.</p><div className="divide-y divide-border/60">{(pro.services??[]).map(s=><div key={s.nom} className="flex flex-wrap items-center justify-between gap-2 py-4"><span className="text-sm font-medium">{s.nom}</span><strong className="whitespace-nowrap text-sm text-primary">{formatFCFA(s.tarif)}</strong></div>)}</div></section>
        {(pro.galerie?.length??0)>0&&<section className="ap-profile-section"><h2>Un aperçu du savoir-faire</h2><p className="mb-4 text-xs text-muted-foreground">Galerie illustrative de démonstration</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{pro.galerie.map((img,i)=><div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-muted"><Image src={img} alt={`Illustration de ${pro.metier.toLowerCase()} — galerie ${i+1}`} fill className="object-cover" sizes="(max-width: 640px) 42vw, (max-width: 1024px) 28vw, 210px"/></div>)}</div></section>}
        <section className="ap-profile-section"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="!mb-0">Avis clients</h2><span className="inline-flex items-center gap-1.5 text-sm"><Star size={16} className="fill-gold text-gold"/><strong>{pro.note}/5</strong></span></div><div className="divide-y divide-border/60">{(pro.avis??[]).map((a,i)=><article key={i} className="py-5 first:pt-0"><div className="mb-3 flex flex-wrap items-center gap-3"><div className="relative aspect-square w-10 shrink-0 overflow-hidden rounded-full bg-muted"><Image src={a.photo} alt={a.nom} fill sizes="40px" className="object-cover"/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{a.nom}</p><p className="mt-0.5 text-xs text-muted-foreground">{a.quartier} · {a.date}</p></div><StarRating rating={a.note}/></div><p className="text-sm leading-7 text-muted-foreground">{a.commentaire}</p></article>)}{reviews.map(m=><article key={m.id} className="py-5"><strong className="text-sm">{ws?.state?.profile.name}</strong><p className="my-2 text-xs text-muted-foreground">Qualité {m.review!.quality}/5 · Ponctualité {m.review!.punctuality}/5 · Communication {m.review!.communication}/5</p><p className="text-sm leading-7">{m.review!.comment}</p></article>)}</div></section>
        <div className="px-2"><button className="min-h-11 text-sm text-muted-foreground underline underline-offset-4" onClick={()=>ws?.state?setReportOpen(!reportOpen):router.push('/login')}>Signaler ce profil</button>{reportOpen&&<form className="ap-panel mt-3 space-y-3" onSubmit={async e=>{e.preventDefault();const result=await ws?.act({type:'report',target:pro.name,reason:reportReason});if(result?.ok){toast.success('Signalement enregistré.');setReportOpen(false)}}}><label className="ap-label">Motif du signalement<textarea required className="ap-input mt-2" value={reportReason} onChange={e=>setReportReason(e.target.value)}/></label><button className="ap-button" disabled={ws?.busy}>Envoyer le signalement</button></form>}</div>
      </div>
      <aside className="space-y-5 lg:sticky lg:top-24">
        <div className="ap-profile-section"><p className="text-sm text-muted-foreground">Prestations à partir de</p><p className="mt-2 font-display text-3xl font-bold tracking-tight text-primary">{formatFCFA(pro.tarifMin)}</p><p className="mb-5 mt-3 text-xs leading-relaxed text-muted-foreground">Hors frais de plateforme. Consultez le détail avant de confirmer votre réservation.</p>
          <div className="ap-profile-actions"><div className="mx-auto flex max-w-6xl gap-2 lg:flex-wrap"><Link href={`/reserver/${pro.id}`} className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-bold text-night transition-colors hover:bg-gold-dark lg:basis-full">Réserver <ArrowRight size={17}/></Link><Link aria-label="Envoyer un message" href={`/messages?thread=PRO-${pro.id}`} className="ap-secondary !px-4 lg:flex-1"><MessageSquare size={18}/><span className="hidden lg:inline">Message</span></Link>{phone?<a aria-label="Appeler le professionnel" href={`tel:${phone.replace(/[^+0-9]/g,'')}`} className="ap-secondary !px-4"><Phone size={18}/></a>:<button aria-label="Appeler (démonstration)" onClick={()=>toast.info('Profil fictif : aucun numéro réel. Le bouton d’appel sera actif après ajout d’un numéro dans le profil professionnel.')} className="ap-secondary !px-4"><Phone size={18}/></button>}</div></div>
          <div className="mt-5 flex items-start gap-2 border-t border-border/60 pt-5 text-xs leading-relaxed text-muted-foreground"><CreditCard size={17} className="shrink-0 text-primary"/>Paiement de test uniquement. Aucun débit réel dans cette démonstration.</div>
        </div>
        <div className="rounded-3xl bg-primary/5 p-6"><ShieldCheck size={24} className="mb-3 text-primary"/><h2 className="font-display text-base font-bold">La confiance, à chaque étape</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Seuls les professionnels vérifiés peuvent recevoir une mission. En cas de litige, le paiement reste bloqué jusqu’à la décision administrative.</p><Link href="/contact" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Contacter l’assistance<ArrowRight size={15}/></Link></div>
      </aside>
    </div>
  </main>
}
