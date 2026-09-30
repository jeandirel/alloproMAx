'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, ClipboardList, CreditCard, MessageCircle, ShieldCheck, Sparkles, UserCheck } from 'lucide-react'
import { SearchBar } from '@/components/search-bar'
import { LocationPicker, type LocationPickerValue } from '@/components/location-picker'
import { ProfessionalCard } from '@/components/professional-card'
import { CategoryGrid, resolveCategoryIconByName } from '@/components/category-grid'
import { SiteFooter } from '@/components/site-footer'
import type { Professional } from '@/lib/data'

interface CategoryOption { id: string; name: string }

export function LandingPage() {
  const [heroLoc, setHeroLoc] = useState<LocationPickerValue | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch('/api/services/categories').then(r => r.json()), fetch('/api/professionals?limit=3').then(r => r.json())])
      .then(([catalogue, pros]) => { if (!cancelled) { setCategories(catalogue.categories ?? []); setProfessionals(pros.professionals ?? []) } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-50 border-b border-border/60 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="font-display text-xl font-extrabold tracking-tight text-night">AlloPro<span className="text-primary">.</span></Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Navigation principale">
          <Link href="/recherche" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Trouver un professionnel</Link><Link href="/recherche" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Explorer les services</Link><a href="#comment-ca-marche" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Comment ça marche ?</a><Link href="/signup" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Devenir professionnel</Link>
        </nav>
        <div className="flex items-center gap-3"><Link href="/login" className="hidden text-sm font-semibold sm:block">Se connecter</Link><Link href="/publier-un-besoin" className="ap-button !min-h-10 !px-3 sm:!px-4">Publier un besoin</Link></div>
      </div>
    </header>

    <main>
      <section className="relative overflow-hidden bg-secondary px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute -right-24 top-8 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center"><p className="ap-eyebrow mb-5">La marketplace de confiance au Gabon</p><h1 className="text-balance font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-night sm:text-6xl">Trouvez le bon professionnel pour chaque besoin.</h1><p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">Comparez les professionnels disponibles près de chez vous, consultez leurs avis et contactez-les en quelques minutes.</p>
          <div className="mt-9 rounded-[1.75rem] border border-white bg-white p-3 text-left shadow-lg shadow-night/10 sm:p-5"><SearchBar label="Quel service recherchez-vous ?" zone={heroLoc?.displayName || ''}/><div className="mt-3"><label className="ap-label mb-1.5 block">Où ?</label><LocationPicker variant="inline" value={heroLoc} onChange={setHeroLoc} placeholder="Libreville, Akanda, Owendo…"/></div></div>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-medium text-muted-foreground"><span className="rounded-full bg-white/80 px-3 py-2">Réparer une fuite d’eau</span><span className="rounded-full bg-white/80 px-3 py-2">Installer une climatisation</span><span className="rounded-full bg-white/80 px-3 py-2">Trouver un électricien</span></div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6"><div className="mx-auto grid max-w-7xl gap-4 rounded-[1.5rem] border border-border/70 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto] md:items-center md:p-6"><div><p className="ap-eyebrow">Recherche intelligente</p><h2 className="mt-2 font-display text-xl font-bold tracking-tight">Décrivez simplement ce qui ne va pas.</h2><p className="mt-1 text-sm text-muted-foreground">Photo et note vocale sont prêts dans l’interface pour accélérer votre demande.</p></div><Link href="/publier-un-besoin" className="ap-secondary whitespace-nowrap"><Sparkles size={17}/>Décrire mon besoin</Link></div></section>

      <section className="px-4 py-10 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="ap-eyebrow">Explorer</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Les services du quotidien</h2></div><Link href="/recherche" className="text-sm font-semibold text-primary">Voir tous les services <ArrowRight className="inline h-4 w-4"/></Link></div><CategoryGrid items={categories.slice(0, 8).map(cat => ({ ...cat, icon: resolveCategoryIconByName(cat.name) }))}/></div></section>

      <section id="comment-ca-marche" className="bg-white px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><p className="ap-eyebrow">Simple et transparent</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Comment ça marche</h2><div className="mt-8 grid gap-5 md:grid-cols-3">{[{icon:ClipboardList,title:'Décrivez votre besoin',text:'Expliquez ce que vous recherchez et indiquez le lieu.',num:'01'},{icon:UserCheck,title:'Comparez les professionnels',text:'Consultez les profils, les avis et les disponibilités.',num:'02'},{icon:MessageCircle,title:'Choisissez et échangez',text:'Demandez un devis et convenez de votre intervention.',num:'03'}].map(({icon: Icon,title,text,num}) => <article key={num} className="rounded-3xl border border-border/60 p-6 sm:p-7"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><Icon className="h-6 w-6 text-primary"/></div><p className="mt-8 text-xs font-bold tracking-[.16em] text-primary">{num}</p><h3 className="mt-2 font-display text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div></div></section>

      <section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="ap-eyebrow">Sélection locale</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Professionnels recommandés près de chez vous</h2></div><Link href="/recherche" className="text-sm font-semibold text-primary">Explorer les profils <ArrowRight className="inline h-4 w-4"/></Link></div>{!loading && professionals.length ? <div className="grid gap-5 md:grid-cols-3">{professionals.map(pro => <ProfessionalCard key={pro.id} pro={pro}/>)}</div> : <div className="grid gap-5 md:grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted"/>)}</div>}</div></section>

      <section className="bg-night px-4 py-12 text-white sm:px-6 sm:py-16"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[.16em] text-accent">Choisir en confiance</p><h2 className="mt-2 max-w-xl font-display text-3xl font-bold tracking-tight">Une relation plus claire, dès le premier échange.</h2><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{icon:ShieldCheck,title:'Professionnels vérifiés',text:'Des informations essentielles contrôlées.'},{icon:BadgeCheck,title:'Avis authentiques',text:'Des retours liés à de vraies prestations.'},{icon:MessageCircle,title:'Échanges sécurisés',text:'Gardez vos décisions au même endroit.'},{icon:CreditCard,title:'Prix transparents',text:'Comparez avant de vous engager.'}].map(({icon: Icon,title,text}) => <div key={title} className="rounded-2xl border border-white/15 p-5"><Icon className="h-6 w-6 text-accent"/><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-white/65">{text}</p></div>)}</div></div></section>

      <section className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] bg-primary px-7 py-10 text-white sm:px-12 sm:py-14"><p className="text-xs font-bold uppercase tracking-[.16em] text-white/70">Vous êtes professionnel ?</p><h2 className="mt-2 max-w-xl font-display text-3xl font-bold tracking-tight">Faites connaître votre savoir-faire à de nouveaux clients.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-white/80">Créez votre profil, présentez vos services et recevez des demandes autour de vous.</p><Link href="/signup" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-night">Créer mon profil <ArrowRight size={17}/></Link></div></section>
    </main>
    <SiteFooter/>
  </div>
}
