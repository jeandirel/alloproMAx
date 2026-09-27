'use client'

import Link from 'next/link'
import Image from '@/components/smart-image'
import { Star, MapPin, Clock, BadgeCheck, ArrowUpRight } from 'lucide-react'
import { formatFCFA, type Professional } from '@/lib/data'
import { cn } from '@/lib/utils'

export function ProfessionalCard({ pro }: { pro: Professional }) {
  return <Link href={`/professionnel/${pro.id}`} className="group flex h-full flex-col rounded-3xl border border-border/50 bg-white p-5 shadow-sm transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-lg sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">{pro.categorie}</span>
      <span className={cn('flex items-center gap-1.5 text-xs font-medium', pro.enLigne ? 'text-primary' : 'text-muted-foreground')}><span className={cn('h-1.5 w-1.5 rounded-full', pro.enLigne ? 'bg-primary' : 'bg-muted-foreground')}/>{pro.enLigne ? 'En ligne' : 'Hors ligne'}</span>
    </div>
    <div className="flex items-center gap-3">
      <div className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-2xl bg-muted"><Image src={pro.photo} alt={`Photo de ${pro.name}`} fill className="object-cover" sizes="64px"/></div>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-bold leading-snug text-foreground [overflow-wrap:anywhere]">{pro.name} {pro.verifie && <BadgeCheck aria-label="Professionnel vérifié" className="inline h-4 w-4 text-primary"/>}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{pro.metier}</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {(pro.ratingCount ?? pro.avis.length) > 0 && (
        <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-gold text-gold"/><strong className="text-foreground">{pro.note}</strong> · {pro.ratingCount ?? pro.avis.length} avis</span>
      )}
      {pro.zone && <span className="flex items-center gap-1"><MapPin size={13} className="shrink-0"/>{pro.zone}</span>}
      {pro.delaiMoyen && <span className="flex items-center gap-1"><Clock size={13}/>{pro.delaiMoyen}</span>}
    </div>
    <div className="mt-auto pt-5"><div className="flex items-end justify-between gap-2 border-t border-border/60 pt-4">
      <div><p className="text-xs text-muted-foreground">À partir de</p><p className="mt-1 font-display text-lg font-bold text-primary">{formatFCFA(pro.tarifMin)}</p></div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white"><ArrowUpRight size={20}/><span className="sr-only">Voir le profil</span></span>
    </div></div>
  </Link>
}
