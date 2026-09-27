'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { bookingStatus, paymentStatus, paymentAttemptStatus, disputeStatus, payoutStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'
import { MobileMoneyFields, isValidGabonMobile } from '@/components/marketplace/mobile-money-fields'
import { usePaymentAttemptPolling } from '@/hooks/use-payment-attempt-polling'

type Payout = {
  id: string
  amount: number
  currency: string
  status: string
  phone: string | null
  transactionRef: string | null
  processedAt: string | null
}

type Booking = {
  id: string
  code: string
  status: string
  paymentStatus: string
  address: string
  quartier: string
  date: string
  urgent: boolean
  basePrice: number
  serviceFee: number
  totalPrice: number
  completionProof: { id: string; autoCompleteDeadline: string; clientConfirmedAt: string | null } | null
  payout: Payout | null
}

type DisputeEvent = { id: string; actorRole: string; message: string; createdAt: string }
type Dispute = {
  id: string
  reason: string
  status: string
  decision: string | null
  decisionReason: string | null
  events: DisputeEvent[]
}

const MISSION_STEPS = ['en_attente', 'acceptee', 'en_route', 'en_cours', 'a_valider', 'validee', 'payee']

export function ReservationDetailClient({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<Booking | null>(null)
  const [viewerRole, setViewerRole] = useState<'client' | 'professionnel' | null>(null)
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [payMethod, setPayMethod] = useState<'airtel' | 'moov'>('airtel')
  const [payPhone, setPayPhone] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<'airtel' | 'moov'>('airtel')
  const [payoutPhone, setPayoutPhone] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeMessage, setDisputeMessage] = useState('')
  const [showDisputeForm, setShowDisputeForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const [bookingRes, disputeRes] = await Promise.all([
        fetch(`/api/marketplace/bookings/${bookingId}`),
        fetch(`/api/marketplace/bookings/${bookingId}/dispute`),
      ])
      const bookingData = await bookingRes.json()
      if (!bookingRes.ok) throw new Error(bookingData?.error || 'Chargement impossible.')
      setBooking(bookingData.booking)
      setViewerRole(bookingData.viewerRole)
      const disputeData = await disputeRes.json().catch(() => ({ dispute: null }))
      setDispute(disputeData.dispute ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    load()
  }, [load])

  const depositPolling = usePaymentAttemptPolling(`/api/marketplace/bookings/${bookingId}/payment`, () => load())
  const payoutPolling = usePaymentAttemptPolling(`/api/marketplace/bookings/${bookingId}/payout`, () => load())

  async function initiatePayment() {
    if (!isValidGabonMobile(payPhone)) return toast.error('Numéro Mobile Money invalide.')
    setBusy('payment')
    try {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initiate', method: payMethod, phone: payPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Paiement impossible.')
      if (data.attempt) {
        depositPolling.start(data.attempt)
        toast.info('Paiement envoyé — confirmez sur votre téléphone.')
      } else {
        toast.success(data.message || 'Acompte déjà payé.')
        await load()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function missionAction(action: 'start_route' | 'start_mission' | 'submit_completion' | 'validate_completion') {
    setBusy(action)
    try {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/mission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Action impossible.')
      toast.success('Mise à jour effectuée.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function initiatePayout() {
    if (!isValidGabonMobile(payoutPhone)) return toast.error('Numéro Mobile Money invalide.')
    setBusy('payout')
    try {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initiate', method: payoutMethod, phone: payoutPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Versement impossible.')
      if (data.attempt) {
        payoutPolling.start(data.attempt)
        toast.info('Demande de versement envoyée.')
      } else {
        toast.success('Versement déjà effectué.')
        await load()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function openDispute() {
    if (!disputeReason.trim()) return toast.error('Un motif est requis.')
    setBusy('dispute-open')
    try {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', reason: disputeReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ouverture du litige impossible.')
      toast.success('Litige ouvert — un administrateur va l’examiner.')
      setDisputeReason('')
      setShowDisputeForm(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function sendDisputeMessage() {
    if (!disputeMessage.trim()) return
    setBusy('dispute-message')
    try {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', message: disputeMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Envoi impossible.')
      setDisputeMessage('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>
  if (!booking || !viewerRole) return <p className="text-sm text-gray-500">Réservation introuvable.</p>

  const stepIndex = MISSION_STEPS.indexOf(booking.status)

  return (
    <div className="space-y-4">
      <div className="ap-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{booking.code}</h1>
            <p className="text-xs text-gray-500">
              {booking.address}, {booking.quartier}
            </p>
          </div>
          <StatusPillFor map={bookingStatus} status={booking.status} />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-bold text-emerald-900">{formatFCFA(booking.totalPrice)}</span>
          <StatusPillFor map={paymentStatus} status={booking.paymentStatus} />
        </div>
      </div>

      {booking.status !== 'litige' && booking.status !== 'annulee' && (
        <div className="ap-panel">
          <div className="flex items-center gap-1">
            {MISSION_STEPS.map((step, i) => (
              <div key={step} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-emerald-500' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      )}

      {viewerRole === 'client' && booking.status === 'en_attente' && booking.paymentStatus === 'a_payer' && (
        <div className="ap-panel space-y-3">
          <p className="text-sm font-semibold text-gray-900">Payer l’acompte pour confirmer la réservation</p>
          {depositPolling.attempt ? (
            <div className="space-y-2 text-sm">
              <StatusPillFor map={paymentAttemptStatus} status={depositPolling.attempt.status} />
              {depositPolling.polling && <p className="text-xs text-gray-500">Vérification en cours auprès de pawaPay…</p>}
              {depositPolling.attempt.status === 'FAILED' || depositPolling.attempt.status === 'REJECTED' ? (
                <button onClick={initiatePayment} disabled={busy === 'payment'} className="ap-button text-sm">
                  Réessayer le paiement
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <MobileMoneyFields method={payMethod} onMethodChange={setPayMethod} phone={payPhone} onPhoneChange={setPayPhone} disabled={busy === 'payment'} />
              <button onClick={initiatePayment} disabled={busy === 'payment'} className="ap-button w-full text-sm">
                Payer {formatFCFA(booking.totalPrice)}
              </button>
            </>
          )}
        </div>
      )}

      {viewerRole === 'professionnel' && booking.status === 'acceptee' && (
        <button onClick={() => missionAction('start_route')} disabled={busy === 'start_route'} className="ap-button w-full text-sm">
          Démarrer le trajet
        </button>
      )}
      {viewerRole === 'professionnel' && booking.status === 'en_route' && (
        <button onClick={() => missionAction('start_mission')} disabled={busy === 'start_mission'} className="ap-button w-full text-sm">
          Démarrer la mission
        </button>
      )}
      {viewerRole === 'professionnel' && booking.status === 'en_cours' && (
        <button onClick={() => missionAction('submit_completion')} disabled={busy === 'submit_completion'} className="ap-button w-full text-sm">
          Soumettre la fin de mission
        </button>
      )}
      {viewerRole === 'client' && booking.status === 'a_valider' && (
        <button onClick={() => missionAction('validate_completion')} disabled={busy === 'validate_completion'} className="ap-button w-full text-sm">
          Confirmer la fin de la mission
        </button>
      )}

      {viewerRole === 'professionnel' && booking.status === 'validee' && !booking.payout && (
        <div className="ap-panel space-y-3">
          <p className="text-sm font-semibold text-gray-900">Demander le versement</p>
          {payoutPolling.attempt ? (
            <div className="space-y-2 text-sm">
              <StatusPillFor map={paymentAttemptStatus} status={payoutPolling.attempt.status} />
              {payoutPolling.polling && <p className="text-xs text-gray-500">Vérification en cours auprès de pawaPay…</p>}
            </div>
          ) : (
            <>
              <MobileMoneyFields method={payoutMethod} onMethodChange={setPayoutMethod} phone={payoutPhone} onPhoneChange={setPayoutPhone} disabled={busy === 'payout'} />
              <button onClick={initiatePayout} disabled={busy === 'payout'} className="ap-button w-full text-sm">
                Demander le versement
              </button>
            </>
          )}
        </div>
      )}

      {booking.payout && (
        <div className="ap-panel flex items-center justify-between text-sm">
          <span>Versement professionnel : {formatFCFA(booking.payout.amount)}</span>
          <div className="flex items-center gap-2">
            <StatusPillFor map={payoutStatus} status={booking.payout.status} />
            {viewerRole === 'professionnel' && booking.payout.status === 'echoue' && (
              <button
                onClick={initiatePayout}
                disabled={busy === 'payout'}
                className="ap-secondary text-xs"
              >
                Réessayer
              </button>
            )}
          </div>
        </div>
      )}

      {dispute ? (
        <div className="ap-panel space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Litige</p>
            <StatusPillFor map={disputeStatus} status={dispute.status} />
          </div>
          <p className="text-sm text-gray-700">{dispute.reason}</p>
          {dispute.decision && (
            <p className="text-xs text-gray-500">
              Décision : {dispute.decision === 'refund' ? 'remboursement' : 'validation de la mission'} — {dispute.decisionReason}
            </p>
          )}
          <div className="space-y-2 border-t border-gray-100 pt-2">
            {dispute.events.map((ev) => (
              <div key={ev.id} className="text-xs">
                <span className="font-semibold capitalize">{ev.actorRole}</span> — {ev.message}
              </div>
            ))}
          </div>
          {dispute.status === 'ouvert' && (
            <div className="flex gap-2">
              <input className="ap-input flex-1 text-sm" placeholder="Ajouter un message" value={disputeMessage} onChange={(e) => setDisputeMessage(e.target.value)} />
              <button onClick={sendDisputeMessage} disabled={busy === 'dispute-message'} className="ap-secondary text-sm">
                Envoyer
              </button>
            </div>
          )}
        </div>
      ) : (
        booking.status !== 'annulee' && (
          <div className="ap-panel">
            {showDisputeForm ? (
              <div className="space-y-2">
                <textarea className="ap-input" rows={3} placeholder="Motif du litige" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={openDispute} disabled={busy === 'dispute-open'} className="ap-button flex-1 text-sm">
                    Ouvrir le litige
                  </button>
                  <button onClick={() => setShowDisputeForm(false)} className="ap-secondary flex-1 text-sm">
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowDisputeForm(true)} className="text-xs font-semibold text-red-700">
                Signaler un problème / ouvrir un litige
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}
