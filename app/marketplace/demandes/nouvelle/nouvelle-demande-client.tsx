'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Category = { id: string; name: string }
type Subcategory = { id: string; name: string }

export function NouvelleDemandeClient() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [quartier, setQuartier] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/services/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => toast.error('Catégories indisponibles.'))
  }, [])

  useEffect(() => {
    setSubcategoryId('')
    if (!categoryId) {
      setSubcategories([])
      return
    }
    fetch(`/api/services/subcategories?categoryId=${categoryId}`)
      .then((r) => r.json())
      .then((d) => setSubcategories(d.subcategories ?? []))
      .catch(() => setSubcategories([]))
  }, [categoryId])

  async function submit(publish: boolean) {
    if (!categoryId) return toast.error('Choisissez une catégorie.')
    if (!title.trim() || !description.trim()) return toast.error('Titre et description requis.')
    if (!address.trim() || !quartier.trim()) return toast.error('Adresse et quartier requis (nécessaires pour accepter une offre plus tard).')
    setSubmitting(true)
    try {
      const createRes = await fetch('/api/marketplace/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          categoryId,
          subcategoryId: subcategoryId || undefined,
          title: title.trim(),
          description: description.trim(),
          address: address.trim(),
          quartier: quartier.trim(),
          budgetMinAmount: budgetMin ? Number(budgetMin) : undefined,
          budgetMaxAmount: budgetMax ? Number(budgetMax) : undefined,
          urgent,
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData?.error || 'Création impossible.')
      const id = createData.serviceRequest.id

      if (publish) {
        const pubRes = await fetch('/api/marketplace/service-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'publish', serviceRequestId: id }),
        })
        const pubData = await pubRes.json()
        if (!pubRes.ok) throw new Error(pubData?.error || 'Publication impossible.')
      }

      toast.success(publish ? 'Demande publiée — les professionnels peuvent maintenant proposer une offre.' : 'Brouillon enregistré.')
      router.push(`/marketplace/demandes/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Nouvelle demande de service</h1>

      <div className="ap-panel space-y-4">
        <div>
          <label className="ap-label">Catégorie</label>
          <select className="ap-input mt-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choisir…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {subcategories.length > 0 && (
          <div>
            <label className="ap-label">Sous-catégorie (optionnel)</label>
            <select className="ap-input mt-2" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
              <option value="">Aucune</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="ap-label">Titre</label>
          <input className="ap-input mt-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Réparation de fuite d'eau" maxLength={200} />
        </div>

        <div>
          <label className="ap-label">Description</label>
          <textarea className="ap-input mt-2" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ap-label">Adresse</label>
            <input className="ap-input mt-2" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
          </div>
          <div>
            <label className="ap-label">Quartier</label>
            <input className="ap-input mt-2" value={quartier} onChange={(e) => setQuartier(e.target.value)} maxLength={150} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ap-label">Budget min. (FCFA)</label>
            <input className="ap-input mt-2" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </div>
          <div>
            <label className="ap-label">Budget max. (FCFA)</label>
            <input className="ap-input mt-2" type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Demande urgente
        </label>

        <div className="flex gap-3">
          <button disabled={submitting} onClick={() => submit(true)} className="ap-button flex-1">
            Publier la demande
          </button>
          <button disabled={submitting} onClick={() => submit(false)} className="ap-secondary flex-1">
            Enregistrer en brouillon
          </button>
        </div>
      </div>
    </div>
  )
}
