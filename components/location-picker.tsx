'use client'
import { useEffect, useState } from 'react'
import { MapPin, Search, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatLocationLabel, type LocationNameParts } from '@/lib/location-format'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'

// ---------------------------------------------------------------------------
// Shared types (also used by integration stages wiring this into forms).
// ---------------------------------------------------------------------------

/**
 * A resolved location selection. Only IDs travel through onChange — name
 * strings are resolved internally from the cascading-select lists (or from
 * a search result) and folded into `displayName` so consumers don't need
 * to re-fetch names just to render a label.
 */
export interface LocationPickerValue {
  provinceId?: string | null
  cityId?: string | null
  neighborhoodId?: string | null
  /** Pre-formatted short label (see formatLocationLabel), safe to render immediately. */
  displayName?: string
}

export interface LocationPickerProps {
  value: LocationPickerValue | null
  onChange: (next: LocationPickerValue | null) => void
  /** Fallback label shown on the trigger when no location is selected. */
  placeholder?: string
  /** Controls the trigger's visual style only — content/behavior is identical. */
  variant?: 'popover' | 'inline'
  className?: string
}

interface ProvinceOption { id: string; name: string; slug: string }
interface CityOption { id: string; name: string; slug: string; provinceId: string }
interface NeighborhoodOption { id: string; name: string; slug: string; cityId: string }
interface LocationSearchResult {
  id: string
  type: 'province' | 'city' | 'neighborhood'
  name: string
  cityName: string | null
  provinceName: string | null
  /** Parent city id — present for 'neighborhood' results. */
  cityId: string | null
  /** Parent province id — present for 'city' and 'neighborhood' results. */
  provinceId: string | null
  displayShort: string
  displayFull: string
}

// ---------------------------------------------------------------------------
// Module-level caches. Provinces rarely change and are fetched once for the
// whole app session; cities/neighborhoods are cached per parent id so
// re-selecting a previously-visited province/city doesn't refetch either.
// ---------------------------------------------------------------------------

let provincesCache: ProvinceOption[] | null = null
let provincesPromise: Promise<ProvinceOption[]> | null = null
const citiesCache = new Map<string, CityOption[]>()
const citiesPromises = new Map<string, Promise<CityOption[]>>()
const neighborhoodsCache = new Map<string, NeighborhoodOption[]>()
const neighborhoodsPromises = new Map<string, Promise<NeighborhoodOption[]>>()

async function fetchProvinces(): Promise<ProvinceOption[]> {
  if (provincesCache) return provincesCache
  if (!provincesPromise) {
    provincesPromise = (async () => {
      const r = await fetch('/api/locations/provinces')
      if (!r.ok) throw new Error('Provinces indisponibles.')
      const data = await r.json()
      const provinces: ProvinceOption[] = data.provinces ?? []
      provincesCache = provinces
      return provinces
    })().catch((e) => { provincesPromise = null; throw e })
  }
  return provincesPromise
}

async function fetchCities(provinceId: string): Promise<CityOption[]> {
  const cached = citiesCache.get(provinceId)
  if (cached) return cached
  let promise = citiesPromises.get(provinceId)
  if (!promise) {
    promise = (async () => {
      const r = await fetch(`/api/locations/cities?provinceId=${encodeURIComponent(provinceId)}`)
      if (!r.ok) throw new Error('Villes indisponibles.')
      const data = await r.json()
      const cities: CityOption[] = data.cities ?? []
      citiesCache.set(provinceId, cities)
      return cities
    })().catch((e) => { citiesPromises.delete(provinceId); throw e })
    citiesPromises.set(provinceId, promise)
  }
  return promise
}

async function fetchNeighborhoods(cityId: string): Promise<NeighborhoodOption[]> {
  const cached = neighborhoodsCache.get(cityId)
  if (cached) return cached
  let promise = neighborhoodsPromises.get(cityId)
  if (!promise) {
    promise = (async () => {
      const r = await fetch(`/api/locations/neighborhoods?cityId=${encodeURIComponent(cityId)}`)
      if (!r.ok) throw new Error('Quartiers indisponibles.')
      const data = await r.json()
      const neighborhoods: NeighborhoodOption[] = data.neighborhoods ?? []
      neighborhoodsCache.set(cityId, neighborhoods)
      return neighborhoods
    })().catch((e) => { neighborhoodsPromises.delete(cityId); throw e })
    neighborhoodsPromises.set(cityId, promise)
  }
  return promise
}

export function LocationPicker({ value, onChange, placeholder = 'Votre localisation', variant = 'popover', className }: LocationPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const open = popoverOpen || drawerOpen

  const [provinces, setProvinces] = useState<ProvinceOption[]>(() => provincesCache ?? [])
  const [cities, setCities] = useState<CityOption[]>([])
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodOption[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [neighborhoodsLoading, setNeighborhoodsLoading] = useState(false)

  // Pending cascading selection — not committed to onChange until the user
  // picks a search result or presses "Utiliser cette localisation".
  const [pendingProvinceId, setPendingProvinceId] = useState('')
  const [pendingCityId, setPendingCityId] = useState('')
  const [pendingNeighborhoodId, setPendingNeighborhoodId] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [showSuggestForm, setShowSuggestForm] = useState(false)
  const [suggestType, setSuggestType] = useState<'CITY' | 'NEIGHBORHOOD'>('CITY')
  const [suggestProvinceId, setSuggestProvinceId] = useState('')
  const [suggestCityId, setSuggestCityId] = useState('')
  const [suggestCities, setSuggestCities] = useState<CityOption[]>([])
  const [suggestName, setSuggestName] = useState('')
  const [suggestExtra, setSuggestExtra] = useState('')
  const [suggestSubmitting, setSuggestSubmitting] = useState(false)

  const triggerLabel = value?.displayName?.trim() || placeholder

  // Load provinces once (module cache) whenever the picker is opened.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchProvinces()
      .then((list) => { if (!cancelled) setProvinces(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les provinces.') })
    return () => { cancelled = true }
  }, [open])

  // Seed the pending cascading selection from the committed value each time
  // the picker (re)opens, and reset transient UI (search, suggestion form).
  useEffect(() => {
    if (!open) return
    setPendingProvinceId(value?.provinceId || '')
    setPendingCityId(value?.cityId || '')
    setPendingNeighborhoodId(value?.neighborhoodId || '')
    setSearchQuery('')
    setSearchResults([])
    setShowSuggestForm(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Cities depend on the pending province only.
  useEffect(() => {
    if (!open || !pendingProvinceId) { setCities([]); return }
    let cancelled = false
    setCitiesLoading(true)
    fetchCities(pendingProvinceId)
      .then((list) => { if (!cancelled) setCities(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les villes.') })
      .finally(() => { if (!cancelled) setCitiesLoading(false) })
    return () => { cancelled = true }
  }, [open, pendingProvinceId])

  // Neighborhoods depend on the pending city only.
  useEffect(() => {
    if (!open || !pendingCityId) { setNeighborhoods([]); return }
    let cancelled = false
    setNeighborhoodsLoading(true)
    fetchNeighborhoods(pendingCityId)
      .then((list) => { if (!cancelled) setNeighborhoods(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les quartiers.') })
      .finally(() => { if (!cancelled) setNeighborhoodsLoading(false) })
    return () => { cancelled = true }
  }, [open, pendingCityId])

  // Debounced free-text search (250ms, min 2 chars).
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return }
    let cancelled = false
    const controller = new AbortController()
    setSearchLoading(true)
    const timer = setTimeout(() => {
      fetch(`/api/locations/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error('Recherche indisponible.')
          const data = await r.json()
          if (!cancelled) setSearchResults(data.results ?? [])
        })
        .catch((e) => {
          if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return
          console.error(e)
          toast.error('Recherche de localisation indisponible.')
        })
        .finally(() => { if (!cancelled) setSearchLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [searchQuery])

  // Suggestion form's own city list, scoped to whichever province the user
  // picked inside the form (may differ from the main cascading selection).
  useEffect(() => {
    if (!showSuggestForm || suggestType !== 'NEIGHBORHOOD' || !suggestProvinceId) { setSuggestCities([]); return }
    let cancelled = false
    fetchCities(suggestProvinceId)
      .then((list) => { if (!cancelled) setSuggestCities(list) })
      .catch((e) => { console.error(e); if (!cancelled) toast.error('Impossible de charger les villes.') })
    return () => { cancelled = true }
  }, [showSuggestForm, suggestType, suggestProvinceId])

  function closeAll() {
    setPopoverOpen(false)
    setDrawerOpen(false)
  }

  function handleProvinceChange(id: string) {
    setPendingProvinceId(id)
    // Explicit clear: switching province must clear city + neighborhood.
    setPendingCityId('')
    setPendingNeighborhoodId('')
    setNeighborhoods([])
  }

  function handleCityChange(id: string) {
    setPendingCityId(id)
    // Explicit clear: switching city must clear neighborhood.
    setPendingNeighborhoodId('')
  }

  function resolvePendingNameParts(): LocationNameParts {
    const province = provinces.find((p) => p.id === pendingProvinceId)
    const city = cities.find((c) => c.id === pendingCityId)
    const neighborhood = neighborhoods.find((n) => n.id === pendingNeighborhoodId)
    if (neighborhood) return { name: neighborhood.name, cityName: city?.name, provinceName: province?.name }
    if (city) return { name: city.name, provinceName: province?.name }
    if (province) return { name: province.name }
    return {}
  }

  function commitPending() {
    if (!pendingProvinceId) return
    const parts = resolvePendingNameParts()
    const displayName = formatLocationLabel(parts, 'short') || placeholder
    onChange({
      provinceId: pendingProvinceId,
      cityId: pendingCityId || null,
      neighborhoodId: pendingNeighborhoodId || null,
      displayName,
    })
    closeAll()
  }

  function selectSearchResult(r: LocationSearchResult) {
    const displayName = formatLocationLabel(r, 'short') || r.displayShort
    onChange({
      // Keep the full parent id chain regardless of which level matched the
      // search: a 'city' result also carries its provinceId, and a
      // 'neighborhood' result also carries its cityId + provinceId (both
      // returned by GET /api/locations/search). Without this, a
      // search-selected value would silently drop province/city scoping
      // that consumers (profile-form, pro-dossier, recherche-client) rely on.
      provinceId: r.type === 'province' ? r.id : r.provinceId,
      cityId: r.type === 'city' ? r.id : r.cityId,
      neighborhoodId: r.type === 'neighborhood' ? r.id : null,
      displayName,
    })
    setSearchQuery('')
    setSearchResults([])
    closeAll()
  }

  function openSuggestForm() {
    setShowSuggestForm(true)
    setSuggestType('CITY')
    setSuggestProvinceId(pendingProvinceId || '')
    setSuggestCityId('')
    setSuggestName('')
    setSuggestExtra('')
  }

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault()
    if (!suggestProvinceId || !suggestName.trim() || (suggestType === 'NEIGHBORHOOD' && !suggestCityId)) return
    setSuggestSubmitting(true)
    try {
      const res = await fetch('/api/location-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: suggestType,
          provinceId: suggestProvinceId,
          cityId: suggestType === 'NEIGHBORHOOD' ? suggestCityId : undefined,
          proposedName: suggestName.trim(),
          extraInfo: suggestExtra.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Suggestion impossible.'); return }

      if (data.status === 'created') {
        toast.success('Merci ! Votre proposition a été envoyée à notre équipe. Elle apparaîtra sur AlloPro après validation.')
        setShowSuggestForm(false)
        setSuggestName('')
        setSuggestExtra('')
        return
      }

      if (data.status === 'exists') {
        toast.info(suggestType === 'NEIGHBORHOOD' ? 'Ce quartier existe déjà.' : 'Cette ville existe déjà.')
        const province = provinces.find((p) => p.id === suggestProvinceId)
        const city = suggestCities.find((c) => c.id === suggestCityId)
        const parts: LocationNameParts = suggestType === 'NEIGHBORHOOD'
          ? { name: data.existing.name, cityName: city?.name, provinceName: province?.name }
          : { name: data.existing.name, provinceName: province?.name }
        onChange({
          provinceId: suggestProvinceId,
          cityId: suggestType === 'NEIGHBORHOOD' ? suggestCityId : data.existing.id,
          neighborhoodId: suggestType === 'NEIGHBORHOOD' ? data.existing.id : null,
          displayName: formatLocationLabel(parts, 'short') || data.existing.name,
        })
        setShowSuggestForm(false)
        closeAll()
        return
      }

      if (data.status === 'already_pending') {
        // Informational only: nothing is created, and the picker stays open
        // so the user can keep looking for/picking something else.
        toast.info('Cette localisation a déjà été proposée et est actuellement en cours de validation.')
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
        <button type="button" className="ap-input flex items-center justify-between gap-2 text-left" aria-label="Choisir une localisation">
          <span className="flex min-w-0 items-center gap-2">
            <MapPin size={18} className="shrink-0 text-emerald-dark" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
        </button>
      )
    }
    return (
      <button type="button" className="ap-secondary rounded-full !px-4" aria-label="Choisir une localisation">
        <MapPin size={16} className="shrink-0" />
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{triggerLabel}</span>
        <ChevronDown size={14} className="shrink-0 opacity-70" />
      </button>
    )
  }

  function renderSearchAndCascade(inDrawer: boolean) {
    return (
      <>
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="ap-input pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une ville, un quartier…"
            aria-label="Rechercher une localisation"
          />
        </div>

        {searchQuery.trim().length >= 2 && (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-white">
            {searchLoading && <p className="p-3 text-sm text-muted-foreground">Recherche…</p>}
            {!searchLoading && searchResults.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Aucun résultat pour « {searchQuery.trim()} ».</p>
            )}
            {!searchLoading && searchResults.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0 hover:bg-emerald-50"
                onClick={() => selectSearchResult(r)}
              >
                <span className="text-sm font-semibold text-foreground">{r.displayShort}</span>
                <span className="text-xs text-muted-foreground">{r.displayFull}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4">
          <label className="ap-label">
            Province
            <select className="ap-input mt-1.5" value={pendingProvinceId} onChange={(e) => handleProvinceChange(e.target.value)}>
              <option value="">Sélectionner une province</option>
              {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="ap-label">
            Ville
            <select className="ap-input mt-1.5" value={pendingCityId} onChange={(e) => handleCityChange(e.target.value)} disabled={!pendingProvinceId || citiesLoading}>
              <option value="">{citiesLoading ? 'Chargement…' : 'Sélectionner une ville'}</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="ap-label">
            Quartier <span className="font-normal text-muted-foreground">(facultatif)</span>
            <select className="ap-input mt-1.5" value={pendingNeighborhoodId} onChange={(e) => setPendingNeighborhoodId(e.target.value)} disabled={!pendingCityId || neighborhoodsLoading}>
              <option value="">{neighborhoodsLoading ? 'Chargement…' : 'Sélectionner un quartier'}</option>
              {neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </label>
        </div>

        {!inDrawer && (
          <button type="button" className="ap-button w-full" disabled={!pendingProvinceId} onClick={commitPending}>
            Utiliser cette localisation
          </button>
        )}
      </>
    )
  }

  function renderNotFoundSection() {
    if (!showSuggestForm) {
      return (
        <div className="border-t border-border/60 pt-4 text-sm">
          <p className="text-muted-foreground">Vous ne trouvez pas votre localisation ?</p>
          <button type="button" className="mt-1 font-semibold text-emerald-dark hover:underline" onClick={openSuggestForm}>
            + Ajouter une ville ou un quartier
          </button>
        </div>
      )
    }
    return (
      <form onSubmit={submitSuggestion} className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Proposer une localisation</p>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowSuggestForm(false)}>Annuler</button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={cn('min-h-9 flex-1 rounded-lg border px-3 text-sm font-semibold transition-colors', suggestType === 'CITY' ? 'border-emerald-dark bg-emerald-dark text-white' : 'border-border bg-white text-muted-foreground')}
            onClick={() => { setSuggestType('CITY'); setSuggestCityId('') }}
          >
            Une ville
          </button>
          <button
            type="button"
            className={cn('min-h-9 flex-1 rounded-lg border px-3 text-sm font-semibold transition-colors', suggestType === 'NEIGHBORHOOD' ? 'border-emerald-dark bg-emerald-dark text-white' : 'border-border bg-white text-muted-foreground')}
            onClick={() => setSuggestType('NEIGHBORHOOD')}
          >
            Un quartier
          </button>
        </div>
        <label className="ap-label">
          Province *
          <select className="ap-input mt-1.5" required value={suggestProvinceId} onChange={(e) => { setSuggestProvinceId(e.target.value); setSuggestCityId('') }}>
            <option value="">Sélectionner une province</option>
            {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {suggestType === 'NEIGHBORHOOD' && (
          <label className="ap-label">
            Ville *
            <select className="ap-input mt-1.5" required value={suggestCityId} onChange={(e) => setSuggestCityId(e.target.value)} disabled={!suggestProvinceId}>
              <option value="">Sélectionner une ville</option>
              {suggestCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="ap-label">
          {suggestType === 'NEIGHBORHOOD' ? 'Nom du quartier *' : 'Nom de la ville *'}
          <input
            className="ap-input mt-1.5"
            required
            value={suggestName}
            onChange={(e) => setSuggestName(e.target.value)}
            placeholder={suggestType === 'NEIGHBORHOOD' ? 'Ex. Nzeng-Ayong' : 'Ex. Lambaréné'}
            maxLength={80}
          />
        </label>
        <label className="ap-label">
          Informations complémentaires (facultatif)
          <textarea
            className="ap-input mt-1.5"
            value={suggestExtra}
            onChange={(e) => setSuggestExtra(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Repère, quartier voisin…"
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
          <PopoverContent align="start" className="w-[22rem] max-w-[90vw] rounded-2xl border-border/60 p-4">
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
              {renderSearchAndCascade(false)}
              {renderNotFoundSection()}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile: near-fullscreen Drawer */}
      <div className="md:hidden">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>Choisissez votre localisation</DrawerTitle>
              <DrawerDescription>Recherchez ou parcourez les provinces, villes et quartiers.</DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              {renderSearchAndCascade(true)}
              {renderNotFoundSection()}
            </div>
            <DrawerFooter>
              <button type="button" className="ap-button w-full" disabled={!pendingProvinceId} onClick={commitPending}>
                Utiliser cette localisation
              </button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  )
}
