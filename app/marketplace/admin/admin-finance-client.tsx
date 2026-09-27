'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { payoutStatus, disputeStatus, ledgerEntryTypeLabel } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'

type Settings = { platformCommissionBps: number; contactUnlockFeeAmount: number; autoCompleteHours: number; currency: string; version: number }
type Category = { id: string; name: string }
type Subcategory = { id: string; name: string }
type LedgerEntry = { id: string; bookingId: string | null; type: string; amount: number; currency: string; description: string | null; createdAt: string }
type Payout = { id: string; bookingId: string | null; amount: number; status: string; phoneNumber: string | null; booking: { code: string } | null }
type DisputeRow = { id: string; reason: string; status: string; createdAt: string; booking: { code: string } }

const TABS = ['reglages', 'commissions', 'ledger', 'versements', 'litiges'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  reglages: 'Réglages',
  commissions: 'Commissions',
  ledger: 'Grand livre',
  versements: 'Versements',
  litiges: 'Litiges',
}

export function AdminFinanceClient() {
  const [tab, setTab] = useState<Tab>('reglages')

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Finance admin</h1>
      <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-white shadow' : 'text-gray-600'}`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'reglages' && <SettingsPanel />}
      {tab === 'commissions' && <CommissionsPanel />}
      {tab === 'ledger' && <LedgerPanel />}
      {tab === 'versements' && <PayoutsPanel />}
      {tab === 'litiges' && <DisputesPanel />}
    </div>
  )
}

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [commissionBps, setCommissionBps] = useState('')
  const [contactFee, setContactFee] = useState('')
  const [autoCompleteHours, setAutoCompleteHours] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/marketplace/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings)
        setCommissionBps(String(data.settings.platformCommissionBps))
        setContactFee(String(data.settings.contactUnlockFeeAmount))
        setAutoCompleteHours(String(data.settings.autoCompleteHours))
      })
      .catch(() => toast.error('Chargement des réglages impossible.'))
  }, [])

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/marketplace/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformCommissionBps: Number(commissionBps),
          contactUnlockFeeAmount: Number(contactFee),
          autoCompleteHours: Number(autoCompleteHours),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Enregistrement impossible.')
      setSettings(data.settings)
      toast.success('Réglages mis à jour.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <p className="text-sm text-gray-500">Chargement…</p>

  return (
    <div className="ap-panel space-y-3">
      <div>
        <label className="ap-label">Commission plateforme (points de base, /10000)</label>
        <input className="ap-input mt-1" type="number" min={0} max={10000} value={commissionBps} onChange={(e) => setCommissionBps(e.target.value)} />
      </div>
      <div>
        <label className="ap-label">Frais de déblocage de contact (FCFA)</label>
        <input className="ap-input mt-1" type="number" min={0} value={contactFee} onChange={(e) => setContactFee(e.target.value)} />
      </div>
      <div>
        <label className="ap-label">Validation automatique après (heures)</label>
        <input className="ap-input mt-1" type="number" min={1} value={autoCompleteHours} onChange={(e) => setAutoCompleteHours(e.target.value)} />
      </div>
      <p className="text-xs text-gray-500">Version actuelle : {settings.version}</p>
      <button onClick={save} disabled={busy} className="ap-button text-sm">
        Enregistrer
      </button>
    </div>
  )
}

function CommissionsPanel() {
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [targetType, setTargetType] = useState<'category' | 'subcategory'>('category')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [bps, setBps] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/services/categories')
      .then((r) => r.json())
      .then((data) => setCategories(data.categories))
      .catch(() => toast.error('Chargement des catégories impossible.'))
  }, [])

  useEffect(() => {
    if (targetType !== 'subcategory' || !categoryId) {
      setSubcategories([])
      return
    }
    fetch(`/api/services/subcategories?categoryId=${categoryId}`)
      .then((r) => r.json())
      .then((data) => setSubcategories(data.subcategories))
      .catch(() => toast.error('Chargement des sous-catégories impossible.'))
  }, [targetType, categoryId])

  async function apply() {
    const targetId = targetType === 'category' ? categoryId : subcategoryId
    if (!targetId) return toast.error('Sélectionnez une cible.')
    setBusy(true)
    try {
      const res = await fetch('/api/marketplace/admin/commission-override', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, commissionBpsOverride: bps.trim() === '' ? null : Number(bps) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Mise à jour impossible.')
      setLastResult(data.updated.commissionBpsOverride)
      toast.success('Override de commission mis à jour.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ap-panel space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setTargetType('category')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${targetType === 'category' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 text-gray-600'}`}>
          Catégorie
        </button>
        <button onClick={() => setTargetType('subcategory')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${targetType === 'subcategory' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 text-gray-600'}`}>
          Sous-catégorie
        </button>
      </div>
      <div>
        <label className="ap-label">Catégorie</label>
        <select className="ap-input mt-1" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }}>
          <option value="">Choisir…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {targetType === 'subcategory' && (
        <div>
          <label className="ap-label">Sous-catégorie</label>
          <select className="ap-input mt-1" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId}>
            <option value="">Choisir…</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="ap-label">Override (points de base, vide = hérite du réglage global)</label>
        <input className="ap-input mt-1" type="number" min={0} max={10000} value={bps} onChange={(e) => setBps(e.target.value)} />
      </div>
      {lastResult !== undefined && <p className="text-xs text-gray-500">Valeur appliquée : {lastResult === null ? 'héritée (aucun override)' : `${lastResult} bps`}</p>}
      <button onClick={apply} disabled={busy} className="ap-button text-sm">
        Appliquer
      </button>
    </div>
  )
}

function LedgerPanel() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/marketplace/admin/ledger')
      .then((r) => r.json())
      .then((data) => setEntries(data.entries))
      .catch(() => toast.error('Chargement du grand livre impossible.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>
  if (entries.length === 0) return <div className="ap-panel text-center text-sm text-gray-500">Aucune écriture pour le moment.</div>

  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="ap-panel flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-gray-900">{ledgerEntryTypeLabel[e.type] ?? e.type}</p>
            <p className="text-xs text-gray-500">{e.description ?? (e.bookingId ? `Réservation ${e.bookingId}` : '')}</p>
          </div>
          <span className={e.amount >= 0 ? 'font-bold text-emerald-900' : 'font-bold text-red-700'}>{formatFCFA(e.amount)}</span>
        </li>
      ))}
    </ul>
  )
}

function PayoutsPanel() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/marketplace/admin/payouts')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
      setPayouts(data.payouts)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function retry(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/marketplace/payouts/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Relance impossible.')
      toast.success('Vérification relancée auprès de pawaPay.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>
  if (payouts.length === 0) return <div className="ap-panel text-center text-sm text-gray-500">Aucun versement à traiter.</div>

  return (
    <ul className="space-y-2">
      {payouts.map((p) => (
        <li key={p.id} className="ap-panel flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-gray-900">{p.booking?.code ?? p.bookingId ?? '—'}</p>
            <p className="text-xs text-gray-500">{formatFCFA(p.amount)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPillFor map={payoutStatus} status={p.status} />
            {p.status !== 'verse' && (
              <button onClick={() => retry(p.id)} disabled={busy === p.id} className="ap-secondary text-xs">
                Relancer
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function DisputesPanel() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/marketplace/disputes')
      .then((r) => r.json())
      .then((data) => setDisputes(data.disputes))
      .catch(() => toast.error('Chargement des litiges impossible.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>
  if (disputes.length === 0) return <div className="ap-panel text-center text-sm text-gray-500">Aucun litige ouvert.</div>

  return (
    <ul className="space-y-2">
      {disputes.map((d) => (
        <li key={d.id}>
          <Link href={`/marketplace/litiges/${d.id}`} className="ap-panel block hover:border-emerald-200">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">{d.booking.code}</p>
              <StatusPillFor map={disputeStatus} status={d.status} />
            </div>
            <p className="mt-1 text-sm text-gray-600">{d.reason}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
