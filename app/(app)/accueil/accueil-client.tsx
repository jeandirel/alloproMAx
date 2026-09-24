'use client'

import Link from 'next/link'
import Image from '@/components/smart-image'
import { useWorkspace } from '@/components/workspace-provider'
import { MapPin, Wrench, Zap, Sparkles, Scissors, Car, Wind, Truck, BookOpen, BadgeCheck, ClipboardList, MessageCircle, Heart, ArrowRight, ArrowUpRight } from 'lucide-react'
import { SearchBar } from '@/components/search-bar'
import { ProfessionalCard } from '@/components/professional-card'
import { professionals, formatFCFA } from '@/lib/data'

const categoryIcons: Record<string, React.ElementType> = { Wrench, Zap, Sparkles, Scissors, Car, Wind, Truck, BookOpen }
const categoriesWithPrice = [
  { nom: 'Plomberie', icon: 'Wrench', prix: 8000 }, { nom: 'Électricité', icon: 'Zap', prix: 12000 },
  { nom: 'Ménage', icon: 'Sparkles', prix: 4500 }, { nom: 'Beauté', icon: 'Scissors', prix: 3500 },
  { nom: 'Mécanique', icon: 'Car', prix: 15000 }, { nom: 'Clim', icon: 'Wind', prix: 12000 },
  { nom: 'Transport', icon: 'Truck', prix: 5000 }, { nom: 'Tutorat', icon: 'BookOpen', prix: 7500 },
]

export function AccueilClient({ userName }: { userName: string }) {
  const { state } = useWorkspace()
  const nearbyPros = (state?.pros || professionals).filter(p => p.enLigne && p.verifie && !('suspended' in p && p.suspended) && (!state || state.categories.some(c => c.name === p.categorie && c.active))).slice(0, 4)
  const displayName = state?.profile.name?.split(' ')[0] || userName
  const homeCategories = state ? state.categories.filter(c => c.active).map(c => { const base = categoriesWithPrice.find(v => c.name.startsWith(v.nom)); const prices = state.pros.filter(p => p.categorie === c.name && p.verifie && !p.suspended).map(p => p.tarifMin); return { nom: c.name, icon: base?.icon || 'Wrench', prix: prices.length ? Math.min(...prices) : 0 } }) : categoriesWithPrice

  return <main className="ap-client-page space-y-8 sm:space-y-10">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="ap-eyebrow">Votre quotidien, plus simple</p><h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Bonjour, {displayName}<span className="text-gold">.</span></h1></div>
      <Link href="/profil/informations" className="flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm text-muted-foreground shadow-sm"><MapPin size={16} className="shrink-0 text-primary"/>{state?.profile.quartier || 'Libreville'}, Gabon<ArrowUpRight size={15}/></Link>
    </header>
    <section className="ap-home-hero relative overflow-hidden rounded-[2rem] bg-primary p-6 text-white sm:p-10">
      <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0"><p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white"><BadgeCheck size={15}/>Des professionnels vérifiés</p><h2 className="max-w-xl text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Un coup de main.<br/>L’esprit tranquille.</h2><p className="mt-4 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">Une réparation, un ménage ou un nouveau projet ? Trouvez le bon professionnel près de chez vous.</p><SearchBar className="mt-6"/></div>
        <div className="hidden lg:block"><div className="rounded-3xl border border-white/20 bg-white/10 p-6"><p className="text-xs font-semibold uppercase tracking-widest text-white/80">Votre prochain rendez-vous</p><p className="mt-3 font-display text-2xl font-semibold">Du savoir-faire,<br/>près de chez vous.</p><div className="mt-6 flex -space-x-3">{nearbyPros.slice(0,3).map(p=><div key={p.id} className="relative aspect-square w-16 overflow-hidden rounded-full border-4 border-primary bg-muted"><Image src={p.photo} alt={`Portrait illustratif de ${p.name}`} fill sizes="64px" className="object-cover"/></div>)}</div><p className="mt-4 text-xs text-white/80">Profils et portraits de démonstration</p><Link href="/recherche" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white">Explorer les professionnels <ArrowRight size={16}/></Link></div></div>
      </div>
    </section>
    {state && !state.onboarded && <Link href="/onboarding" className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 p-5 text-sm font-semibold text-amber-950">Personnalisez votre expérience : complétez votre profil.<ArrowRight size={20} className="shrink-0"/></Link>}
    <section><div className="ap-section-heading"><div><p className="ap-eyebrow">À chaque besoin, son expert</p><h2>De quoi avez-vous besoin ?</h2></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">{homeCategories.map(cat=>{const Icon=categoryIcons[cat.icon]??Wrench;return <Link key={cat.nom} href={`/recherche?cat=${encodeURIComponent(cat.nom)}`} className="ap-category-card"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon size={23}/></span><span className="text-sm font-semibold leading-snug">{cat.nom}</span><span className="text-xs leading-relaxed text-muted-foreground">{cat.prix ? `Dès ${formatFCFA(cat.prix)}` : 'Sur devis'}</span></Link>})}</div></section>
    <section><div className="ap-section-heading"><div><p className="ap-eyebrow">Le savoir-faire local</p><h2>Des professionnels à découvrir</h2></div><Link href="/recherche" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Voir tout<ArrowRight size={16}/></Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{nearbyPros.map(pro=><ProfessionalCard key={pro.id} pro={pro}/>)}</div>{!nearbyPros.length&&<p className="ap-panel text-sm text-muted-foreground">Aucun professionnel vérifié en ligne pour le moment. Consultez la recherche pour préparer une intervention.</p>}</section>
    <section className="grid gap-5 lg:grid-cols-[1fr_1.5fr]"><div className="rounded-3xl bg-gold/15 p-6"><Zap className="mb-3 text-amber-800" size={24}/><h2 className="font-display text-xl font-bold">Un imprévu à la maison ?</h2><p className="mb-3 mt-2 text-sm leading-relaxed text-muted-foreground">Consultez les disponibilités et échangez avec un professionnel avant votre intervention.</p><Link href="/recherche" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">Trouver un professionnel<ArrowRight size={16}/></Link></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[{href:'/reservations',icon:ClipboardList,label:'Mes réservations',text:'Retrouver mes missions'},{href:'/messages',icon:MessageCircle,label:'Messages',text:'Continuer un échange'},{href:'/favoris',icon:Heart,label:'Mes favoris',text:'Mes profils enregistrés'}].map(a=><Link key={a.href} href={a.href} className="group flex flex-col justify-center rounded-3xl border border-border/50 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"><a.icon size={24} className="mb-4 text-primary"/><h3 className="text-sm font-bold">{a.label}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.text}</p><ArrowUpRight size={18} className="mt-4 text-primary"/></Link>)}</div></section>
  </main>
}
