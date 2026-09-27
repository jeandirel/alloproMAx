'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { bookingStatus, paymentStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'

type BookingRow = {
  id: string
  code: string
  status: string
  paymentStatus: string
  address: string
  quartier: string
  totalPrice: number
  date: string
}

export function ReservationsClient({ isProfessional }: { isProfessional: boolean }) {
  const [view, setView] = useState<'client' | 'professional'>('client')
  const [rows, setRows] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/marketplace/bookings${view === 'professional' ? '?view=professional' : ''}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
        if (!cancelled) setRows(data.bookings)
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
  }, [view])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Mes réservations</h1>
        {isProfessional && (
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
            <button onClick={() => setView('client')} className={`rounded-md px-3 py-1 ${view === 'client' ? 'bg-white shadow' : 'text-gray-600'}`}>
              Comme client
            </button>
            <button onClick={() => setView('professional')} className={`rounded-md px-3 py-1 ${view === 'professional' ? 'bg-white shadow' : 'text-gray-600'}`}>
              Comme professionnel
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <div className="ap-panel text-center text-sm text-gray-500">Aucune réservation pour le moment.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/marketplace/reservations/${b.id}`} className="ap-panel block hover:border-emerald-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{b.code}</p>
                    <p className="text-xs text-gray-500">
                      {b.address}, {b.quartier}
                    </p>
                  </div>
                  <StatusPillFor map={bookingStatus} status={b.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{formatFCFA(b.totalPrice)}</span>
                  <StatusPillFor map={paymentStatus} status={b.paymentStatus} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
