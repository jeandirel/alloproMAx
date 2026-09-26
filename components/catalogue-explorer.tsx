'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Search, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid,
  Wrench, Sparkles, Truck, Car, Cpu, ShieldCheck, Scissors, PartyPopper,
  GraduationCap, Briefcase, Building2, Leaf, Gamepad2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { normalizeServiceName } from '@/lib/service-normalize'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'

// ---------------------------------------------------------------------------
// Wired into pro-dossier.tsx ("Mes services (catalogue)") and
// recherche-client.tsx ("Service précis"). Modeled closely on
// components/location-picker.tsx and components/service-picker.tsx (same
// popover/drawer shell, module-level caches, debounced search, "not found"
// suggestion sub-flow) but adds the two things the product spec asks for on
// top of ServicePicker: a type-aware search (a "plombier" query surfaces the
// Plomberie sous-catégorie/catégorie as a "voir tout" entry instead of a
// dead-end leaf) and an explicit "Toutes les catégories" browse/drill-down
// mode (category grid -> subcategory list -> service list) with full
// keyboard navigation.
// ---------------------------------------------------------------------------

/**
 * A resolved Category -> ServiceSubcategory -> CatalogService selection.
 * Only IDs travel through onChange — names are resolved internally (from the
 * browse lists or a search result) and folded into `displayName` so
 * consumers don't need to re-fetch names just to render a label.
 */
export interface CatalogueExplorerValue {
  categoryId?: string | null
  subcategoryId?: string | null
  serviceId?: string | null
  /** Pre-formatted label, safe to render immediately. */
  displayName?: string
}

export interface CatalogueExplorerProps {
  value: CatalogueExplorerValue | null
  onChange: (next: CatalogueExplorerValue | null) => void
  /** Fallback label shown on the trigger when nothing is selected. */
  placeholder?: string
  /** Controls the trigger's visual style only — content/behavior is identical. */
  variant?: 'popover' | 'inline'
  className?: string
  /**
   * Pre-scope where the picker opens (e.g. arriving from a category link
   * elsewhere in the app) without committing an actual selection. Only used
   * as a fallback when `value` itself doesn't already specify a position —
   * unlike `value`, these never mark the picker as "has a selection".
   */
  initialCategoryId?: string | null
  initialSubcategoryId?: string | null
}

interface CategoryOption { id: string; name: string; slug: string; icon: string | null }
interface SubcategoryOption { id: string; name: string; slug: string; categoryId: string; description?: string | null }
interface ServiceOption { id: string; name: string; slug: string; subcategoryId: string; categoryId: string }
interface SearchResult {
  id: string
  type: 'service' | 'subcategory' | 'category'
  name: string
  subcategoryName: string | null
  categoryName: string | null
  displayShort: string
  displayFull: string
}

// A single unified item type so search results and the three browse levels
// (categories / subcategories / services) can share one keyboard-navigable
// list and one `activate()` handler.
type NavItem =
  | { kind: 'result'; result: SearchResult }
  | { kind: 'category'; category: CategoryOption }
  | { kind: 'subcategory'; subcategory: SubcategoryOption }
  | { kind: 'service'; service: ServiceOption }

// ---------------------------------------------------------------------------
// Module-level caches. Categories are a fixed ~13-row taxonomy fetched once
// per app session; subcategories/services are cached per parent id so
// re-entering a previously-visited category/subcategory doesn't refetch —
// each level is only ever fetched once it is actually selected, never
// upfront (mirrors components/location-picker.tsx).
// ---------------------------------------------------------------------------

let categoriesCache: CategoryOption[] | null = null
let categoriesPromise: Promise<CategoryOption[]> | null = null
const subcategoriesCache = new Map<string, SubcategoryOption[]>()
const subcategoriesPromises = new Map<string, Promise<SubcategoryOption[]>>()
const servicesCache = new Map<string, ServiceOption[]>()
const servicesPromises = new Map<string, Promise<ServiceOption[]>>()

async function fetchCategories(): Promise<CategoryOption[]> {
  if (categoriesCache) return categoriesCache
  if (!categoriesPromise) {
    categoriesPromise = (async () => {
      const r = await fetch('/api/services/categories')
      if (!r.ok) throw new Error('Catégories indisponibles.')
      const data = await r.json()
      const categories: CategoryOption[] = data.categories ?? []
      categoriesCache = categories
      return categories
    })().catch((e) => { categoriesPromise = null; throw e })
  }
  return categoriesPromise
}

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

async function fetchServices(subcategoryId: string): Promise<ServiceOption[]> {
  const cached = servicesCache.get(subcategoryId)
  if (cached) return cached
  let promise = servicesPromises.get(subcategoryId)
  if (!promise) {
    promise = (async () => {
      // NOTE: the product spec's backend contract names this
      // `GET /api/services/list?subcategoryId=`; the route actually shipped
      // by the parallel backend stage is `GET /api/services/catalog?subcategoryId=`
      // (verified against app/api/services/catalog/route.ts) — using the real,
      // already-working path here rather than the paraphrased one.
      const r = await fetch(`/api/services/catalog?subcategoryId=${encodeURIComponent(subcategoryId)}`)
      if (!r.ok) throw new Error('Services indisponibles.')
      const data = await r.json()
      const services: ServiceOption[] = data.services ?? []
      servicesCache.set(subcategoryId, services)
      return services
    })().catch((e) => { servicesPromises.delete(subcategoryId); throw e })
    servicesPromises.set(subcategoryId, promise)
  }
  return promise
}

// ---------------------------------------------------------------------------
// Category icon resolution — reuses the lucide-react package already used
// throughout the app (see components/service-picker.tsx, lib/data.ts) rather
// than adding a new icon dependency. `category.icon` (a free-text column,
// currently always null in the seeded data) wins if it names one of the
// icons below; otherwise we match on keywords found in the category's own
// name so newly-added categories still get a sensible icon with no code
// change. Falls back to a generic grid icon.
// ---------------------------------------------------------------------------

const ICONS_BY_NAME: Record<string, LucideIcon> = {
  wrench: Wrench, sparkles: Sparkles, truck: Truck, car: Car, cpu: Cpu,
  shieldcheck: ShieldCheck, scissors: Scissors, partypopper: PartyPopper,
  graduationcap: GraduationCap, briefcase: Briefcase, building2: Building2,
  leaf: Leaf, gamepad2: Gamepad2, layoutgrid: LayoutGrid,
}

const CATEGORY_ICON_RULES: { test: RegExp; icon: LucideIcon }[] = [
  { test: /travaux|plomb|construction|batiment|renovation|maconnerie/, icon: Wrench },
  { test: /entretien|menage|nettoyage/, icon: Sparkles },
  { test: /transport|logistique|demenagement|livraison/, icon: Truck },
  { test: /automobile|moto|vehicule|mecanique/, icon: Car },
  { test: /electronique|informatique|ordinateur|telephone/, icon: Cpu },
  { test: /securite|surveillance|gardien/, icon: ShieldCheck },
  { test: /beaute|mode|bien.?etre|coiffure|esthetique/, icon: Scissors },
  { test: /evenement|prestation|fete|mariage/, icon: PartyPopper },
  { test: /education|famille|aide a la personne|enfant|garde/, icon: GraduationCap },
  { test: /professionnel|digital|juridique|comptab|marketing/, icon: Briefcase },
  { test: /immobilier|etude technique|architecte|geometre/, icon: Building2 },
  { test: /agriculture|peche|nature|elevage/, icon: Leaf },
  { test: /loisir|divers|animation|sport/, icon: Gamepad2 },
]

function resolveCategoryIcon(category: CategoryOption): LucideIcon {
  if (category.icon) {
    const explicit = ICONS_BY_NAME[category.icon.trim().toLowerCase()]
    if (explicit) return explicit
  }
  const normalized = normalizeServiceName(category.name)
  const rule = CATEGORY_ICON_RULES.find((r) => r.test.test(normalized))
  return rule?.icon ?? LayoutGrid
}

export function CatalogueExplorer({ value, onChange, placeholder = 'Choisir un service', variant = 'popover', className, initialCategoryId, initialSubcategoryId }: CatalogueExplorerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const open = popoverOpen || drawerOpen

  const [categories, setCategories] = useState<CategoryOption[]>(() => categoriesCache ?? [])
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(false)

  // Browse (drill-down) position: '' at a level means "not drilled into yet".
  const [browseCategoryId, setBrowseCategoryId] = useState('')
  const [browseCategoryName, setBrowseCategoryName] = useState('')
  const [browseSubcategoryId, setBrowseSubcategoryId] = useState('')
  const [browseSubcategoryName, setBrowseSubcategoryName] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [showSuggestForm, setShowSuggestForm] = useState(false)
  const [suggestCategoryId, setSuggestCategoryId] = useState('')
  const [suggestSubcategoryId, setSuggestSubcategoryId] = useState('')
  const [suggestSubcategories, setSuggestSubcategories] = useState<SubcategoryOption[]>([])
  const [suggestName, setSuggestName] = useState('')
  const [suggestDescription, setSuggestDescription] = useState('')
  const [suggestSubmitting, setSuggestSubmitting] = useState(false)

  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = 'catalogue-explorer-listbox'

  const isSearching = searchQuery.trim().length >= 2
  const triggerLabel = value?.displayName?.trim() || placeholder

  // Load categories once (module cache) whenever the picker is opened.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchCategories()
      .then((list) => { if (!cancelled) setCategories(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les catégories.') })
    return () => { cancelled = true }
  }, [open])

  // Reset all transient UI (browse position, search, suggestion form) each
  // time the picker (re)opens, seeded from the committed value so reopening
  // a picker that already has a selection starts back where it left off.
  useEffect(() => {
    if (!open) return
    setBrowseCategoryId(value?.categoryId || initialCategoryId || '')
    setBrowseSubcategoryId(value?.subcategoryId || initialSubcategoryId || '')
    setBrowseCategoryName('')
    setBrowseSubcategoryName('')
    setSearchQuery('')
    setSearchResults([])
    setShowSuggestForm(false)
    setHighlightedIndex(-1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Subcategories depend on the browse category only — fetched only once a
  // category is actually selected, never upfront.
  useEffect(() => {
    if (!open || !browseCategoryId) { setSubcategories([]); return }
    let cancelled = false
    setSubcategoriesLoading(true)
    fetchSubcategories(browseCategoryId)
      .then((list) => { if (!cancelled) setSubcategories(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les sous-catégories.') })
      .finally(() => { if (!cancelled) setSubcategoriesLoading(false) })
    return () => { cancelled = true }
  }, [open, browseCategoryId])

  // Services depend on the browse subcategory only.
  useEffect(() => {
    if (!open || !browseSubcategoryId) { setServices([]); return }
    let cancelled = false
    setServicesLoading(true)
    fetchServices(browseSubcategoryId)
      .then((list) => { if (!cancelled) setServices(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les services.') })
      .finally(() => { if (!cancelled) setServicesLoading(false) })
    return () => { cancelled = true }
  }, [open, browseSubcategoryId])

  // Debounced free-text search (250ms, min 2 chars).
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return }
    let cancelled = false
    const controller = new AbortController()
    setSearchLoading(true)
    const timer = setTimeout(() => {
      fetch(`/api/services/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error('Recherche indisponible.')
          const data = await r.json()
          if (cancelled) return
          const results: SearchResult[] = (data.results ?? []).map((raw: Partial<SearchResult> & { id: string; name: string }) => ({
            id: raw.id,
            type: raw.type ?? 'service',
            name: raw.name,
            subcategoryName: raw.subcategoryName ?? null,
            categoryName: raw.categoryName ?? null,
            displayShort: raw.displayShort ?? raw.name,
            displayFull: raw.displayFull ?? raw.name,
          }))
          setSearchResults(results)
        })
        .catch((e) => {
          if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return
          console.error(e)
          toast.error('Recherche de service indisponible.')
        })
        .finally(() => { if (!cancelled) setSearchLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [searchQuery])

  // Suggestion form's own subcategory list, scoped to whichever category the
  // user picked inside the form (may differ from the current browse position).
  useEffect(() => {
    if (!showSuggestForm || !suggestCategoryId) { setSuggestSubcategories([]); return }
    let cancelled = false
    fetchSubcategories(suggestCategoryId)
      .then((list) => { if (!cancelled) setSuggestSubcategories(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les sous-catégories.') })
    return () => { cancelled = true }
  }, [showSuggestForm, suggestCategoryId])

  // The single list currently visible (search results, or whichever browse
  // level is active) — shared by rendering and keyboard navigation.
  const activeItems: NavItem[] = useMemo(() => {
    if (isSearching) return searchResults.map((result) => ({ kind: 'result', result }))
    if (browseSubcategoryId) return services.map((service) => ({ kind: 'service', service }))
    if (browseCategoryId) return subcategories.map((subcategory) => ({ kind: 'subcategory', subcategory }))
    return categories.map((category) => ({ kind: 'category', category }))
  }, [isSearching, searchResults, browseSubcategoryId, services, browseCategoryId, subcategories, categories])

  // Reset the keyboard-highlighted item whenever the visible list changes
  // (new search, drilled in/out of a level).
  useEffect(() => {
    setHighlightedIndex(-1)
    itemRefs.current = []
  }, [isSearching, searchQuery, browseCategoryId, browseSubcategoryId])

  function closeAll() {
    setPopoverOpen(false)
    setDrawerOpen(false)
  }

  function commitService(service: { id: string; name: string }, categoryId: string, categoryName: string, subcategoryId: string, subcategoryName: string) {
    const displayName = [service.name, subcategoryName, categoryName].filter(Boolean).join(' · ')
    onChange({ categoryId: categoryId || null, subcategoryId: subcategoryId || null, serviceId: service.id, displayName })
    setSearchQuery('')
    setSearchResults([])
    closeAll()
  }

  function activate(item: NavItem) {
    if (item.kind === 'category') {
      setBrowseCategoryId(item.category.id)
      setBrowseCategoryName(item.category.name)
      setBrowseSubcategoryId('')
      setBrowseSubcategoryName('')
      return
    }
    if (item.kind === 'subcategory') {
      setBrowseSubcategoryId(item.subcategory.id)
      setBrowseSubcategoryName(item.subcategory.name)
      return
    }
    if (item.kind === 'service') {
      commitService(item.service, browseCategoryId, browseCategoryName, browseSubcategoryId, browseSubcategoryName)
      return
    }
    // Search result.
    const r = item.result
    if (r.type === 'category') {
      setBrowseCategoryId(r.id)
      setBrowseCategoryName(r.name)
      setBrowseSubcategoryId('')
      setBrowseSubcategoryName('')
      setSearchQuery('')
      setSearchResults([])
      return
    }
    if (r.type === 'subcategory') {
      setBrowseCategoryId('')
      setBrowseCategoryName(r.categoryName || '')
      setBrowseSubcategoryId(r.id)
      setBrowseSubcategoryName(r.name)
      setSearchQuery('')
      setSearchResults([])
      return
    }
    // A specific service — we only have parent names (not ids) from the
    // search result, same tradeoff components/service-picker.tsx makes.
    onChange({ categoryId: null, subcategoryId: null, serviceId: r.id, displayName: r.displayFull })
    setSearchQuery('')
    setSearchResults([])
    closeAll()
  }

  function goBack() {
    if (browseSubcategoryId) { setBrowseSubcategoryId(''); setBrowseSubcategoryName(''); return }
    if (browseCategoryId) { setBrowseCategoryId(''); setBrowseCategoryName(''); return }
  }

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); closeAll(); return }
    if (!activeItems.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => {
        const next = i < activeItems.length - 1 ? i + 1 : 0
        itemRefs.current[next]?.focus()
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => {
        const next = i > 0 ? i - 1 : activeItems.length - 1
        itemRefs.current[next]?.focus()
        return next
      })
    } else if (e.key === 'Enter' && document.activeElement === searchInputRef.current) {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      const target = activeItems[idx]
      if (target) activate(target)
    }
  }

  function openSuggestForm() {
    setShowSuggestForm(true)
    setSuggestCategoryId(browseCategoryId || '')
    setSuggestSubcategoryId(browseSubcategoryId || '')
    setSuggestName(searchQuery.trim())
    setSuggestDescription('')
  }

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault()
    if (!suggestCategoryId || !suggestName.trim()) return
    setSuggestSubmitting(true)
    try {
      // NOTE: the product spec's backend contract names this
      // `POST /api/services/suggestions`; the route actually shipped by the
      // parallel backend stage is `POST /api/service-suggestions` (verified
      // against app/api/service-suggestions/route.ts) — using the real,
      // already-working path here rather than the paraphrased one. The
      // request/response shapes match the contract exactly.
      const res = await fetch('/api/service-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposedName: suggestName.trim(),
          categoryId: suggestCategoryId,
          subcategoryId: suggestSubcategoryId || undefined,
          description: suggestDescription.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Suggestion impossible.'); return }

      if (data.status === 'created') {
        toast.success('Merci ! Votre proposition a été envoyée à notre équipe. Elle apparaîtra sur Allo Pro après validation.')
        setShowSuggestForm(false)
        setSuggestName('')
        setSuggestDescription('')
        return
      }
      if (data.status === 'exists') {
        toast.info('Ce service existe déjà.')
        const category = categories.find((c) => c.id === suggestCategoryId)
        const subcategory = suggestSubcategories.find((s) => s.id === suggestSubcategoryId)
        onChange({
          categoryId: suggestCategoryId,
          subcategoryId: suggestSubcategoryId || null,
          serviceId: data.existing.id,
          displayName: [data.existing.name, subcategory?.name, category?.name].filter(Boolean).join(' · '),
        })
        setShowSuggestForm(false)
        closeAll()
        return
      }
      if (data.status === 'already_pending') {
        toast.info('Ce service a déjà été proposé et est en cours de validation.')
      }
    } catch (e) {
      console.error(e)
      toast.error('Suggestion impossible. Réessayez plus tard.')
    } finally {
      setSuggestSubmitting(false)
    }
  }

  function renderTrigger() {
    if (variant === 'inline') {
      return (
        <button type="button" className="ap-input flex items-center justify-between gap-2 text-left" aria-label="Choisir un service">
          <span className="flex min-w-0 items-center gap-2">
            <Wrench size={18} className="shrink-0 text-emerald-dark" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
        </button>
      )
    }
    return (
      <button type="button" className="ap-secondary rounded-full !px-4" aria-label="Choisir un service">
        <Wrench size={16} className="shrink-0" />
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{triggerLabel}</span>
        <ChevronDown size={14} className="shrink-0 opacity-70" />
      </button>
    )
  }

  function renderResultRow(index: number, key: string, primary: React.ReactNode, secondary: React.ReactNode, onClick: () => void, showChevron: boolean) {
    return (
      <button
        key={key}
        ref={(el) => { itemRefs.current[index] = el }}
        id={`${listboxId}-opt-${index}`}
        role="option"
        aria-selected={highlightedIndex === index}
        type="button"
        className={cn(
          'flex w-full min-h-[3rem] items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0 hover:bg-emerald-50 focus:outline-none focus-visible:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-dark',
          highlightedIndex === index && 'bg-emerald-50'
        )}
        onClick={onClick}
        onMouseEnter={() => setHighlightedIndex(index)}
      >
        <span className="flex min-w-0 flex-col items-start gap-0.5">{primary}{secondary}</span>
        {showChevron && <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
      </button>
    )
  }

  function renderSearchResults() {
    if (searchLoading) return <p className="p-3 text-sm text-muted-foreground">Recherche…</p>
    if (!searchResults.length) return <p className="p-3 text-sm text-muted-foreground">Aucun résultat pour « {searchQuery.trim()} ».</p>
    return searchResults.map((r, index) => {
      const isDrill = r.type === 'category' || r.type === 'subcategory'
      return renderResultRow(
        index,
        `${r.type}-${r.id}`,
        isDrill
          ? <span className="text-sm font-semibold text-emerald-dark">Voir tous les services de {r.name}</span>
          : <span className="text-sm font-semibold text-foreground">{r.name}</span>,
        isDrill
          ? <span className="text-xs text-muted-foreground">{r.type === 'category' ? 'Catégorie' : [r.categoryName].filter(Boolean).join(' · ') || 'Sous-catégorie'}</span>
          : <span className="text-xs text-muted-foreground">{[r.subcategoryName, r.categoryName].filter(Boolean).join(' · ')}</span>,
        () => activate({ kind: 'result', result: r }),
        isDrill
      )
    })
  }

  function renderBrowseLevel() {
    if (browseSubcategoryId) {
      if (servicesLoading) return <p className="p-3 text-sm text-muted-foreground">Chargement…</p>
      if (!services.length) return <p className="p-3 text-sm text-muted-foreground">Aucun service dans cette sous-catégorie.</p>
      return services.map((s, index) => renderResultRow(
        index, s.id,
        <span className="text-sm font-semibold text-foreground">{s.name}</span>,
        null,
        () => activate({ kind: 'service', service: s }),
        false
      ))
    }
    if (browseCategoryId) {
      if (subcategoriesLoading) return <p className="p-3 text-sm text-muted-foreground">Chargement…</p>
      if (!subcategories.length) return <p className="p-3 text-sm text-muted-foreground">Aucune sous-catégorie.</p>
      return subcategories.map((s, index) => renderResultRow(
        index, s.id,
        <span className="text-sm font-semibold text-foreground">{s.name}</span>,
        null,
        () => activate({ kind: 'subcategory', subcategory: s }),
        true
      ))
    }
    if (!categories.length) return <p className="p-3 text-sm text-muted-foreground">Chargement…</p>
    return (
      <div className="grid grid-cols-2 gap-2.5 p-1">
        {categories.map((c, index) => {
          const Icon = resolveCategoryIcon(c)
          return (
            <button
              key={c.id}
              ref={(el) => { itemRefs.current[index] = el }}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={highlightedIndex === index}
              type="button"
              className={cn(
                'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-white px-2 py-3 text-center hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-dark',
                highlightedIndex === index && 'bg-emerald-50 ring-2 ring-emerald-dark'
              )}
              onClick={() => activate({ kind: 'category', category: c })}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <Icon size={20} className="shrink-0 text-emerald-dark" />
              <span className="text-xs font-semibold leading-tight text-foreground">{c.name}</span>
            </button>
          )
        })}
      </div>
    )
  }

  function renderSearchAndBrowse() {
    return (
      <>
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            className="ap-input pl-9 focus-visible:ring-2 focus-visible:ring-emerald-dark"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un service (ex. débouchage, tresses, plombier…)"
            aria-label="Rechercher un service ou une catégorie"
            role="combobox"
            aria-expanded={isSearching}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined}
          />
        </div>

        {isSearching ? (
          <div id={listboxId} role="listbox" aria-label="Résultats de recherche" className="overflow-hidden rounded-xl border border-border/60 bg-white">
            {renderSearchResults()}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              {(browseCategoryId || browseSubcategoryId) ? (
                <button type="button" className="flex items-center gap-1 text-sm font-semibold text-emerald-dark hover:underline" onClick={goBack}>
                  <ChevronLeft size={16} /> Retour
                </button>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <LayoutGrid size={15} className="text-emerald-dark" /> Toutes les catégories
                </p>
              )}
              {(browseCategoryName || browseSubcategoryName) && (
                <p className="truncate text-xs text-muted-foreground">{[browseCategoryName, browseSubcategoryName].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <div id={listboxId} role="listbox" aria-label="Catégories, sous-catégories et services" className={cn(browseCategoryId || browseSubcategoryId ? 'overflow-hidden rounded-xl border border-border/60 bg-white' : undefined)}>
              {renderBrowseLevel()}
            </div>
          </div>
        )}
      </>
    )
  }

  function renderNotFoundSection() {
    if (!showSuggestForm) {
      return (
        <div className="border-t border-border/60 pt-4 text-sm">
          <p className="text-muted-foreground">Vous ne trouvez pas le service recherché ?</p>
          <button type="button" className="mt-1 font-semibold text-emerald-dark hover:underline" onClick={openSuggestForm}>
            + Proposer un service
          </button>
        </div>
      )
    }
    return (
      <form onSubmit={submitSuggestion} className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Proposer un service</p>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowSuggestForm(false)}>Annuler</button>
        </div>
        <label className="ap-label">
          Catégorie *
          <select className="ap-input mt-1.5" required value={suggestCategoryId} onChange={(e) => { setSuggestCategoryId(e.target.value); setSuggestSubcategoryId('') }}>
            <option value="">Sélectionner une catégorie</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="ap-label">
          Sous-catégorie <span className="font-normal text-muted-foreground">(facultatif)</span>
          <select className="ap-input mt-1.5" value={suggestSubcategoryId} onChange={(e) => setSuggestSubcategoryId(e.target.value)} disabled={!suggestCategoryId}>
            <option value="">Sélectionner une sous-catégorie</option>
            {suggestSubcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="ap-label">
          Nom du service *
          <input
            className="ap-input mt-1.5"
            required
            value={suggestName}
            onChange={(e) => setSuggestName(e.target.value)}
            placeholder="Ex. Réparation antenne parabolique"
            maxLength={80}
          />
        </label>
        <label className="ap-label">
          Description (facultatif)
          <textarea
            className="ap-input mt-1.5"
            value={suggestDescription}
            onChange={(e) => setSuggestDescription(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Précisions utiles pour l'équipe de modération"
          />
        </label>
        <button type="submit" className="ap-button w-full" disabled={suggestSubmitting}>
          {suggestSubmitting ? 'Envoi…' : 'Envoyer la proposition'}
        </button>
      </form>
    )
  }

  return (
    <div className={cn(variant === 'inline' ? 'block w-full' : 'inline-block', className)}>
      {/* Desktop / tablet: Popover */}
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
          <PopoverContent align="start" className="w-[24rem] max-w-[90vw] rounded-2xl border-border/60 p-4" onKeyDown={handleContainerKeyDown}>
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
              {renderSearchAndBrowse()}
              {renderNotFoundSection()}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile: near-fullscreen Drawer */}
      <div className="md:hidden">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
          <DrawerContent className="max-h-[92vh]" onKeyDown={handleContainerKeyDown}>
            <DrawerHeader className="text-left">
              <DrawerTitle>Choisissez un service</DrawerTitle>
              <DrawerDescription>Recherchez ou parcourez les catégories, sous-catégories et services.</DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              {renderSearchAndBrowse()}
              {renderNotFoundSection()}
            </div>
            <DrawerFooter>
              <button type="button" className="ap-secondary w-full" onClick={closeAll}>Fermer</button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  )
}
