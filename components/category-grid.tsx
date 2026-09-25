'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown, Wrench, Sparkles, Truck, Car, Cpu, ShieldCheck, Scissors,
  PartyPopper, BookOpen, Briefcase, Building2, Sprout, Gamepad2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Keyed by real category name (from GET /api/services/categories) since the
// DB's `icon` column isn't populated yet — falls back to Wrench for any
// category added later that isn't in this list.
const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  'Maison & Travaux': Wrench,
  'Maison & Entretien': Sparkles,
  'Transport & Logistique': Truck,
  'Automobile & Moto': Car,
  'Électronique & Informatique': Cpu,
  'Sécurité': ShieldCheck,
  'Beauté, Mode & Bien-être': Scissors,
  'Événementiel & Prestations': PartyPopper,
  'Éducation, Famille & Aide à la Personne': BookOpen,
  'Services Professionnels & Digital': Briefcase,
  'Immobilier & Études Techniques': Building2,
  'Agriculture, Pêche & Nature': Sprout,
  'Loisirs & Services Divers': Gamepad2,
}

export function resolveCategoryIconByName(name: string): LucideIcon {
  return CATEGORY_ICON_MAP[name] ?? Wrench
}

export interface CategoryGridItem {
  id: string
  name: string
  icon: LucideIcon
  meta?: React.ReactNode
}

interface SubcategoryOption { id: string; name: string; slug: string }

const subcategoriesCache = new Map<string, SubcategoryOption[]>()
const subcategoriesPromises = new Map<string, Promise<SubcategoryOption[]>>()

async function fetchSubcategories(categoryId: string): Promise<SubcategoryOption[]> {
  const cached = subcategoriesCache.get(categoryId)
  if (cached) return cached
  let promise = subcategoriesPromises.get(categoryId)
  if (!promise) {
    promise = (async () => {
      const r = await fetch(`/api/services/subcategories?categoryId=${encodeURIComponent(categoryId)}`)
      if (!r.ok) throw new Error('Sous-catégories indisponibles.')
      const data = await r.json()
      const subcategories: SubcategoryOption[] = data.subcategories ?? []
      subcategoriesCache.set(categoryId, subcategories)
      return subcategories
    })().catch((e) => { subcategoriesPromises.delete(categoryId); throw e })
    subcategoriesPromises.set(categoryId, promise)
  }
  return promise
}

/**
 * Category grid used on both the public homepage and the logged-in "accueil"
 * dashboard. Clicking a card expands a panel below the grid with that
 * category's sous-catégories (each linking into /recherche pre-filtered) and
 * a "voir tous les pros" link for the category itself.
 */
export function CategoryGrid({ items, className }: { items: CategoryGridItem[]; className?: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([])
  const [loading, setLoading] = useState(false)

  function toggle(item: CategoryGridItem) {
    if (expandedId === item.id) { setExpandedId(null); return }
    setExpandedId(item.id)
    setLoading(true)
    fetchSubcategories(item.id)
      .then((list) => setSubcategories(list))
      .catch(() => setSubcategories([]))
      .finally(() => setLoading(false))
  }

  const expandedItem = items.find((i) => i.id === expandedId) || null

  return (
    <div className={className}>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4">
        {items.map((item) => {
          const Icon = item.icon
          const isOpen = expandedId === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item)}
              aria-expanded={isOpen}
              className={cn('ap-category-card group', isOpen && 'ring-2 ring-emerald-dark')}
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-dark/10 flex items-center justify-center group-hover:bg-emerald-dark/15 transition-colors">
                <Icon className="w-5 h-5 md:w-6 md:h-6 text-emerald-dark" />
              </div>
              <span className="flex items-center gap-1 text-sm font-semibold text-foreground leading-snug">
                {item.name}
                <ChevronDown size={14} className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </span>
              {item.meta}
            </button>
          )
        })}
      </div>
      {expandedItem && (
        <div className="mt-4 rounded-2xl border border-border/40 bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{expandedItem.name}</p>
            <Link
              href={`/recherche?cat=${encodeURIComponent(expandedItem.name)}&catId=${encodeURIComponent(expandedItem.id)}`}
              className="text-xs font-semibold text-emerald-dark hover:underline"
            >
              Voir tous les pros de cette catégorie
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : subcategories.length ? (
            <div className="flex flex-wrap gap-2">
              {subcategories.map((s) => (
                <Link
                  key={s.id}
                  href={`/recherche?cat=${encodeURIComponent(expandedItem.name)}&catId=${encodeURIComponent(expandedItem.id)}&subId=${encodeURIComponent(s.id)}&sub=${encodeURIComponent(s.name)}`}
                  className="rounded-full bg-emerald-dark/10 px-3 py-1.5 text-xs font-semibold text-emerald-dark transition-colors hover:bg-emerald-dark/15"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune sous-catégorie pour le moment.</p>
          )}
        </div>
      )}
    </div>
  )
}
