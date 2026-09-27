'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck, ClipboardList, MessageCircle,
  ArrowRight, UserCheck, CreditCard, MapPinned,
} from 'lucide-react'
import { SearchBar } from '@/components/search-bar'
import { LocationPicker, type LocationPickerValue } from '@/components/location-picker'
import { ProfessionalCard } from '@/components/professional-card'
import { CategoryGrid, resolveCategoryIconByName } from '@/components/category-grid'
import { SiteFooter } from '@/components/site-footer'
import type { Professional } from '@/lib/data'

const CATEGORIES_PREVIEW_COUNT = 8
interface CategoryOption { id: string; name: string; slug: string }

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
}

export function LandingPage() {
  const [heroLoc, setHeroLoc] = useState<LocationPickerValue | null>(null)
  const [panelLoc, setPanelLoc] = useState<LocationPickerValue | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [prosLoading, setProsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/services/categories')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCategories(d.categories ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/professionals?limit=3')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setProfessionals(d.professionals ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setProsLoading(false) })
    return () => { cancelled = true }
  }, [])

  function goToRecherche(loc: LocationPickerValue | null) {
    if (!loc) return
    const params = new URLSearchParams()
    if (loc.displayName) params.set('zone', loc.displayName)
    if (loc.provinceId) params.set('provinceId', loc.provinceId)
    if (loc.cityId) params.set('cityId', loc.cityId)
    if (loc.neighborhoodId) params.set('neighborhoodId', loc.neighborhoodId)
    window.location.href = `/recherche?${params.toString()}`
  }

  const visibleCategories = showAllCategories ? categories : categories.slice(0, CATEGORIES_PREVIEW_COUNT)

  return (
    <div className="ap-landing min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[76px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-emerald-dark font-display">Allo Pro</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bêta</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-6">
            <Link href="/login" className="inline-flex min-h-11 items-center text-xs sm:text-sm font-semibold text-foreground hover:text-emerald-dark transition-colors">
              Connexion
            </Link>
            <Link
              href="/recherche"
              className="bg-gold hover:bg-gold-dark text-slate-950 text-xs sm:text-sm font-semibold px-3 sm:px-5 py-3 rounded-xl transition-colors"
            >
              Trouver un pro
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance font-display text-3xl font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-5xl">
            Trouvez un professionnel près de chez vous au Gabon
          </h1>
          <p className="mt-5 text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            Plomberie, électricité, ménage, coiffure, mécanique, informatique et bien plus. Recherchez un prestataire selon votre besoin et votre localisation.
          </p>
          <div className="mt-7 rounded-3xl border border-border/40 bg-white p-3 text-left shadow-lg sm:p-5">
            <SearchBar label="Quel service recherchez-vous ?" zone={heroLoc?.displayName || ''}/>
            <div className="mt-3">
              <label className="ap-label mb-1.5 block">Ville ou quartier</label>
              <LocationPicker variant="inline" value={heroLoc} onChange={setHeroLoc} placeholder="Ville ou quartier au Gabon"/>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><BadgeCheck size={16} className="text-primary"/>Professionnels par ville et quartier</span>
            <span className="flex items-center gap-1.5"><ClipboardList size={16} className="text-primary"/>Tarifs indicatifs affichés</span>
            <span className="flex items-center gap-1.5"><MessageCircle size={16} className="text-primary"/>Contact direct avec le professionnel</span>
          </div>
        </div>
      </section>

      {/* Catégories */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-6">Nos catégories de services</h2>
          <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <CategoryGrid
              items={visibleCategories.map((cat) => ({ id: cat.id, name: cat.name, icon: resolveCategoryIconByName(cat.name) }))}
            />
          </motion.div>
          {categories.length > CATEGORIES_PREVIEW_COUNT && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowAllCategories((v) => !v)}
                className="ap-secondary"
              >
                {showAllCategories ? 'Voir moins' : 'Voir plus'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="py-10 sm:py-16 px-4 sm:px-6 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-8">Comment ça marche</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: ClipboardList, title: 'Décrivez votre besoin', desc: 'Sélectionnez un service et précisez votre localisation.', step: '1' },
              { icon: UserCheck, title: 'Choisissez votre pro', desc: 'Comparez les profils disponibles près de chez vous.', step: '2' },
              { icon: CreditCard, title: 'Échangez et convenez du tarif', desc: 'Discutez directement avec le professionnel avant de valider la prestation.', step: '3' },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="rounded-3xl bg-background p-6 text-center sm:p-8"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-dark/10 flex items-center justify-center mx-auto mb-3">
                  <s.icon className="w-7 h-7 text-emerald-dark" />
                </div>
                <div className="text-xs tracking-widest font-bold text-primary mb-2">ÉTAPE {s.step}</div>
                <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Professionnels disponibles / état vide crédible */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-6">Professionnels disponibles</h2>
          {!prosLoading && professionals.length === 0 && (
            <div className="mx-auto max-w-lg rounded-3xl border border-border/50 bg-white p-8 text-center">
              <p className="text-sm text-muted-foreground">Aucun professionnel disponible dans cette zone pour le moment.</p>
              <Link href="/signup" className="ap-button mt-5 inline-flex">Devenir l&apos;un des premiers professionnels</Link>
            </div>
          )}
          {professionals.length > 0 && (
            <div className="grid md:grid-cols-3 gap-4">
              {professionals.map((pro, i) => (
                <motion.div
                  key={pro.id}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <ProfessionalCard pro={pro}/>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Localisation */}
      <section className="py-10 sm:py-16 px-4 sm:px-6 bg-white">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 text-center">
            <MapPinned className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display">Où avez-vous besoin d&apos;un professionnel ?</h2>
          </div>
          <div className="rounded-3xl border border-border/50 bg-background p-5 sm:p-6">
            <LocationPicker
              variant="panel"
              value={panelLoc}
              onChange={(loc) => { setPanelLoc(loc); goToRecherche(loc) }}
              submitLabel="Voir les professionnels"
            />
          </div>
        </div>
      </section>

      {/* CTA Pro */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="ap-home-hero bg-primary rounded-[2rem] p-8 md:p-12 text-center text-white">
            <h2 className="text-xl md:text-2xl font-bold font-display mb-2">Vous êtes un professionnel ?</h2>
            <p className="text-sm text-white/80 mb-5">Présentez votre savoir-faire et recevez des demandes de clients près de chez vous.</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-gold hover:bg-gold-dark text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Créer mon profil professionnel <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter/>
    </div>
  )
}
