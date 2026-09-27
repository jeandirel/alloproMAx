'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { serviceRequestStatus, offerStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'
import { ContactUnlockPanel } from '@/components/marketplace/contact-unlock-panel'

type ClientOffer = {
  id: string
  amount: number
  message: string | null
  status: string
  version: number
  professional: { id: string; headline: string | null; user: { name: string | null } }
}

type MyOffer = { id: string; amount: number; message: string | null; status: string; version: number }

type ClientServiceRequest = {
  id: string
  title: string
  description: string
  status: string
  category: { name: string }
  offers: ClientOffer[]
  booking: { id: string } | null
}

type ProfessionalServiceRequest = {
  id: string
  title: string
  description: string
  status: string
  category: { name: string }
  subcategory: { name: string } | null
  myOffers: MyOffer[]
}

type Detail = ClientServiceRequest | ProfessionalServiceRequest

function isClientView(d: Detail): d is ClientServiceRequest {
  return 'offers' in d
}

export function DemandeDetailClient({ serviceRequestId }: { serviceRequestId: string }) {
  const router = useRouter()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerMessage, setOfferMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/marketplace/service-requests/${serviceRequestId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
      setDetail(data.serviceRequest)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [serviceRequestId])

  useEffect(() => {
    load()
  }, [load])

  async function acceptOffer(offerId: string) {
    setBusy(offerId)
    try {
      const res = await fetch('/api/marketplace/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', offerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Acceptation impossible.')
      toast.success('Offre acceptée — passez au paiement pour confirmer la réservation.')
      router.push(`/marketplace/reservations/${data.booking.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
      setBusy(null)
    }
  }

  async function rejectOffer(offerId: string) {
    setBusy(offerId)
    try {
      const res = await fetch('/api/marketplace/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', offerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Refus impossible.')
      toast.success('Offre refusée.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function cancelRequest() {
    setBusy('cancel')
    try {
      const res = await fetch('/api/marketplace/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', serviceRequestId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Annulation impossible.')
      toast.success('Demande annulée.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function submitOrReviseOffer(existingOfferId?: string) {
    const amount = Number(offerAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) return toast.error('Montant invalide.')
    setBusy('offer-form')
    try {
      const body = existingOfferId
        ? { action: 'revise', offerId: existingOfferId, amount, message: offerMessage || undefined }
        : { action: 'submit', serviceRequestId, amount, message: offerMessage || undefined }
      const res = await fetch('/api/marketplace/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Envoi impossible.')
      toast.success(existingOfferId ? 'Offre mise à jour.' : 'Offre envoyée au client.')
      setOfferAmount('')
      setOfferMessage('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function withdrawOffer(offerId: string) {
    setBusy(offerId)
    try {
      const res = await fetch('/api/marketplace/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw', offerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Retrait impossible.')
      toast.success('Offre retirée.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>
  if (!detail) return <p className="text-sm text-gray-500">Demande introuvable.</p>

  return (
    <div className="space-y-4">
      <div className="ap-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{detail.title}</h1>
            <p className="text-xs text-gray-500">{detail.category.name}</p>
          </div>
          <StatusPillFor map={serviceRequestStatus} status={detail.status} />
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{detail.description}</p>
      </div>

      {isClientView(detail) ? (
        <>
          {detail.booking && (
            <Link href={`/marketplace/reservations/${detail.booking.id}`} className="ap-panel block bg-emerald-50 text-sm font-semibold text-emerald-900">
              Une offre a été acceptée — voir la réservation →
            </Link>
          )}

          {(detail.status === 'open' || detail.status === 'negotiating' || detail.status === 'draft') && (
            <button disabled={busy === 'cancel'} onClick={cancelRequest} className="ap-secondary text-sm">
              Annuler la demande
            </button>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Offres reçues ({detail.offers.length})</h2>
            {detail.offers.length === 0 && <p className="text-sm text-gray-500">Aucune offre pour le moment.</p>}
            {detail.offers.map((offer) => (
              <div key={offer.id} className="ap-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{offer.professional.user.name ?? 'Professionnel'}</p>
                    {offer.professional.headline && <p className="text-xs text-gray-500">{offer.professional.headline}</p>}
                  </div>
                  <StatusPillFor map={offerStatus} status={offer.status} />
                </div>
                <p className="mt-2 text-lg font-bold text-emerald-900">{formatFCFA(offer.amount)}</p>
                {offer.message && <p className="mt-1 text-sm text-gray-600">{offer.message}</p>}
                <ContactUnlockPanel professionalId={offer.professional.id} />
                {offer.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <button disabled={busy === offer.id} onClick={() => acceptOffer(offer.id)} className="ap-button flex-1 text-sm">
                      Accepter et payer
                    </button>
                    <button disabled={busy === offer.id} onClick={() => rejectOffer(offer.id)} className="ap-secondary flex-1 text-sm">
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Mes offres sur cette demande</h2>
          {detail.myOffers.map((offer) => (
            <div key={offer.id} className="ap-panel">
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-emerald-900">{formatFCFA(offer.amount)}</p>
                <StatusPillFor map={offerStatus} status={offer.status} />
              </div>
              {offer.message && <p className="mt-1 text-sm text-gray-600">{offer.message}</p>}
              {offer.status === 'pending' && (
                <button disabled={busy === offer.id} onClick={() => withdrawOffer(offer.id)} className="ap-secondary mt-2 text-sm">
                  Retirer l’offre
                </button>
              )}
            </div>
          ))}

          {!detail.myOffers.some((o) => o.status === 'pending') && (detail.status === 'open' || detail.status === 'negotiating') && (
            <div className="ap-panel space-y-3">
              <p className="text-sm font-semibold text-gray-900">
                {detail.myOffers.length > 0 ? 'Proposer une nouvelle offre' : 'Faire une offre'}
              </p>
              <input
                type="number"
                min={1}
                className="ap-input"
                placeholder="Montant en FCFA"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
              />
              <textarea
                className="ap-input"
                rows={3}
                placeholder="Message au client (optionnel)"
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
              />
              <button disabled={busy === 'offer-form'} onClick={() => submitOrReviseOffer()} className="ap-button w-full text-sm">
                Envoyer l’offre
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
