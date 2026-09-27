'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { serviceRequestStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'

type ServiceRequestRow = {
  id: string
  title: string
  status: string
  urgent: boolean
  budgetMinAmount: number | null
  budgetMaxAmount: number | null
  createdAt: string
  category: { name: string }
  offers: { id: string; status: string }[]
}

export function DemandesClient() {
  const [rows, setRows] = useState<ServiceRequestRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/marketplace/service-requests')
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
        if (!cancelled) setRows(data.serviceRequests)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Chargement impossible.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Mes demandes</h1>
        <Link href="/marketplace/demandes/nouvelle" className="ap-button">
          Nouvelle demande
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <div className="ap-panel text-center text-sm text-gray-500">
          Aucune demande pour le moment. Créez-en une pour recevoir des offres de professionnels.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const pendingOffers = r.offers.filter((o) => o.status === 'pending').length
            return (
              <li key={r.id}>
                <Link href={`/marketplace/demandes/${r.id}`} className="ap-panel block hover:border-emerald-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-500">{r.category.name}</p>
                    </div>
                    <StatusPillFor map={serviceRequestStatus} status={r.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {r.budgetMinAmount || r.budgetMaxAmount
                        ? `Budget : ${r.budgetMinAmount ? formatFCFA(r.budgetMinAmount) : '…'} – ${
                            r.budgetMaxAmount ? formatFCFA(r.budgetMaxAmount) : '…'
                          }`
                        : 'Budget non précisé'}
                    </span>
                    {pendingOffers > 0 && (
                      <span className="font-semibold text-emerald-700">
                        {pendingOffers} offre{pendingOffers > 1 ? 's' : ''} en attente
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
