'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type Suggestion = {
  id: string
  type: 'CITY' | 'NEIGHBORHOOD'
  proposedName: string
  provinceName: string | null
  cityName: string | null
  submitterName: string | null
  submitterEmail: string | null
  submittedBy: string | null
  createdAt: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  adminComment: string | null
}
type Counts = { pending: number; approved: number; rejected: number; cities: number; neighborhoods: number }
type Province = { id: string; name: string; slug: string }
type City = { id: string; name: string; slug: string; provinceId: string }

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

export function AdminLocations() {
  const [subTab, setSubTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [rejectingId, setRejectingId] = useState('')
  const [rejectComment, setRejectComment] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = subTab === 'ALL' ? '' : `?status=${subTab}`
      const r = await fetch(`/api/admin/location-suggestions${qs}`, { cache: 'no-store' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setSuggestions(data.suggestions)
      setCounts(data.counts)
    } catch (e) {
      console.error(e)
      toast.error('Impossible de charger les suggestions.')
    } finally {
      setLoading(false)
    }
  }, [subTab])
  useEffect(() => { void load() }, [load])

  const approve = async (s: Suggestion) => {
    setBusyId(s.id)
    try {
      const correctedName = editingId === s.id && editName.trim() && editName.trim() !== s.proposedName ? editName.trim() : undefined
      const r = await fetch(`/api/admin/location-suggestions/${s.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctedName }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success('Suggestion approuvée.')
      setEditingId('')
      setEditName('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approbation impossible.')
    } finally {
      setBusyId('')
    }
  }

  const reject = async (s: Suggestion) => {
    setBusyId(s.id)
    try {
      const r = await fetch(`/api/admin/location-suggestions/${s.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminComment: rejectComment.trim() || undefined }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success('Suggestion refusée.')
      setRejectingId('')
      setRejectComment('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refus impossible.')
    } finally {
      setBusyId('')
    }
  }

  return <div className="space-y-5">
    <div className="grid grid-cols-3 gap-4">
      {[
        { label: 'Suggestions en attente', value: counts?.pending ?? '—' },
        { label: 'Villes actives', value: counts?.cities ?? '—' },
        { label: 'Quartiers actifs', value: counts?.neighborhoods ?? '—' },
      ].map(s => <div key={s.label} className="ap-panel"><strong className="text-3xl text-emerald-dark">{s.value}</strong><p className="text-sm mt-3 text-muted-foreground">{s.label}</p></div>)}
    </div>
    <div className="ap-tabs">{SUB_TABS.map(t => <button key={t.id} className={subTab === t.id ? 'ap-button' : 'ap-secondary'} onClick={() => setSubTab(t.id)}>{t.label}</button>)}</div>
    <div className="ap-panel overflow-x-auto">
      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {!loading && !suggestions.length && <p className="text-sm text-muted-foreground">Aucune suggestion pour ce filtre.</p>}
      {!loading && !!suggestions.length && <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Nom proposé</th><th className="py-2 pr-3">Province</th><th className="py-2 pr-3">Ville</th><th className="py-2 pr-3">Auteur</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Statut</th><th className="py-2 pr-3">Actions</th></tr></thead>
        <tbody>{suggestions.map(s => <tr key={s.id} className="border-b last:border-0 align-top">
          <td className="py-3 pr-3">{s.type === 'CITY' ? 'Ville' : 'Quartier'}</td>
          <td className="py-3 pr-3 min-w-40">{editingId === s.id
            ? <input className="ap-input" value={editName} onChange={e => setEditName(e.target.value)} />
            : s.proposedName}</td>
          <td className="py-3 pr-3">{s.provinceName || '—'}</td>
          <td className="py-3 pr-3">{s.cityName || '—'}</td>
          <td className="py-3 pr-3">{s.submitterEmail || s.submitterName || 'Anonyme'}</td>
          <td className="py-3 pr-3 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString('fr-FR')}</td>
          <td className="py-3 pr-3"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
          <td className="py-3 pr-3 min-w-56">
            {s.status === 'PENDING' && <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button className="ap-secondary" disabled={busyId === s.id} onClick={() => { if (editingId === s.id) { setEditingId(''); setEditName('') } else { setEditingId(s.id); setEditName(s.proposedName) } }}>Modifier</button>
                <button className="ap-button" disabled={busyId === s.id} onClick={() => void approve(s)}>Approuver</button>
                <button className="ap-secondary" disabled={busyId === s.id} onClick={() => { if (rejectingId === s.id) { setRejectingId(''); setRejectComment('') } else { setRejectingId(s.id); setRejectComment('') } }}>Refuser</button>
              </div>
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
      <div className="flex justify-between items-center gap-3"><h2 className="font-bold">Ajouter une localisation</h2><button className="ap-secondary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Fermer' : '+ Ajouter une localisation'}</button></div>
      {showAdd && <AddLocationForm onCreated={() => void load()} />}
    </div>
  </div>
}

function AddLocationForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<'PROVINCE' | 'CITY' | 'NEIGHBORHOOD'>('CITY')
  const [name, setName] = useState('')
  const [provinces, setProvinces] = useState<Province[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [provinceId, setProvinceId] = useState('')
  const [cityId, setCityId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void (async () => {
    try {
      const r = await fetch('/api/locations/provinces', { cache: 'no-store' })
      const data = await r.json()
      if (r.ok) setProvinces(data.provinces)
    } catch (e) { console.error(e) }
  })() }, [])
  useEffect(() => {
    setCityId('')
    if (type !== 'NEIGHBORHOOD' || !provinceId) { setCities([]); return }
    void (async () => {
      try {
        const r = await fetch(`/api/locations/cities?provinceId=${provinceId}`, { cache: 'no-store' })
        const data = await r.json()
        if (r.ok) setCities(data.cities)
      } catch (e) { console.error(e) }
    })()
  }, [type, provinceId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, provinceId: type !== 'PROVINCE' ? provinceId : undefined, cityId: type === 'NEIGHBORHOOD' ? cityId : undefined }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success('Localisation créée.')
      setName('')
      setProvinceId('')
      setCityId('')
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Création impossible.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="mt-4 space-y-3 max-w-xl" onSubmit={submit}>
    <label className="ap-label">Type<select className="ap-input mt-2" value={type} onChange={e => setType(e.target.value as typeof type)}>
      <option value="PROVINCE">Province</option>
      <option value="CITY">Ville</option>
      <option value="NEIGHBORHOOD">Quartier</option>
    </select></label>
    {type !== 'PROVINCE' && <label className="ap-label">Province<select required className="ap-input mt-2" value={provinceId} onChange={e => setProvinceId(e.target.value)}>
      <option value="">Sélectionner…</option>
      {provinces.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>}
    {type === 'NEIGHBORHOOD' && <label className="ap-label">Ville<select required className="ap-input mt-2" value={cityId} onChange={e => setCityId(e.target.value)} disabled={!provinceId}>
      <option value="">Sélectionner…</option>
      {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>}
    <label className="ap-label">Nom<input required className="ap-input mt-2" value={name} onChange={e => setName(e.target.value)} placeholder="Nom de la localisation" /></label>
    <button className="ap-button" disabled={busy}>Créer</button>
  </form>
}
