'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { serviceRequestStatus, offerStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'

type OpenRequest = {
  id: string
  title: string
  description: string
  address: string | null
  quartier: string | null
  budgetMinAmount: number | null
  budgetMaxAmount: number | null
  urgent: boolean
  status: string
  category: { name: string }
  subcategory: { name: string } | null
}

type MyOffer = {
  id: string
  serviceRequestId: string
  amount: number
  status: string
  createdAt: string
  serviceRequest: { title: string; status: string }
}

export function OffresClient() {
  const [tab, setTab] = useState<'open' | 'mine'>('open')
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([])
  const [myOffers, setMyOffers] = useState<MyOffer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        if (tab === 'open') {
          const res = await fetch('/api/marketplace/service-requests?view=professional')
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
          if (!cancelled) setOpenRequests(data.serviceRequests)
        } else {
          const res = await fetch('/api/marketplace/offers?view=mine')
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
          if (!cancelled) setMyOffers(data.offers)
        }
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
  }, [tab])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Offres</h1>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
          <button onClick={() => setTab('open')} className={`rounded-md px-3 py-1 ${tab === 'open' ? 'bg-white shadow' : 'text-gray-600'}`}>
            Demandes ouvertes
          </button>
          <button onClick={() => setTab('mine')} className={`rounded-md px-3 py-1 ${tab === 'mine' ? 'bg-white shadow' : 'text-gray-600'}`}>
            Mes offres
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : tab === 'open' ? (
        openRequests.length === 0 ? (
          <div className="ap-panel text-center text-sm text-gray-500">Aucune demande ouverte dans votre catégorie pour le moment.</div>
        ) : (
          <ul className="space-y-3">
            {openRequests.map((r) => (
              <li key={r.id}>
                <Link href={`/marketplace/demandes/${r.id}`} className="ap-panel block hover:border-emerald-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-500">
                        {r.category.name}
                        {r.subcategory ? ` · ${r.subcategory.name}` : ''}
                      </p>
                    </div>
                    <StatusPillFor map={serviceRequestStatus} status={r.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">{r.description}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {r.address ?? ''}
                      {r.quartier ? `, ${r.quartier}` : ''}
                    </span>
                    {(r.budgetMinAmount || r.budgetMaxAmount) && (
                      <span>
                        Budget : {r.budgetMinAmount ? formatFCFA(r.budgetMinAmount) : '?'} – {r.budgetMaxAmount ? formatFCFA(r.budgetMaxAmount) : '?'}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : myOffers.length === 0 ? (
        <div className="ap-panel text-center text-sm text-gray-500">Vous n’avez soumis aucune offre pour le moment.</div>
      ) : (
        <ul className="space-y-3">
          {myOffers.map((o) => (
            <li key={o.id}>
              <Link href={`/marketplace/demandes/${o.serviceRequestId}`} className="ap-panel block hover:border-emerald-200">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-900">{o.serviceRequest.title}</p>
                  <StatusPillFor map={offerStatus} status={o.status} />
                </div>
                <p className="mt-2 text-lg font-bold text-emerald-900">{formatFCFA(o.amount)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
