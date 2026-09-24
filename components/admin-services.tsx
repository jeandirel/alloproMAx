'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// STANDALONE COMPONENT — not wired into admin-dashboard.tsx yet (deliberately;
// see the services-catalogue Part 1 report — admin-dashboard.tsx wiring is
// deferred to a follow-up pass to avoid clashing with a concurrent, unrelated
// location-feature workflow editing that same file). Mirrors
// components/admin-locations.tsx almost line-for-line for the suggestions
// moderation half, and adds a full Category -> Subcategory -> Service
// catalogue-management view on top (list/edit/activate/deactivate/reorder/
// move/keywords+synonyms), backed by GET/PATCH on /api/admin/services
// (POST already existed; GET + PATCH were added alongside this component
// since the catalogue-management view has no working UI without them).
// ---------------------------------------------------------------------------

type Suggestion = {
  id: string
  categoryId: string | null
  categoryName: string | null
  subcategoryId: string | null
  subcategoryName: string | null
  proposedName: string
  normalizedName: string
  description: string | null
  submittedBy: string | null
  submitterName: string | null
  submitterEmail: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  adminComment: string | null
  reviewedBy: string | null
  reviewerName: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}
type SuggestionCounts = { pending: number; approved: number; rejected: number; catalogServices: number }
type Category = { id: string; name: string; slug: string; icon: string | null; description: string | null }
type Subcategory = { id: string; name: string; slug: string; categoryId: string }

// Catalogue-management tree (GET /api/admin/services).
type TreeService = {
  id: string; name: string; slug: string; description: string | null
  keywords: string[]; synonyms: string[]; isActive: boolean; sortOrder: number
  subcategoryId: string; categoryId: string
}
type TreeSubcategory = {
  id: string; name: string; slug: string; description: string | null
  isActive: boolean; sortOrder: number; categoryId: string; services: TreeService[]
}
type TreeCategory = {
  id: string; name: string; slug: string; icon: string | null
  active: boolean; position: number; subcategories: TreeSubcategory[]
}
type CatalogueCounts = { categories: number; subcategories: number; services: number }

const SUB_TABS: { id: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'; label: string }[] = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'PENDING', label: 'En attente' },
  { id: 'APPROVED', label: 'Approuvées' },
  { id: 'REJECTED', label: 'Refusées' },
]
const STATUS_BADGE: Record<Suggestion['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-emerald-100 text-emerald-900',
  REJECTED: 'bg-red-100 text-red-900',
}
const STATUS_LABEL: Record<Suggestion['status'], string> = { PENDING: 'En attente', APPROVED: 'Approuvée', REJECTED: 'Refusée' }

async function patchCatalogue(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/services', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || 'Modification impossible.')
  return data
}

export function AdminServices() {
  const [view, setView] = useState<'SUGGESTIONS' | 'CATALOGUE'>('SUGGESTIONS')
  const [subTab, setSubTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionCounts, setSuggestionCounts] = useState<SuggestionCounts | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [subcategoryPickId, setSubcategoryPickId] = useState<Record<string, string>>({})
  const [rejectingId, setRejectingId] = useState('')
  const [rejectComment, setRejectComment] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const [treeCategories, setTreeCategories] = useState<TreeCategory[]>([])
  const [catalogueCounts, setCatalogueCounts] = useState<CatalogueCounts | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    try {
      const qs = subTab === 'ALL' ? '' : `?status=${subTab}`
      const r = await fetch(`/api/admin/service-suggestions${qs}`, { cache: 'no-store' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setSuggestions(data.suggestions)
      setSuggestionCounts(data.counts)
    } catch (e) {
      console.error(e)
      toast.error('Impossible de charger les suggestions.')
    } finally {
      setLoading(false)
    }
  }, [subTab])
  useEffect(() => { void loadSuggestions() }, [loadSuggestions])

  const loadTree = useCallback(async () => {
    setTreeLoading(true)
    try {
      const r = await fetch('/api/admin/services', { cache: 'no-store' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setTreeCategories(data.categories)
      setCatalogueCounts(data.counts)
    } catch (e) {
      console.error(e)
      toast.error('Impossible de charger le catalogue.')
    } finally {
      setTreeLoading(false)
    }
  }, [])
  // Fetched once on mount (not lazily on tab switch): the overview cards need
  // categories/subcategories/services counts regardless of which sub-view is
  // showing.
  useEffect(() => { void loadTree() }, [loadTree])

  const approve = async (s: Suggestion) => {
    setBusyId(s.id)
    try {
      const correctedName = editingId === s.id && editName.trim() && editName.trim() !== s.proposedName ? editName.trim() : undefined
      const subcategoryId = !s.subcategoryId ? (subcategoryPickId[s.id] || undefined) : undefined
      const r = await fetch(`/api/admin/service-suggestions/${s.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctedName, subcategoryId }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success('Suggestion approuvée.')
      setEditingId('')
      setEditName('')
      await loadSuggestions()
      await loadTree()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approbation impossible.')
    } finally {
      setBusyId('')
    }
  }

  const reject = async (s: Suggestion) => {
    setBusyId(s.id)
    try {
      const r = await fetch(`/api/admin/service-suggestions/${s.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminComment: rejectComment.trim() || undefined }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success('Suggestion refusée.')
      setRejectingId('')
      setRejectComment('')
      await loadSuggestions()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refus impossible.')
    } finally {
      setBusyId('')
    }
  }

  return <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: 'Suggestions en attente', value: suggestionCounts?.pending ?? '—' },
        { label: 'Catégories', value: catalogueCounts?.categories ?? '—' },
        { label: 'Sous-catégories', value: catalogueCounts?.subcategories ?? '—' },
        { label: 'Services au catalogue', value: catalogueCounts?.services ?? '—' },
      ].map(s => <div key={s.label} className="ap-panel"><strong className="text-3xl text-emerald-dark">{s.value}</strong><p className="text-sm mt-3 text-muted-foreground">{s.label}</p></div>)}
    </div>

    <div className="ap-tabs">
      <button className={view === 'SUGGESTIONS' ? 'ap-button' : 'ap-secondary'} onClick={() => setView('SUGGESTIONS')}>Suggestions</button>
      <button className={view === 'CATALOGUE' ? 'ap-button' : 'ap-secondary'} onClick={() => setView('CATALOGUE')}>Gestion du catalogue</button>
    </div>

    {view === 'SUGGESTIONS' && <>
      <div className="ap-tabs">{SUB_TABS.map(t => <button key={t.id} className={subTab === t.id ? 'ap-button' : 'ap-secondary'} onClick={() => setSubTab(t.id)}>{t.label}</button>)}</div>
      <div className="ap-panel overflow-x-auto">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {!loading && !suggestions.length && <p className="text-sm text-muted-foreground">Aucune suggestion pour ce filtre.</p>}
        {!loading && !!suggestions.length && <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th className="py-2 pr-3">Nom proposé</th><th className="py-2 pr-3">Catégorie</th><th className="py-2 pr-3">Sous-catégorie</th><th className="py-2 pr-3">Auteur</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Statut</th><th className="py-2 pr-3">Actions</th></tr></thead>
          <tbody>{suggestions.map(s => <tr key={s.id} className="border-b last:border-0 align-top">
            <td className="py-3 pr-3 min-w-40">{editingId === s.id
              ? <input className="ap-input" value={editName} onChange={e => setEditName(e.target.value)} />
              : s.proposedName}
              {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
            </td>
            <td className="py-3 pr-3">{s.categoryName || '—'}</td>
            <td className="py-3 pr-3 min-w-48">{s.subcategoryName || (s.status === 'PENDING'
              ? <SubcategoryPicker categoryId={s.categoryId} value={subcategoryPickId[s.id] || ''} onChange={(v) => setSubcategoryPickId(prev => ({ ...prev, [s.id]: v }))} />
              : '—')}</td>
            <td className="py-3 pr-3">{s.submitterEmail || s.submitterName || 'Anonyme'}</td>
            <td className="py-3 pr-3 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString('fr-FR')}</td>
            <td className="py-3 pr-3"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
            <td className="py-3 pr-3 min-w-56">
              {s.status === 'PENDING' && <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button className="ap-secondary" disabled={busyId === s.id} onClick={() => { if (editingId === s.id) { setEditingId(''); setEditName('') } else { setEditingId(s.id); setEditName(s.proposedName) } }}>Modifier</button>
                  <button className="ap-button" disabled={busyId === s.id || (!s.subcategoryId && !subcategoryPickId[s.id])} onClick={() => void approve(s)}>Approuver</button>
                  <button className="ap-secondary" disabled={busyId === s.id} onClick={() => { if (rejectingId === s.id) { setRejectingId(''); setRejectComment('') } else { setRejectingId(s.id); setRejectComment('') } }}>Refuser</button>
                </div>
                {!s.subcategoryId && <p className="text-xs text-muted-foreground">Choisissez une sous-catégorie avant d'approuver.</p>}
                {rejectingId === s.id && <div className="flex flex-col gap-2">
                  <textarea className="ap-input" placeholder="Motif facultatif" value={rejectComment} onChange={e => setRejectComment(e.target.value)} />
                  <button className="ap-secondary" disabled={busyId === s.id} onClick={() => void reject(s)}>Confirmer le refus</button>
                </div>}
              </div>}
              {s.status !== 'PENDING' && s.adminComment && <p className="text-xs text-muted-foreground">{s.adminComment}</p>}
            </td>
          </tr>)}</tbody>
        </table>}
      </div>
      <div className="ap-panel">
        <div className="flex justify-between items-center gap-3"><h2 className="font-bold">Ajouter au catalogue</h2><button className="ap-secondary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Fermer' : '+ Ajouter au catalogue'}</button></div>
        {showAdd && <AddServiceForm onCreated={() => { void loadSuggestions(); void loadTree() }} />}
      </div>
    </>}

    {view === 'CATALOGUE' && <CatalogueManager categories={treeCategories} loading={treeLoading} onReload={loadTree} />}
  </div>
}

// Small helper used only inline in the suggestions table above, for
// suggestions that were submitted with a category but no subcategory (or
// with neither) — an admin must pick one before the row can be approved,
// since app/api/admin/service-suggestions/[id]/approve requires it.
function SubcategoryPicker({ categoryId, value, onChange }: { categoryId: string | null; value: string; onChange: (id: string) => void }) {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!categoryId) { setSubcategories([]); return }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const r = await fetch(`/api/services/subcategories?categoryId=${categoryId}`, { cache: 'no-store' })
        const data = await r.json()
        if (r.ok && !cancelled) setSubcategories(data.subcategories)
      } catch (e) { console.error(e) } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [categoryId])

  if (!categoryId) return <span className="text-xs text-muted-foreground">Aucune catégorie proposée — refuser ou modifier.</span>
  return <select className="ap-input" value={value} onChange={e => onChange(e.target.value)} disabled={loading}>
    <option value="">{loading ? 'Chargement…' : 'Sélectionner…'}</option>
    {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select>
}

function AddServiceForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<'SUBCATEGORY' | 'SERVICE'>('SERVICE')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void (async () => {
    try {
      const r = await fetch('/api/services/categories', { cache: 'no-store' })
      const data = await r.json()
      if (r.ok) setCategories(data.categories)
    } catch (e) { console.error(e) }
  })() }, [])
  useEffect(() => {
    setSubcategoryId('')
    if (!categoryId) { setSubcategories([]); return }
    void (async () => {
      try {
        const r = await fetch(`/api/services/subcategories?categoryId=${categoryId}`, { cache: 'no-store' })
        const data = await r.json()
        if (r.ok) setSubcategories(data.subcategories)
      } catch (e) { console.error(e) }
    })()
  }, [categoryId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name,
          description: description.trim() || undefined,
          categoryId: type === 'SUBCATEGORY' ? categoryId : undefined,
          subcategoryId: type === 'SERVICE' ? subcategoryId : undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success(type === 'SUBCATEGORY' ? 'Sous-catégorie créée.' : 'Service créé.')
      setName('')
      setDescription('')
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Création impossible.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="mt-4 space-y-3 max-w-xl" onSubmit={submit}>
    {/* Type is Sous-catégorie/Service only — Category is intentionally not
        creatable here (see app/api/admin/services/route.ts: the 13
        top-level categories are a fixed, product-decided taxonomy). */}
    <label className="ap-label">Type<select className="ap-input mt-2" value={type} onChange={e => setType(e.target.value as typeof type)}>
      <option value="SUBCATEGORY">Sous-catégorie</option>
      <option value="SERVICE">Service</option>
    </select></label>
    <label className="ap-label">Catégorie<select required className="ap-input mt-2" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
      <option value="">Sélectionner…</option>
      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    {type === 'SERVICE' && <label className="ap-label">Sous-catégorie<select required className="ap-input mt-2" value={subcategoryId} onChange={e => setSubcategoryId(e.target.value)} disabled={!categoryId}>
      <option value="">Sélectionner…</option>
      {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>}
    <label className="ap-label">Nom<input required className="ap-input mt-2" value={name} onChange={e => setName(e.target.value)} placeholder={type === 'SUBCATEGORY' ? 'Nom de la sous-catégorie' : 'Nom du service'} maxLength={80} /></label>
    <label className="ap-label">Description (facultatif)<textarea className="ap-input mt-2" value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={2000} /></label>
    <button className="ap-button" disabled={busy}>Créer</button>
  </form>
}

// ---------------------------------------------------------------------------
// Catalogue management: Category -> Subcategory -> Service tree, with
// activate/deactivate, reorder (up/down among siblings), inline edit
// (name/description/keywords/synonyms), and moving a service to a different
// subcategory. Backed by GET/PATCH /api/admin/services.
// ---------------------------------------------------------------------------

function CatalogueManager({ categories, loading, onReload }: { categories: TreeCategory[]; loading: boolean; onReload: () => Promise<void> }) {
  const [openCategoryId, setOpenCategoryId] = useState('')
  const [busyId, setBusyId] = useState('')

  const [editingCategoryId, setEditingCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')

  const [openSubcategoryId, setOpenSubcategoryId] = useState('')
  const [editingSubcategoryId, setEditingSubcategoryId] = useState('')
  const [subcategoryName, setSubcategoryName] = useState('')
  const [subcategoryDescription, setSubcategoryDescription] = useState('')

  const [editingServiceId, setEditingServiceId] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [serviceKeywords, setServiceKeywords] = useState('')
  const [serviceSynonyms, setServiceSynonyms] = useState('')
  const [serviceMoveTo, setServiceMoveTo] = useState('')

  const allSubcategories = categories.flatMap(c => c.subcategories.map(s => ({ ...s, categoryName: c.name })))

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : 'Action impossible.') } finally { setBusyId('') }
  }

  async function toggleActive(type: 'CATEGORY' | 'SUBCATEGORY' | 'SERVICE', id: string, isActive: boolean) {
    await withBusy(id, async () => {
      await patchCatalogue({ id, type, isActive: !isActive })
      toast.success(!isActive ? 'Activé.' : 'Désactivé.')
      await onReload()
    })
  }

  async function reorder(type: 'CATEGORY' | 'SUBCATEGORY' | 'SERVICE', siblings: { id: string; order: number }[], index: number, dir: -1 | 1) {
    const otherIndex = index + dir
    if (otherIndex < 0 || otherIndex >= siblings.length) return
    const a = siblings[index]
    const b = siblings[otherIndex]
    await withBusy(a.id, async () => {
      await Promise.all([
        patchCatalogue({ id: a.id, type, sortOrder: b.order }),
        patchCatalogue({ id: b.id, type, sortOrder: a.order }),
      ])
      await onReload()
    })
  }

  function startEditCategory(c: TreeCategory) { setEditingCategoryId(c.id); setCategoryName(c.name) }
  async function saveCategory(c: TreeCategory) {
    await withBusy(c.id, async () => {
      const name = categoryName.trim()
      if (name && name !== c.name) await patchCatalogue({ id: c.id, type: 'CATEGORY', name })
      toast.success('Catégorie mise à jour.')
      setEditingCategoryId('')
      await onReload()
    })
  }

  function startEditSubcategory(s: TreeSubcategory) { setEditingSubcategoryId(s.id); setSubcategoryName(s.name); setSubcategoryDescription(s.description || '') }
  async function saveSubcategory(s: TreeSubcategory) {
    await withBusy(s.id, async () => {
      const name = subcategoryName.trim()
      await patchCatalogue({
        id: s.id, type: 'SUBCATEGORY',
        name: name && name !== s.name ? name : undefined,
        description: subcategoryDescription.trim() !== (s.description || '') ? (subcategoryDescription.trim() || null) : undefined,
      })
      toast.success('Sous-catégorie mise à jour.')
      setEditingSubcategoryId('')
      await onReload()
    })
  }

  function startEditService(sv: TreeService) {
    setEditingServiceId(sv.id)
    setServiceName(sv.name)
    setServiceDescription(sv.description || '')
    setServiceKeywords(sv.keywords.join(', '))
    setServiceSynonyms(sv.synonyms.join(', '))
    setServiceMoveTo(sv.subcategoryId)
  }
  async function saveService(sv: TreeService) {
    await withBusy(sv.id, async () => {
      const name = serviceName.trim()
      const keywords = serviceKeywords.split(',').map(k => k.trim()).filter(Boolean)
      const synonyms = serviceSynonyms.split(',').map(k => k.trim()).filter(Boolean)
      await patchCatalogue({
        id: sv.id, type: 'SERVICE',
        name: name && name !== sv.name ? name : undefined,
        description: serviceDescription.trim() !== (sv.description || '') ? (serviceDescription.trim() || null) : undefined,
        keywords, synonyms,
        subcategoryId: serviceMoveTo && serviceMoveTo !== sv.subcategoryId ? serviceMoveTo : undefined,
      })
      toast.success('Service mis à jour.')
      setEditingServiceId('')
      await onReload()
    })
  }

  if (loading && !categories.length) return <div className="ap-panel"><p className="text-sm text-muted-foreground">Chargement du catalogue…</p></div>
  if (!categories.length) return <div className="ap-panel"><p className="text-sm text-muted-foreground">Catalogue vide.</p></div>

  return <div className="ap-panel space-y-2">
    <h2 className="font-bold mb-2">Catégories, sous-catégories et services</h2>
    {categories.map((c, cIndex) => <div key={c.id} className="border-t pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <button className="text-left flex-1 min-w-40 font-semibold" onClick={() => setOpenCategoryId(openCategoryId === c.id ? '' : c.id)}>
          {openCategoryId === c.id ? '▾' : '▸'} {c.name}
        </button>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${c.active ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{c.active ? 'Active' : 'Désactivée'}</span>
        <span className="text-xs text-muted-foreground">{c.subcategories.length} sous-catégorie(s)</span>
        <div className="flex gap-1">
          <button className="ap-secondary !min-h-8 !px-2" disabled={busyId === c.id || cIndex === 0} onClick={() => void reorder('CATEGORY', categories.map(x => ({ id: x.id, order: x.position })), cIndex, -1)}>↑</button>
          <button className="ap-secondary !min-h-8 !px-2" disabled={busyId === c.id || cIndex === categories.length - 1} onClick={() => void reorder('CATEGORY', categories.map(x => ({ id: x.id, order: x.position })), cIndex, 1)}>↓</button>
        </div>
        <button className="ap-secondary" disabled={busyId === c.id} onClick={() => editingCategoryId === c.id ? setEditingCategoryId('') : startEditCategory(c)}>Modifier</button>
        <button className="ap-secondary" disabled={busyId === c.id} onClick={() => void toggleActive('CATEGORY', c.id, c.active)}>{c.active ? 'Désactiver' : 'Activer'}</button>
      </div>
      {editingCategoryId === c.id && <div className="mt-2 flex flex-wrap gap-2 items-center">
        <input className="ap-input flex-1 min-w-40" value={categoryName} onChange={e => setCategoryName(e.target.value)} maxLength={80} />
        <button className="ap-button" disabled={busyId === c.id} onClick={() => void saveCategory(c)}>Enregistrer</button>
      </div>}

      {openCategoryId === c.id && <div className="mt-3 ml-4 space-y-2">
        {!c.subcategories.length && <p className="text-xs text-muted-foreground">Aucune sous-catégorie.</p>}
        {c.subcategories.map((s, sIndex) => <div key={s.id} className="border-t pt-2 first:border-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <button className="text-left flex-1 min-w-40 font-medium" onClick={() => setOpenSubcategoryId(openSubcategoryId === s.id ? '' : s.id)}>
              {openSubcategoryId === s.id ? '▾' : '▸'} {s.name}
            </button>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{s.isActive ? 'Active' : 'Désactivée'}</span>
            <span className="text-xs text-muted-foreground">{s.services.length} service(s)</span>
            <div className="flex gap-1">
              <button className="ap-secondary !min-h-8 !px-2" disabled={busyId === s.id || sIndex === 0} onClick={() => void reorder('SUBCATEGORY', c.subcategories.map(x => ({ id: x.id, order: x.sortOrder })), sIndex, -1)}>↑</button>
              <button className="ap-secondary !min-h-8 !px-2" disabled={busyId === s.id || sIndex === c.subcategories.length - 1} onClick={() => void reorder('SUBCATEGORY', c.subcategories.map(x => ({ id: x.id, order: x.sortOrder })), sIndex, 1)}>↓</button>
            </div>
            <button className="ap-secondary" disabled={busyId === s.id} onClick={() => editingSubcategoryId === s.id ? setEditingSubcategoryId('') : startEditSubcategory(s)}>Modifier</button>
            <button className="ap-secondary" disabled={busyId === s.id} onClick={() => void toggleActive('SUBCATEGORY', s.id, s.isActive)}>{s.isActive ? 'Désactiver' : 'Activer'}</button>
          </div>
          {editingSubcategoryId === s.id && <div className="mt-2 space-y-2">
            <input className="ap-input" value={subcategoryName} onChange={e => setSubcategoryName(e.target.value)} maxLength={80} placeholder="Nom" />
            <textarea className="ap-input" value={subcategoryDescription} onChange={e => setSubcategoryDescription(e.target.value)} rows={2} maxLength={2000} placeholder="Description (facultatif)" />
            <button className="ap-button" disabled={busyId === s.id} onClick={() => void saveSubcategory(s)}>Enregistrer</button>
          </div>}

          {openSubcategoryId === s.id && <div className="mt-2 ml-4 space-y-2">
            {!s.services.length && <p className="text-xs text-muted-foreground">Aucun service.</p>}
            {s.services.map((sv, svIndex) => <div key={sv.id} className="border-t pt-2 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-40 text-sm">{sv.name}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${sv.isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{sv.isActive ? 'Actif' : 'Désactivé'}</span>
                <div className="flex gap-1">
                  <button className="ap-secondary !min-h-8 !px-2" disabled={busyId === sv.id || svIndex === 0} onClick={() => void reorder('SERVICE', s.services.map(x => ({ id: x.id, order: x.sortOrder })), svIndex, -1)}>↑</button>
                  <button className="ap-secondary !min-h-8 !px-2" disabled={busyId === sv.id || svIndex === s.services.length - 1} onClick={() => void reorder('SERVICE', s.services.map(x => ({ id: x.id, order: x.sortOrder })), svIndex, 1)}>↓</button>
                </div>
                <button className="ap-secondary" disabled={busyId === sv.id} onClick={() => editingServiceId === sv.id ? setEditingServiceId('') : startEditService(sv)}>Modifier</button>
                <button className="ap-secondary" disabled={busyId === sv.id} onClick={() => void toggleActive('SERVICE', sv.id, sv.isActive)}>{sv.isActive ? 'Désactiver' : 'Activer'}</button>
              </div>
              {editingServiceId === sv.id && <div className="mt-2 space-y-2 max-w-xl">
                <label className="ap-label">Nom<input className="ap-input mt-1" value={serviceName} onChange={e => setServiceName(e.target.value)} maxLength={80} /></label>
                <label className="ap-label">Description<textarea className="ap-input mt-1" value={serviceDescription} onChange={e => setServiceDescription(e.target.value)} rows={2} maxLength={2000} /></label>
                <label className="ap-label">Mots-clés (séparés par des virgules)<input className="ap-input mt-1" value={serviceKeywords} onChange={e => setServiceKeywords(e.target.value)} placeholder="ex. debouchage, canalisation" /></label>
                <label className="ap-label">Synonymes (séparés par des virgules)<input className="ap-input mt-1" value={serviceSynonyms} onChange={e => setServiceSynonyms(e.target.value)} /></label>
                <label className="ap-label">Déplacer vers une autre sous-catégorie
                  <select className="ap-input mt-1" value={serviceMoveTo} onChange={e => setServiceMoveTo(e.target.value)}>
                    {allSubcategories.map(opt => <option key={opt.id} value={opt.id}>{opt.categoryName} · {opt.name}</option>)}
                  </select>
                </label>
                <button className="ap-button" disabled={busyId === sv.id} onClick={() => void saveService(sv)}>Enregistrer</button>
              </div>}
            </div>)}
          </div>}
        </div>)}
      </div>}
    </div>)}
  </div>
}
