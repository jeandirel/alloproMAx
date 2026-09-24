'use client'

import Link from 'next/link'
import Image from '@/components/smart-image'
import { useState } from 'react'
import { quartiers } from '@/lib/data'
import { motion } from 'framer-motion'
import {
  BadgeCheck, ShieldCheck,
  Wrench, Zap, Sparkles, Scissors, Car, Wind, Truck, BookOpen,
  MapPin, Star, ArrowRight,
  ClipboardList, UserCheck, CreditCard,
} from 'lucide-react'
import { SearchBar } from '@/components/search-bar'
import { ProfessionalCard } from '@/components/professional-card'
import { CounterAnimation } from '@/components/counter-animation'
import { professionals } from '@/lib/data'

const categoryIcons: Record<string, React.ElementType> = {
  Wrench, Zap, Sparkles, Scissors, Car, Wind, Truck, BookOpen,
}

const categories = [
  { nom: 'Plomberie', icon: 'Wrench' },
  { nom: 'Électricité', icon: 'Zap' },
  { nom: 'Ménage', icon: 'Sparkles' },
  { nom: 'Beauté & Bien-être', icon: 'Scissors' },
  { nom: 'Mécanique auto', icon: 'Car' },
  { nom: 'Climatisation', icon: 'Wind' },
  { nom: 'Transport', icon: 'Truck' },
  { nom: 'Tutorat', icon: 'BookOpen' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
}

export function LandingPage() {
  const featuredPros = professionals.filter((p) => p.enLigne).slice(0, 3)
  const [zone, setZone] = useState('Libreville Centre')

  return (
    <div className="ap-landing min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[76px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-emerald-dark font-display">Allo-Pro</span>
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

      <p className="text-center text-xs bg-amber-50 text-amber-950 px-4 py-2">Version de démonstration · Profils, avis et chiffres fictifs · Aucun paiement réel</p>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div className="min-w-0">
            <p className="ap-eyebrow mb-5 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gold"/>Le savoir-faire d’ici, pour vous</p>
            <h1 className="max-w-xl text-balance font-display text-4xl font-extrabold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-6xl">Un pro de <span className="text-primary">confiance.</span><br/>Une maison sereine.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">Le bon professionnel, au bon moment. Découvrez des services à domicile et des professionnels vérifiés à Libreville.</p>
            <div className="mt-7 rounded-3xl border border-border/40 bg-white p-3 shadow-lg sm:p-4">
              <SearchBar zone={zone}/>
              <label className="mt-3 flex min-w-0 items-center gap-2 px-2 text-sm text-muted-foreground"><MapPin size={17} className="shrink-0 text-primary"/><span className="sr-only">Votre quartier au Gabon</span><select className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-base text-foreground" value={zone} onChange={e=>setZone(e.target.value)}>{quartiers.map(q=><option key={q}>{q}</option>)}</select><span className="text-xs">Gabon</span></label>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-1.5"><BadgeCheck size={16} className="text-primary"/>Profils vérifiés</span><span className="flex items-center gap-1.5"><ClipboardList size={16} className="text-primary"/>Tarifs détaillés</span><span className="flex items-center gap-1.5"><CreditCard size={16} className="text-primary"/>Paiement de test</span></div>
          </div>
          <div className="relative min-w-0 rounded-[2rem] bg-primary/10 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-widest text-primary">Des talents près de vous</span><ArrowRight size={18} className="text-primary"/></div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">{featuredPros.slice(0,2).map((pro,i)=><Link key={pro.id} href={`/professionnel/${pro.id}`} className={`group block overflow-hidden rounded-2xl bg-white shadow-sm ${i===1?'mt-8':'mb-8'}`}><div className="relative aspect-[4/5] overflow-hidden bg-muted"><Image src={pro.photo} alt={`Portrait illustratif de ${pro.name}`} fill priority className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105" sizes="(max-width: 640px) 40vw, (max-width: 1024px) 42vw, 240px"/></div><div className="p-3 sm:p-4"><p className="text-xs font-semibold text-primary">{pro.metier}</p><p className="mt-1 font-display text-sm font-bold leading-snug sm:text-base">{pro.name}</p><span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><BadgeCheck size={14} className="shrink-0 text-primary"/>Profil vérifié · Démo</span></div></Link>)}</div>
            <div className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-white"><ShieldCheck size={25} className="shrink-0"/><div><p className="text-sm font-semibold">Votre quotidien mérite du soin.</p><p className="mt-1 text-xs leading-relaxed text-white/85">Comparez, échangez, puis réservez.</p></div></div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Portraits illustratifs · Professionnels fictifs</p>
          </div>
        </div>
      </section>

      {/* Catégories */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-6">Nos catégories de services</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4">
            {categories.map((cat, i) => {
              const Icon = categoryIcons[cat.icon] ?? Wrench
              return (
                <motion.div
                  key={cat.nom}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <Link
                    href={`/recherche?cat=${encodeURIComponent(cat.nom)}`}
                    className="ap-category-card group"
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-dark/10 flex items-center justify-center group-hover:bg-emerald-dark/15 transition-colors">
                      <Icon className="w-5 h-5 md:w-6 md:h-6 text-emerald-dark" />
                    </div>
                    <span className="text-sm font-semibold text-foreground leading-snug">{cat.nom}</span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="py-10 sm:py-16 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-8">Comment ça marche</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: ClipboardList, title: 'Décrivez votre besoin', desc: 'Sélectionnez un service et décrivez précisément ce dont vous avez besoin.', step: '1' },
              { icon: UserCheck, title: 'Choisissez votre pro', desc: 'Comparez les profils, avis et tarifs pour trouver le professionnel idéal.', step: '2' },
              { icon: CreditCard, title: 'Découvrez le paiement de test', desc: 'Simulez votre règlement Mobile Money. Le versement est autorisé après validation, hors litige.', step: '3' },
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

      {/* Chiffres de démonstration */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <p className="mb-5 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">Chiffres illustratifs de démonstration</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: 1200, suffix: '+', label: 'Professionnels vérifiés' },
              { value: 8500, suffix: '+', label: 'Missions réalisées' },
              { value: 4.8, suffix: '/5', label: 'Note moyenne' },
              { value: 7, suffix: '', label: 'Provinces couvertes' },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-xl p-4 text-center shadow-sm border border-border/50"
              >
                <div className="text-2xl md:text-3xl font-bold text-emerald-dark font-display">
                  <CounterAnimation target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Professionnels mis en avant */}
      <section className="py-10 sm:py-16 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-6">Professionnels recommandés</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {featuredPros.map((pro, i) => (
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
        </div>
      </section>

      {/* Témoignages */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl tracking-tight font-bold text-foreground font-display text-center mb-6">Des exemples d’expériences clients</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { nom: 'Estelle Mouanga', photo: 'https://randomuser.me/api/portraits/women/45.jpg', quartier: 'Akanda', note: 5, texte: 'Service impeccable ! Mon plombier est arrivé en 25 minutes et a réparé la fuite rapidement. Merci Allo-Pro !' },
              { nom: 'Olivier Mba', photo: 'https://randomuser.me/api/portraits/men/52.jpg', quartier: 'Libreville Centre', note: 5, texte: 'Enfin une plateforme fiable au Gabon. Les professionnels sont vérifiés et compétents. Je recommande.' },
              { nom: 'Patricia Engone', photo: 'https://randomuser.me/api/portraits/women/62.jpg', quartier: 'Owendo', note: 4, texte: 'Très pratique pour le ménage à domicile. Marie-Claire fait un travail exceptionnel chaque semaine.' },
            ].map((t, i) => (
              <motion.div
                key={t.nom}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="bg-white rounded-3xl p-6 shadow-sm border border-border/40"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{t.nom.split(" ").map(n=>n[0]).join("")}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.nom}</p>
                    <p className="text-xs text-muted-foreground">{t.quartier}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 mb-2">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star key={si} className={`w-3.5 h-3.5 ${si < t.note ? 'fill-gold text-gold' : 'fill-gray-200 text-gray-200'}`} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-7">{t.texte}</p><p className="mt-3 text-xs text-muted-foreground">Témoignage fictif de démonstration</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Pro */}
      <section className="py-10 sm:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="ap-home-hero bg-primary rounded-[2rem] p-8 md:p-12 text-center text-white">
            <h2 className="text-xl md:text-2xl font-bold font-display mb-2">Vous êtes un professionnel ?</h2>
            <p className="text-sm text-white/80 mb-5">Présentez votre savoir-faire et découvrez comment recevoir des missions près de chez vous.</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-gold hover:bg-gold-dark text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Rejoindre Allo-Pro <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-white border-t border-border">
        <div className="max-w-6xl mx-auto text-center">
          <span className="text-lg font-bold text-emerald-dark font-display">Allo-Pro</span>
          <p className="text-xs text-muted-foreground mt-1">Le bon professionnel, au bon moment.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-4 text-sm text-muted-foreground">
            <Link href="/contact" className="hover:text-emerald-dark transition-colors">Contact</Link>
            <Link href="/cgu" className="hover:text-emerald-dark transition-colors">CGU de la démo</Link>
            <Link href="/confidentialite" className="hover:text-emerald-dark transition-colors">Confidentialité</Link>
            <Link href="/contact" className="hover:text-emerald-dark transition-colors">Réseaux sociaux</Link>
          </div>
          <p className="text-xs text-muted-foreground mt-4">© 2026 Allo-Pro · Pensé pour le Gabon</p>
        </div>
      </footer>
    </div>
  )
}
