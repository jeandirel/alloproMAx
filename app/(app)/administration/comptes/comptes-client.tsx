'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Search, ShieldAlert, Wrench } from 'lucide-react'
import { PageHeading } from '@/components/market-ui'

interface UserRow {
  id: string
  name: string | null
  email: string
  phone: string | null
  role: string
  accountStatus: string
  suspended: boolean
  suspensionReason: string | null
  createdAt: string
  lastLoginAt: string | null
  professional: { id: string; paused: boolean; suspended: boolean; deletedAt: string | null } | null
}

const statusOptions = [
  { value: '', label: 'Tous les statuts' },
  { value: 'active', label: 'Actif' },
  { value: 'paused', label: 'En pause' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'deletion_requested', label: 'Suppression demandée' },
  { value: 'deleted', label: 'Supprimé' },
]

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-900',
  paused: 'bg-amber-100 text-amber-900',
  suspended: 'bg-red-50 text-red-800',
  deletion_requested: 'bg-orange-100 text-orange-900',
  deleted: 'bg-gray-100 text-gray-700',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ComptesClient() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const pageSize = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      if (status) params.set('status', status)
      const res = await fetch(`/api/admin/users?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur de chargement')
      setRows(data.users)
      setTotal(data.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [page, q, status])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function act(key: string, url: string, body: unknown, successMessage: string) {
    setBusy(key)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Une erreur est survenue.')
      toast.success(successMessage)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  function promptReason(): string | null {
    const reason = window.prompt('Motif de la suspension (visible en interne uniquement) :')
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) toast.error('Un motif d’au moins 3 caractères est requis.')
      return null
    }
    return reason.trim()
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="ap-page max-w-4xl">
      <PageHeading back="/administration" title="Modération des comptes" subtitle="Recherchez un compte, suspendez ou réactivez un utilisateur ou un profil professionnel." />

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="ap-input pl-10"
            placeholder="Nom, e-mail ou téléphone…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value) }}
          />
        </div>
        <select className="ap-input w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
          {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun compte ne correspond à cette recherche.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((u) => (
            <div key={u.id} className="ap-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{u.name || 'Sans nom'} <span className="text-xs font-normal text-muted-foreground">· {u.role}</span></p>
                  <p className="text-sm text-muted-foreground"><span suppressHydrationWarning>{u.email}</span>{u.phone ? ` · ${u.phone}` : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">Inscrit le {formatDate(u.createdAt)} · Dernière connexion {formatDate(u.lastLoginAt)}</p>
                  {u.suspensionReason && <p className="text-xs text-red-700 mt-1">Motif : {u.suspensionReason}</p>}
                </div>
                <span className={`shrink-0 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[u.accountStatus] || 'bg-gray-100 text-gray-700'}`}>
                  {statusOptions.find((o) => o.value === u.accountStatus)?.label || u.accountStatus}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/60">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><ShieldAlert size={14} />Compte</span>
                {u.suspended ? (
                  <button className="ap-secondary text-xs px-3 py-1.5 min-h-0" disabled={busy === `u-${u.id}`} onClick={() => act(`u-${u.id}`, `/api/admin/users/${u.id}/unsuspend`, undefined, 'Compte réactivé')}>
                    Réactiver
                  </button>
                ) : (
                  <button
                    className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-700 font-semibold disabled:opacity-50"
                    disabled={busy === `u-${u.id}`}
                    onClick={() => { const reason = promptReason(); if (reason) act(`u-${u.id}`, `/api/admin/users/${u.id}/suspend`, { reason }, 'Compte suspendu') }}
                  >
                    Suspendre
                  </button>
                )}

                {u.professional && !u.professional.deletedAt && (
                  <>
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 ml-2"><Wrench size={14} />Profil pro</span>
                    {u.professional.suspended ? (
                      <button className="ap-secondary text-xs px-3 py-1.5 min-h-0" disabled={busy === `p-${u.id}`} onClick={() => act(`p-${u.id}`, `/api/admin/professionals/${u.professional!.id}/unsuspend`, undefined, 'Profil professionnel réactivé')}>
                        Réactiver
                      </button>
                    ) : (
                      <button
                        className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-700 font-semibold disabled:opacity-50"
                        disabled={busy === `p-${u.id}`}
                        onClick={() => { const reason = promptReason(); if (reason) act(`p-${u.id}`, `/api/admin/professionals/${u.professional!.id}/suspend`, { reason }, 'Profil professionnel suspendu') }}
                      >
                        Suspendre
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button className="ap-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
          <span className="text-muted-foreground">Page {page} / {totalPages}</span>
          <button className="ap-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
        </div>
      )}
    </div>
  )
}
